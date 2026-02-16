/**
 * Lock manager for message queue processing.
 *
 * Implements session-based locking to prevent race conditions when
 * multiple workers try to process messages from the same session.
 *
 * @module message-queue/lock-manager
 */

import type { DatabaseSync } from 'node:sqlite';
import type { ILockManager, LockType, ProcessingLock } from './types.js';
import { DEFAULT_LOCK_TIMEOUT_MS, WORKER_ID } from './db-config.js';

/**
 * SQLite-based lock manager implementation.
 *
 * Features:
 * - Session-based locking (one lock per session + lock type)
 * - Automatic lock expiration
 * - Lock renewal for long-running operations
 * - Cleanup of stale locks
 */
export class LockManager implements ILockManager {
  constructor(
    private readonly db: DatabaseSync,
    private readonly lockTimeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS,
  ) {}

  /**
   * Acquire a lock for a session.
   *
   * @param sessionId - Session identifier
   * @param lockType - Type of lock ('inbound' or 'outbound')
   * @param messageId - Optional message ID being processed
   * @returns True if lock acquired, false if already locked
   */
  async acquireLock(
    sessionId: string,
    lockType: LockType,
    messageId?: string,
  ): Promise<boolean> {
    const now = Date.now();
    const expiresAt = now + this.lockTimeoutMs;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO queue_processing_locks
        (session_id, lock_type, locked_at, worker_id, lock_expires_at, message_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id, lock_type) DO UPDATE SET
          locked_at = excluded.locked_at,
          worker_id = excluded.worker_id,
          lock_expires_at = excluded.lock_expires_at,
          message_id = excluded.message_id
        WHERE lock_expires_at < ?
      `);

      const result = stmt.run(
        sessionId,
        lockType,
        now,
        WORKER_ID,
        expiresAt,
        messageId ?? null,
        now, // WHERE clause: only update if expired
      );

      // Check if we actually acquired the lock
      return result.changes > 0;
    } catch (err) {
      // Lock already held by another worker
      return false;
    }
  }

  /**
   * Release a lock for a session.
   *
   * @param sessionId - Session identifier
   * @param lockType - Type of lock
   */
  async releaseLock(sessionId: string, lockType: LockType): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM queue_processing_locks
      WHERE session_id = ? AND lock_type = ? AND worker_id = ?
    `);

    stmt.run(sessionId, lockType, WORKER_ID);
  }

  /**
   * Renew a lock to prevent expiration.
   *
   * Should be called periodically for long-running operations.
   *
   * @param sessionId - Session identifier
   * @param lockType - Type of lock
   * @returns True if renewed, false if lock lost
   */
  async renewLock(sessionId: string, lockType: LockType): Promise<boolean> {
    const now = Date.now();
    const expiresAt = now + this.lockTimeoutMs;

    const stmt = this.db.prepare(`
      UPDATE queue_processing_locks
      SET lock_expires_at = ?
      WHERE session_id = ? AND lock_type = ? AND worker_id = ?
    `);

    const result = stmt.run(expiresAt, sessionId, lockType, WORKER_ID);
    return result.changes > 0;
  }

  /**
   * Clean up expired locks.
   *
   * Should be called periodically to prevent stale locks from blocking processing.
   *
   * @returns Number of locks cleaned up
   */
  async cleanupExpiredLocks(): Promise<number> {
    const now = Date.now();

    const stmt = this.db.prepare(`
      DELETE FROM queue_processing_locks
      WHERE lock_expires_at < ?
    `);

    const result = stmt.run(now);
    return result.changes;
  }

  /**
   * Check if a session is locked.
   *
   * @param sessionId - Session identifier
   * @param lockType - Type of lock
   * @returns Lock information if locked, null otherwise
   */
  async isLocked(sessionId: string, lockType: LockType): Promise<ProcessingLock | null> {
    const now = Date.now();

    const stmt = this.db.prepare(`
      SELECT session_id, lock_type, locked_at, worker_id, lock_expires_at, message_id
      FROM queue_processing_locks
      WHERE session_id = ? AND lock_type = ? AND lock_expires_at >= ?
    `);

    const row = stmt.get(sessionId, lockType, now) as ProcessingLock | undefined;

    if (!row) {
      return null;
    }

    return {
      sessionId: row.sessionId,
      lockedAt: row.lockedAt,
      workerId: row.workerId,
      lockExpiresAt: row.lockExpiresAt,
      messageId: row.messageId ?? undefined,
      lockType: row.lockType,
    };
  }

  /**
   * Get all active locks.
   *
   * Useful for debugging and monitoring.
   *
   * @returns Array of active locks
   */
  async getActiveLocks(): Promise<ProcessingLock[]> {
    const now = Date.now();

    const stmt = this.db.prepare(`
      SELECT session_id, lock_type, locked_at, worker_id, lock_expires_at, message_id
      FROM queue_processing_locks
      WHERE lock_expires_at >= ?
      ORDER BY locked_at ASC
    `);

    const rows = stmt.all(now) as ProcessingLock[];

    return rows.map((row) => ({
      sessionId: row.sessionId,
      lockedAt: row.lockedAt,
      workerId: row.workerId,
      lockExpiresAt: row.lockExpiresAt,
      messageId: row.messageId ?? undefined,
      lockType: row.lockType,
    }));
  }

  /**
   * Force release all locks (use with caution).
   *
   * WARNING: Only use this when shutting down or in emergency situations.
   */
  async releaseAllLocks(): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM queue_processing_locks
      WHERE worker_id = ?
    `);

    const result = stmt.run(WORKER_ID);
    return result.changes;
  }
}
