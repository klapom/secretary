/**
 * Database configuration for message queue.
 *
 * Initializes SQLite database with WAL mode, foreign keys, and proper timeouts.
 * Uses Node.js built-in node:sqlite module.
 *
 * @module message-queue/db-config
 */

import type { DatabaseSync } from 'node:sqlite';
import { requireNodeSqlite } from '../memory/sqlite.js';
import type { QueueDatabaseConfig } from './types.js';

/**
 * Default lock timeout for SQLite busy handler.
 * Prevents immediate failures when database is locked.
 */
const DEFAULT_BUSY_TIMEOUT_MS = 5000;

/**
 * Default lock expiration time (30 seconds).
 * Locks older than this are considered stale and can be cleaned up.
 */
export const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

/**
 * Worker ID for this process (used in locking).
 */
export const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

/**
 * Create and configure a SQLite database for the message queue.
 *
 * Enables:
 * - WAL mode for concurrent reads during writes
 * - Foreign key constraints
 * - Busy timeout to handle locking
 *
 * @param config - Database configuration
 * @returns Configured DatabaseSync instance
 *
 * @example
 * ```typescript
 * const db = createQueueDatabase({
 *   dbPath: '/path/to/queue.db',
 *   walMode: true,
 *   busyTimeout: 5000
 * });
 * ```
 */
export function createQueueDatabase(config: QueueDatabaseConfig): DatabaseSync {
  const sqlite = requireNodeSqlite();
  const db = new sqlite.DatabaseSync(config.dbPath);

  // Enable WAL mode for better concurrency
  if (config.walMode !== false) {
    db.exec('PRAGMA journal_mode = WAL');
  }

  // Set busy timeout to avoid immediate failures
  const timeout = config.busyTimeout ?? DEFAULT_BUSY_TIMEOUT_MS;
  db.exec(`PRAGMA busy_timeout = ${timeout}`);

  // Enable foreign key constraints
  db.exec('PRAGMA foreign_keys = ON');

  // Set synchronous mode to NORMAL for better performance with WAL
  db.exec('PRAGMA synchronous = NORMAL');

  return db;
}

/**
 * Close database connection gracefully.
 *
 * @param db - Database to close
 */
export function closeQueueDatabase(db: DatabaseSync): void {
  try {
    // Checkpoint WAL before closing
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // Ignore errors during checkpoint
  }

  try {
    db.close();
  } catch {
    // Ignore errors during close
  }
}
