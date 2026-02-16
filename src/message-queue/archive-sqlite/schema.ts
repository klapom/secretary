/**
 * SQLite schema for message queue system.
 *
 * Creates tables for:
 * - Inbound message queue
 * - Outbound message queue
 * - Dead letter queues (both directions)
 * - Processing locks
 * - Metrics
 *
 * @module message-queue/schema
 */

import type { DatabaseSync } from 'node:sqlite';

/**
 * Initialize the complete message queue schema.
 *
 * Creates all tables and indexes. Idempotent - safe to call multiple times.
 *
 * @param db - SQLite database instance
 *
 * @example
 * ```typescript
 * const db = createQueueDatabase({ dbPath: './queue.db' });
 * initializeQueueSchema(db);
 * ```
 */
export function initializeQueueSchema(db: DatabaseSync): void {
  // Inbound message queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS inbound_message_queue (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      from_address TEXT NOT NULL,
      chat_id TEXT,
      chat_type TEXT,
      body TEXT,
      media_urls TEXT,
      metadata TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      processing_started_at INTEGER,
      completed_at INTEGER,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 5,
      next_retry_at INTEGER,
      error TEXT,
      error_stack TEXT
    )
  `);

  // Indexes for inbound queue
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inbound_status_created
      ON inbound_message_queue(status, created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inbound_session_status
      ON inbound_message_queue(session_id, status)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inbound_next_retry
      ON inbound_message_queue(next_retry_at)
      WHERE status = 'pending' AND next_retry_at IS NOT NULL
  `);

  // Outbound message queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbound_message_queue (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      to_address TEXT NOT NULL,
      account_id TEXT,
      payloads TEXT NOT NULL,
      thread_id TEXT,
      reply_to_id TEXT,
      best_effort INTEGER NOT NULL DEFAULT 0,
      gif_playback INTEGER NOT NULL DEFAULT 0,
      silent INTEGER NOT NULL DEFAULT 0,
      mirror TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      processing_started_at INTEGER,
      sent_at INTEGER,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 5,
      next_retry_at INTEGER,
      error TEXT,
      error_stack TEXT
    )
  `);

  // Indexes for outbound queue
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outbound_status_created
      ON outbound_message_queue(status, created_at)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outbound_session_status
      ON outbound_message_queue(session_id, status)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outbound_next_retry
      ON outbound_message_queue(next_retry_at)
      WHERE status = 'pending' AND next_retry_at IS NOT NULL
  `);

  // Inbound dead letter queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS inbound_dead_letter (
      id TEXT PRIMARY KEY,
      original_message TEXT NOT NULL,
      final_error TEXT NOT NULL,
      error_history TEXT,
      failed_at INTEGER NOT NULL,
      retry_count INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inbound_dlq_failed_at
      ON inbound_dead_letter(failed_at)
  `);

  // Outbound dead letter queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbound_dead_letter (
      id TEXT PRIMARY KEY,
      original_message TEXT NOT NULL,
      final_error TEXT NOT NULL,
      error_history TEXT,
      failed_at INTEGER NOT NULL,
      retry_count INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outbound_dlq_failed_at
      ON outbound_dead_letter(failed_at)
  `);

  // Processing locks
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_processing_locks (
      session_id TEXT NOT NULL,
      lock_type TEXT NOT NULL,
      locked_at INTEGER NOT NULL,
      worker_id TEXT NOT NULL,
      lock_expires_at INTEGER NOT NULL,
      message_id TEXT,
      PRIMARY KEY (session_id, lock_type)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_locks_expires
      ON queue_processing_locks(lock_expires_at)
  `);

  // Queue metrics
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      inbound_pending INTEGER NOT NULL DEFAULT 0,
      inbound_processing INTEGER NOT NULL DEFAULT 0,
      inbound_failed INTEGER NOT NULL DEFAULT 0,
      outbound_pending INTEGER NOT NULL DEFAULT 0,
      outbound_processing INTEGER NOT NULL DEFAULT 0,
      outbound_failed INTEGER NOT NULL DEFAULT 0,
      inbound_processed_last_minute INTEGER NOT NULL DEFAULT 0,
      outbound_sent_last_minute INTEGER NOT NULL DEFAULT 0,
      inbound_errors_last_minute INTEGER NOT NULL DEFAULT 0,
      outbound_errors_last_minute INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_recorded
      ON queue_metrics(recorded_at)
  `);
}

/**
 * Drop all message queue tables.
 *
 * WARNING: This deletes all queue data. Use only for testing or migrations.
 *
 * @param db - SQLite database instance
 */
export function dropQueueSchema(db: DatabaseSync): void {
  db.exec('DROP TABLE IF EXISTS inbound_message_queue');
  db.exec('DROP TABLE IF EXISTS outbound_message_queue');
  db.exec('DROP TABLE IF EXISTS inbound_dead_letter');
  db.exec('DROP TABLE IF EXISTS outbound_dead_letter');
  db.exec('DROP TABLE IF EXISTS queue_processing_locks');
  db.exec('DROP TABLE IF EXISTS queue_metrics');
}

/**
 * Vacuum the database to reclaim space and optimize performance.
 *
 * Should be called periodically (e.g., after deleting many messages).
 *
 * @param db - SQLite database instance
 */
export function vacuumQueueDatabase(db: DatabaseSync): void {
  db.exec('VACUUM');
}

/**
 * Get schema version for migrations.
 *
 * @returns Current schema version
 */
export function getSchemaVersion(): number {
  return 1;
}
