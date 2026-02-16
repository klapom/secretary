/**
 * Outbound message queue implementation.
 *
 * Migrates from file-based delivery queue to SQLite for better performance
 * and consistency. Preserves existing retry behavior and intervals.
 *
 * @module message-queue/outbound-queue
 */

import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  EnqueueResult,
  DequeueResult,
  IMessageQueue,
  OutboundQueuedMessage,
  QueueMetrics,
} from './types.js';
import { computeNextRetryAt, shouldRetry } from './backoff.js';
import { LockManager } from './lock-manager.js';

/**
 * Parameters for enqueueing an outbound message.
 * Compatible with existing delivery queue interface.
 */
export interface EnqueueOutboundParams {
  sessionId: string;
  channel: string;
  toAddress: string;
  accountId?: string;
  payloads: unknown[]; // ReplyPayload[]
  threadId?: string | number | null;
  replyToId?: string | null;
  bestEffort?: boolean;
  gifPlayback?: boolean;
  silent?: boolean;
  mirror?: unknown; // DeliveryMirrorPayload
  maxRetries?: number;
}

/**
 * SQLite-backed outbound message queue.
 *
 * Replaces file-based delivery queue with:
 * - Better performance (indexed queries)
 * - ACID transactions
 * - Consistent retry logic
 * - Session-based locking
 *
 * Preserves existing retry intervals: 5s, 25s, 2m, 10m
 */
export class OutboundMessageQueue implements IMessageQueue<OutboundQueuedMessage> {
  private readonly lockManager: LockManager;

  constructor(private readonly db: DatabaseSync) {
    this.lockManager = new LockManager(db);
  }

