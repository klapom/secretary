/**
 * Message Queue Types
 *
 * TypeScript type definitions for the persistent message queue system.
 * Supports both inbound and outbound message queuing with retry logic.
 *
 * @module message-queue/types
 */

export type QueueStatus = 'pending' | 'processing' | 'completed' | 'sent' | 'failed';
export type LockType = 'inbound' | 'outbound';
export type ChatType = 'dm' | 'group';

/**
 * Inbound message stored in the queue before processing.
 * Prevents message loss during processing or system crashes.
 */
export interface InboundQueuedMessage {
  id: string;
  sessionId: string;
  channel: string;
  fromAddress: string;
  chatId?: string | null;
  chatType?: ChatType | null;
  body?: string | null;
  mediaUrls?: string | null; // JSON array serialized
  metadata?: string | null; // JSON object serialized
  status: QueueStatus;
  createdAt: number;
  processingStartedAt?: number | null;
  completedAt?: number | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: number | null;
  error?: string | null;
  errorStack?: string | null;
}

/**
 * Outbound message stored in the queue before sending.
 * Replaces file-based delivery queue with SQLite persistence.
 */
export interface OutboundQueuedMessage {
  id: string;
  sessionId: string;
  channel: string;
  toAddress: string;
  accountId?: string | null;
  payloads: string; // JSON array of ReplyPayload serialized
  threadId?: string | null;
  replyToId?: string | null;
  bestEffort: number; // SQLite boolean (0/1)
  gifPlayback: number; // SQLite boolean (0/1)
  silent: number; // SQLite boolean (0/1)
  mirror?: string | null; // JSON object serialized
  status: QueueStatus;
  createdAt: number;
  processingStartedAt?: number | null;
  sentAt?: number | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: number | null;
  error?: string | null;
  errorStack?: string | null;
}

/**
 * Dead letter queue entry for messages that exceeded max retries.
 */
export interface DeadLetterMessage {
  id: string;
  originalMessage: string; // Full JSON of original queue entry
  finalError: string;
  errorHistory?: string | null; // JSON array of all errors
  failedAt: number;
  retryCount: number;
}

/**
 * Processing lock to prevent race conditions.
 * Ensures only one worker processes a session's messages at a time.
 */
export interface ProcessingLock {
  sessionId: string;
  lockedAt: number;
  workerId: string;
  lockExpiresAt: number;
  messageId?: string | null;
  lockType: LockType;
}

/**
 * Queue metrics for monitoring and observability.
 */
export interface QueueMetrics {
  id?: number;
  recordedAt: number;
  inboundPending: number;
  inboundProcessing: number;
  inboundFailed: number;
  outboundPending: number;
  outboundProcessing: number;
  outboundFailed: number;
  inboundProcessedLastMinute: number;
  outboundSentLastMinute: number;
  inboundErrorsLastMinute: number;
  outboundErrorsLastMinute: number;
}

/**
 * Configuration for message queue database.
 */
export interface QueueDatabaseConfig {
  dbPath: string;
  walMode?: boolean;
  busyTimeout?: number;
}

/**
 * Result of enqueuing a message.
 */
export interface EnqueueResult {
  id: string;
  queued: boolean;
  error?: string;
}

/**
 * Result of dequeuing a message.
 */
export interface DequeueResult<T> {
  message: T | null;
  locked: boolean;
}

/**
 * Message queue interface - abstraction for future migration to PostgreSQL.
 */
export interface IMessageQueue<T> {
  enqueue(message: Omit<T, 'id' | 'status' | 'createdAt' | 'retryCount'>): Promise<EnqueueResult>;
  dequeue(): Promise<DequeueResult<T>>;
  markProcessing(id: string): Promise<void>;
  markCompleted(id: string): Promise<void>;
  markFailed(id: string, error: Error): Promise<void>;
  retry(id: string): Promise<void>;
  moveToDeadLetter(id: string, error: Error): Promise<void>;
  getMetrics(): Promise<QueueMetrics>;
  getPendingCount(): Promise<number>;
  getProcessingCount(): Promise<number>;
}

/**
 * Lock manager interface for session-based locking.
 */
export interface ILockManager {
  acquireLock(sessionId: string, lockType: LockType, messageId?: string): Promise<boolean>;
  releaseLock(sessionId: string, lockType: LockType): Promise<void>;
  renewLock(sessionId: string, lockType: LockType): Promise<boolean>;
  cleanupExpiredLocks(): Promise<number>;
}
