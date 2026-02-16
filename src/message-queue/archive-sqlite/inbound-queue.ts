/**
 * Inbound message queue implementation.
 *
 * Persists incoming messages before processing to prevent loss during
 * crashes or long-running AI processing operations.
 *
 * @module message-queue/inbound-queue
 */

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  EnqueueResult,
  DequeueResult,
  IMessageQueue,
  InboundQueuedMessage,
  QueueMetrics,
} from './types.js';
import { computeNextRetryAt, shouldRetry } from './backoff.js';
import { LockManager } from './lock-manager.js';

/**
 * Parameters for enqueueing an inbound message.
 */
export interface EnqueueInboundParams {
  sessionId: string;
  channel: string;
  fromAddress: string;
  chatId?: string;
  chatType?: 'dm' | 'group';
  body?: string;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
  maxRetries?: number;
}

/**
 * SQLite-backed inbound message queue.
 *
 * Features:
 * - Persistent storage with ACID guarantees
 * - Automatic retry with exponential backoff
 * - Dead letter queue for failed messages
 * - Session-based locking to prevent race conditions
 */
export class InboundMessageQueue implements IMessageQueue<InboundQueuedMessage> {
  private readonly lockManager: LockManager;

  constructor(private readonly db: DatabaseSync) {
    this.lockManager = new LockManager(db);
  }

  /**
   * Enqueue an inbound message for processing.
   *
   * @param params - Message parameters
   * @returns Enqueue result with message ID
   */
  async enqueue(params: EnqueueInboundParams): Promise<EnqueueResult> {
    const id = crypto.randomUUID();
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO inbound_message_queue
        (id, session_id, channel, from_address, chat_id, chat_type,
         body, media_urls, metadata, status, created_at, retry_count, max_retries)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?)
      `);

      stmt.run(
        id,
        params.sessionId,
        params.channel,
        params.fromAddress,
        params.chatId ?? null,
        params.chatType ?? null,
        params.body ?? null,
        params.mediaUrls ? JSON.stringify(params.mediaUrls) : null,
        params.metadata ? JSON.stringify(params.metadata) : null,
        now,
        params.maxRetries ?? 5,
      );

      return { id, queued: true };
    } catch (err) {
      return {
        id,
        queued: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Dequeue the next pending message for processing.
   *
   * Uses session-based locking to prevent race conditions.
   * Skips messages from locked sessions.
   *
   * @returns Dequeued message or null if queue is empty
   */
  async dequeue(): Promise<DequeueResult<InboundQueuedMessage>> {
    const now = Date.now();

    // Clean up expired locks first
    await this.lockManager.cleanupExpiredLocks();

    // Find next pending message (not from a locked session)
    const stmt = this.db.prepare(`
      SELECT * FROM inbound_message_queue
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
        AND session_id NOT IN (
          SELECT session_id FROM queue_processing_locks
          WHERE lock_type = 'inbound' AND lock_expires_at >= ?
        )
      ORDER BY created_at ASC
      LIMIT 1
    `);

    const row = stmt.get(now, now) as InboundQueuedMessage | undefined;

    if (!row) {
      return { message: null, locked: false };
    }

    // Try to acquire lock for this session
    const locked = await this.lockManager.acquireLock(row.sessionId, 'inbound', row.id);

    if (!locked) {
      return { message: null, locked: true };
    }

    return { message: row, locked: true };
  }

  /**
   * Mark a message as currently being processed.
   *
   * @param id - Message ID
   */
  async markProcessing(id: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE inbound_message_queue
      SET status = 'processing', processing_started_at = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), id);
  }

  /**
   * Mark a message as completed.
   *
   * Deletes the message from the queue and releases the session lock.
   *
   * @param id - Message ID
   */
  async markCompleted(id: string): Promise<void> {
    // Get session ID before deleting
    const getStmt = this.db.prepare(`
      SELECT session_id FROM inbound_message_queue WHERE id = ?
    `);
    const row = getStmt.get(id) as { session_id: string } | undefined;

    // Delete message
    const deleteStmt = this.db.prepare(`
      DELETE FROM inbound_message_queue WHERE id = ?
    `);
    deleteStmt.run(id);

    // Release lock if we found the session
    if (row) {
      await this.lockManager.releaseLock(row.session_id, 'inbound');
    }
  }

  /**
   * Mark a message as failed.
   *
   * Increments retry count and schedules retry with backoff.
   * Moves to dead letter queue if max retries exceeded.
   *
   * @param id - Message ID
   * @param error - Error that caused the failure
   */
  async markFailed(id: string, error: Error): Promise<void> {
    const getStmt = this.db.prepare(`
      SELECT * FROM inbound_message_queue WHERE id = ?
    `);
    const row = getStmt.get(id) as InboundQueuedMessage | undefined;

    if (!row) {
      return;
    }

    const newRetryCount = row.retryCount + 1;

    if (shouldRetry(newRetryCount, row.maxRetries)) {
      // Schedule retry
      await this.retry(id);
    } else {
      // Move to dead letter queue
      await this.moveToDeadLetter(id, error);
    }

    // Release lock
    await this.lockManager.releaseLock(row.sessionId, 'inbound');
  }

  /**
   * Retry a failed message.
   *
   * Increments retry count and schedules next retry with exponential backoff.
   *
   * @param id - Message ID
   */
  async retry(id: string): Promise<void> {
    const getStmt = this.db.prepare(`
      SELECT retry_count, max_retries FROM inbound_message_queue WHERE id = ?
    `);
    const row = getStmt.get(id) as
      | { retry_count: number; max_retries: number }
      | undefined;

    if (!row) {
      return;
    }

    const newRetryCount = row.retry_count + 1;
    const nextRetryAt = computeNextRetryAt(newRetryCount, 'inbound');

    const updateStmt = this.db.prepare(`
      UPDATE inbound_message_queue
      SET status = 'pending',
          retry_count = ?,
          next_retry_at = ?,
          processing_started_at = NULL
      WHERE id = ?
    `);

    updateStmt.run(newRetryCount, nextRetryAt, id);
  }

  /**
   * Move a message to the dead letter queue.
   *
   * Removes from main queue and archives in DLQ for investigation.
   *
   * @param id - Message ID
   * @param error - Final error that caused the failure
   */
  async moveToDeadLetter(id: string, error: Error): Promise<void> {
    const getStmt = this.db.prepare(`
      SELECT * FROM inbound_message_queue WHERE id = ?
    `);
    const row = getStmt.get(id) as InboundQueuedMessage | undefined;

    if (!row) {
      return;
    }

    // Insert into dead letter queue
    const insertStmt = this.db.prepare(`
      INSERT INTO inbound_dead_letter
      (id, original_message, final_error, error_history, failed_at, retry_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      id,
      JSON.stringify(row),
      error.message,
      row.error ? JSON.stringify([row.error, error.message]) : JSON.stringify([error.message]),
      Date.now(),
      row.retryCount,
    );

