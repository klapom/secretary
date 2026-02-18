/**
 * Message Queue Types
 *
 * Unified type definitions for both inbound and outbound message queues.
 * Provides interface-based design for future migration to SQLite/PostgreSQL.
 *
 * @module message-queue/types
 */

/**
 * Generic message queue interface.
 *
 * This interface abstracts the queue implementation, allowing future migration
 * from file-based to database-backed storage without changing consumer code.
 *
 * @template T - Message type
 */
export interface IMessageQueue<T> {
  /** Enqueue a message for processing/delivery */
  enqueue(params: Omit<T, "id" | "enqueuedAt" | "retryCount">): Promise<string>;

  /** Acknowledge successful processing (removes from queue) */
  ack(id: string): Promise<void>;

  /** Record failure and increment retry count */
  fail(id: string, error: string): Promise<void>;

  /** Move to dead letter queue after max retries */
  moveToFailed(id: string): Promise<void>;

  /** Load all pending messages */
  loadPending(): Promise<T[]>;

  /** Compute backoff delay for retry */
  computeBackoff(retryCount: number): number;
}

/**
 * Recovery options for queue processing on startup.
 */
export interface IQueueRecovery<T> {
  /** Function to process a message */
  process: (message: T) => Promise<void>;

  /** Logger for recovery progress */
  log: IRecoveryLogger;

  /** Optional state directory override */
  stateDir?: string;

  /** Optional delay function for testing */
  delay?: (ms: number) => Promise<void>;

  /** Maximum recovery time in milliseconds */
  maxRecoveryMs?: number;
}

/**
 * Logger interface for recovery operations.
 */
export interface IRecoveryLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Recovery result statistics.
 */
export interface RecoveryResult {
  /** Number of messages successfully recovered */
  recovered: number;

  /** Number of messages that failed retry */
  failed: number;

  /** Number of messages moved to DLQ (max retries exceeded) */
  skipped: number;
}
