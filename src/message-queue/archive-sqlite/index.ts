/**
 * Message Queue Module
 *
 * Persistent message queue system for inbound and outbound messages.
 * Prevents message loss during crashes, long-running operations, or socket reconnects.
 *
 * Features:
 * - SQLite-backed persistence with WAL mode
 * - Automatic retry with exponential backoff
 * - Dead letter queue for failed messages
 * - Session-based locking to prevent race conditions
 * - Metrics for monitoring and observability
 *
 * @module message-queue
 */

// Types
export type {
  QueueStatus,
  LockType,
  ChatType,
  InboundQueuedMessage,
  OutboundQueuedMessage,
  DeadLetterMessage,
  ProcessingLock,
  QueueMetrics,
  QueueDatabaseConfig,
  EnqueueResult,
  DequeueResult,
  IMessageQueue,
  ILockManager,
} from './types.js';

// Database configuration
export {
  createQueueDatabase,
  closeQueueDatabase,
  DEFAULT_LOCK_TIMEOUT_MS,
  WORKER_ID,
} from './db-config.js';

// Schema
export {
  initializeQueueSchema,
  dropQueueSchema,
  vacuumQueueDatabase,
  getSchemaVersion,
} from './schema.js';

// Backoff logic
export {
  INBOUND_BACKOFF_MS,
  OUTBOUND_BACKOFF_MS,
  computeBackoffMs,
  computeNextRetryAt,
  shouldRetry,
  isRetryDue,
} from './backoff.js';

// Lock manager
export { LockManager } from './lock-manager.js';

// Queue implementations
export { InboundMessageQueue } from './inbound-queue.js';
export type { EnqueueInboundParams } from './inbound-queue.js';

export { OutboundMessageQueue } from './outbound-queue.js';
export type { EnqueueOutboundParams } from './outbound-queue.js';

// Migration
export { migrateFileQueueToSqlite, validateMigration } from './migrate-file-queue.js';
export type { MigrationResult, MigrationLogger } from './migrate-file-queue.js';