    // Delete from main queue
    const deleteStmt = this.db.prepare(`
      DELETE FROM inbound_message_queue WHERE id = ?
    `);
    deleteStmt.run(id);

    // Release lock
    await this.lockManager.releaseLock(row.sessionId, 'inbound');
  }

  /**
   * Get current queue metrics.
   *
   * @returns Queue metrics for monitoring
   */
  async getMetrics(): Promise<QueueMetrics> {
    const pendingStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM inbound_message_queue WHERE status = 'pending'
    `);
    const processingStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM inbound_message_queue WHERE status = 'processing'
    `);
    const failedStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM inbound_dead_letter
    `);

    const pending = (pendingStmt.get() as { count: number }).count;
    const processing = (processingStmt.get() as { count: number }).count;
    const failed = (failedStmt.get() as { count: number }).count;

    return {
      recordedAt: Date.now(),
      inboundPending: pending,
      inboundProcessing: processing,
      inboundFailed: failed,
      outboundPending: 0,
      outboundProcessing: 0,
      outboundFailed: 0,
      inboundProcessedLastMinute: 0,
      outboundSentLastMinute: 0,
      inboundErrorsLastMinute: 0,
      outboundErrorsLastMinute: 0,
    };
  }

  /**
   * Get count of pending messages.
   *
   * @returns Number of messages waiting to be processed
   */
  async getPendingCount(): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM inbound_message_queue WHERE status = 'pending'
    `);
    return (stmt.get() as { count: number }).count;
  }

  /**
   * Get count of messages currently being processed.
   *
   * @returns Number of messages in processing state
   */
  async getProcessingCount(): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM inbound_message_queue WHERE status = 'processing'
    `);
    return (stmt.get() as { count: number }).count;
  }
}