  /**
   * Enqueue an outbound message for delivery.
   *
   * @param params - Message parameters
   * @returns Enqueue result with message ID
   */
  async enqueue(params: EnqueueOutboundParams): Promise<EnqueueResult> {
    const id = crypto.randomUUID();
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO outbound_message_queue
        (id, session_id, channel, to_address, account_id, payloads,
         thread_id, reply_to_id, best_effort, gif_playback, silent, mirror,
         status, created_at, retry_count, max_retries)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?)
      `);

      stmt.run(
        id,
        params.sessionId,
        params.channel,
        params.toAddress,
        params.accountId ?? null,
        JSON.stringify(params.payloads),
        params.threadId?.toString() ?? null,
        params.replyToId ?? null,
        params.bestEffort ? 1 : 0,
        params.gifPlayback ? 1 : 0,
        params.silent ? 1 : 0,
        params.mirror ? JSON.stringify(params.mirror) : null,
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
   * Dequeue the next pending message for delivery.
   *
   * Uses session-based locking to prevent race conditions.
   * Skips messages from locked sessions.
   *
   * @returns Dequeued message or null if queue is empty
   */
  async dequeue(): Promise<DequeueResult<OutboundQueuedMessage>> {
    const now = Date.now();

    // Clean up expired locks first
    await this.lockManager.cleanupExpiredLocks();

    // Find next pending message (not from a locked session)
    const stmt = this.db.prepare(`
      SELECT * FROM outbound_message_queue
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
        AND session_id NOT IN (
          SELECT session_id FROM queue_processing_locks
          WHERE lock_type = 'outbound' AND lock_expires_at >= ?
        )
      ORDER BY created_at ASC
      LIMIT 1
    `);

    const row = stmt.get(now, now) as OutboundQueuedMessage | undefined;

    if (!row) {
      return { message: null, locked: false };
    }

    // Try to acquire lock for this session
    const locked = await this.lockManager.acquireLock(row.sessionId, 'outbound', row.id);

    if (!locked) {
      return { message: null, locked: true };
    }

    return { message: row, locked: true };
  }

  /**
   * Mark a message as currently being sent.
   *
   * @param id - Message ID
   */
  async markProcessing(id: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE outbound_message_queue
      SET status = 'processing', processing_started_at = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), id);
  }

  /**
   * Mark a message as sent successfully.
   *
   * Deletes the message from the queue and releases the session lock.
   *
   * @param id - Message ID
   */
  async markCompleted(id: string): Promise<void> {
    // Get session ID before deleting
    const getStmt = this.db.prepare(`
      SELECT session_id FROM outbound_message_queue WHERE id = ?
    `);
    const row = getStmt.get(id) as { session_id: string } | undefined;

    // Update to sent status with timestamp
    const updateStmt = this.db.prepare(`
      UPDATE outbound_message_queue
      SET status = 'sent', sent_at = ?
      WHERE id = ?
    `);
    updateStmt.run(Date.now(), id);

    // Delete after a short delay (for metrics)
    // In production, could keep for audit trail
    const deleteStmt = this.db.prepare(`
      DELETE FROM outbound_message_queue WHERE id = ?
    `);
    deleteStmt.run(id);

    // Release lock if we found the session
    if (row) {
      await this.lockManager.releaseLock(row.session_id, 'outbound');
    }
  }

  /**
   * Mark a message as failed.
   *
   * Increments retry count and schedules retry with backoff.
   * Moves to dead letter queue if max retries exceeded or bestEffort is true.
   *
   * @param id - Message ID
   * @param error - Error that caused the failure
   */
  async markFailed(id: string, error: Error): Promise<void> {
    const getStmt = this.db.prepare(`
      SELECT * FROM outbound_message_queue WHERE id = ?
    `);
    const row = getStmt.get(id) as OutboundQueuedMessage | undefined;

    if (!row) {
      return;
    }

    // If best effort, don't retry
    if (row.bestEffort) {
      await this.moveToDeadLetter(id, error);
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
    await this.lockManager.releaseLock(row.sessionId, 'outbound');
  }

  /**
   * Retry a failed message.
   *
   * Increments retry count and schedules next retry with exponential backoff.
   * Uses outbound retry intervals: 5s, 25s, 2m, 10m
   *
   * @param id - Message ID
   */
  async retry(id: string): Promise<void> {
    const getStmt = this.db.prepare(`
      SELECT retry_count, max_retries FROM outbound_message_queue WHERE id = ?
    `);
    const row = getStmt.get(id) as
      | { retry_count: number; max_retries: number }
      | undefined;

    if (!row) {
      return;
    }

    const newRetryCount = row.retry_count + 1;
    const nextRetryAt = computeNextRetryAt(newRetryCount, 'outbound');

    const updateStmt = this.db.prepare(`
      UPDATE outbound_message_queue
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
      SELECT * FROM outbound_message_queue WHERE id = ?
    `);
    const row = getStmt.get(id) as OutboundQueuedMessage | undefined;

    if (!row) {
      return;
    }

    // Insert into dead letter queue
    const insertStmt = this.db.prepare(`
      INSERT INTO outbound_dead_letter
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
      DELETE FROM outbound_message_queue WHERE id = ?
    `);
    deleteStmt.run(id);

    // Release lock
    await this.lockManager.releaseLock(row.sessionId, 'outbound');
  }

  /**
   * Get current queue metrics.
   *
   * @returns Queue metrics for monitoring
   */
  async getMetrics(): Promise<QueueMetrics> {
    const pendingStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM outbound_message_queue WHERE status = 'pending'
    `);
    const processingStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM outbound_message_queue WHERE status = 'processing'
    `);
    const failedStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM outbound_dead_letter
    `);

    const pending = (pendingStmt.get() as { count: number }).count;
    const processing = (processingStmt.get() as { count: number }).count;
    const failed = (failedStmt.get() as { count: number }).count;

    return {
      recordedAt: Date.now(),
      inboundPending: 0,
      inboundProcessing: 0,
      inboundFailed: 0,
      outboundPending: pending,
      outboundProcessing: processing,
      outboundFailed: failed,
      inboundProcessedLastMinute: 0,
      outboundSentLastMinute: 0,
      inboundErrorsLastMinute: 0,
      outboundErrorsLastMinute: 0,
    };
  }

  /**
   * Get count of pending messages.
   *
   * @returns Number of messages waiting to be sent
   */
  async getPendingCount(): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM outbound_message_queue WHERE status = 'pending'
    `);
    return (stmt.get() as { count: number }).count;
  }

  /**
   * Get count of messages currently being sent.
   *
   * @returns Number of messages in processing state
   */
  async getProcessingCount(): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM outbound_message_queue WHERE status = 'processing'
    `);
    return (stmt.get() as { count: number }).count;
  }
}
