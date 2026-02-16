# Message Queue Schema Design (DRAFT)

**Status:** DRAFT - Awaiting Team Lead Approval
**Author:** message-queue-agent
**Date:** 2026-02-16
**Related:** Sprint 01 Feature 1, Task 1.2

---

## Overview

This document defines the SQLite schema for the persistent message queue system that will replace the current file-based outbound queue and add persistence to inbound message processing.

**Design Principles:**
1. **ACID Compliance** - Use SQLite transactions for atomic operations
2. **WAL Mode** - Enable Write-Ahead Logging for concurrent reads
3. **Index Optimization** - Primary indexes on status + created_at for efficient dequeuing
4. **Interface-Based** - Schema designed to support future Postgres migration
5. **Session Isolation** - Prevent race conditions with session-based locking

---

## Database Configuration

```typescript
// src/message-queue/db-config.ts
import type { DatabaseSync } from 'node:sqlite';
import { requireNodeSqlite } from '../memory/sqlite.js';
import path from 'node:path';

export interface QueueDatabaseConfig {
  dbPath: string;
  walMode?: boolean;
  busyTimeout?: number;
}

export function createQueueDatabase(config: QueueDatabaseConfig): DatabaseSync {
  const sqlite = requireNodeSqlite();
  const db = new sqlite.DatabaseSync(config.dbPath);

  // Enable WAL mode for concurrent access
  if (config.walMode !== false) {
    db.exec('PRAGMA journal_mode = WAL');
  }

  // Set busy timeout (default 5 seconds)
  db.exec(`PRAGMA busy_timeout = ${config.busyTimeout ?? 5000}`);

  // Enable foreign keys
  db.exec('PRAGMA foreign_keys = ON');

  return db;
}
```

---

## Schema: Inbound Message Queue

### Table: `inbound_message_queue`

Stores incoming messages before processing to ensure no message loss.

```sql
CREATE TABLE IF NOT EXISTS inbound_message_queue (
  -- Identity
  id TEXT PRIMARY KEY,                    -- UUID or message ID
  session_id TEXT NOT NULL,               -- Session/conversation identifier

  -- Message metadata
  channel TEXT NOT NULL,                  -- whatsapp, telegram, slack, etc.
  from_address TEXT NOT NULL,             -- Sender identifier (phone, user ID)
  chat_id TEXT,                           -- Group chat ID (if applicable)
  chat_type TEXT,                         -- dm, group

  -- Message content
  body TEXT,                              -- Text content
  media_urls TEXT,                        -- JSON array of media URLs
  metadata TEXT,                          -- JSON blob with extra data

  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  created_at INTEGER NOT NULL,            -- Enqueue timestamp (ms)
  processing_started_at INTEGER,          -- When dequeued for processing
  completed_at INTEGER,                   -- When successfully processed

  -- Retry logic
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at INTEGER,                  -- Scheduled retry time

  -- Error tracking
  error TEXT,                             -- Last error message
  error_stack TEXT                        -- Full error stack for debugging
);

-- Indexes for efficient dequeuing
CREATE INDEX IF NOT EXISTS idx_inbound_status_created
  ON inbound_message_queue(status, created_at);

CREATE INDEX IF NOT EXISTS idx_inbound_session_status
  ON inbound_message_queue(session_id, status);

CREATE INDEX IF NOT EXISTS idx_inbound_next_retry
  ON inbound_message_queue(status, next_retry_at)
  WHERE status = 'pending' AND next_retry_at IS NOT NULL;
```

### Table: `inbound_dead_letter`

Failed messages that exceeded max retries.

```sql
CREATE TABLE IF NOT EXISTS inbound_dead_letter (
  id TEXT PRIMARY KEY,
  original_message TEXT NOT NULL,         -- Full JSON of original message
  final_error TEXT NOT NULL,              -- Final error that caused failure
  error_history TEXT,                     -- JSON array of all retry errors
  failed_at INTEGER NOT NULL,             -- When moved to DLQ
  retry_count INTEGER NOT NULL,           -- How many times it was retried

  FOREIGN KEY (id) REFERENCES inbound_message_queue(id)
);

CREATE INDEX IF NOT EXISTS idx_inbound_dlq_failed_at
  ON inbound_dead_letter(failed_at);
```

---

## Schema: Outbound Message Queue

### Table: `outbound_message_queue`

Stores outgoing messages with retry logic (migrated from file-based queue).

```sql
CREATE TABLE IF NOT EXISTS outbound_message_queue (
  -- Identity
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,

  -- Delivery metadata
  channel TEXT NOT NULL,                  -- whatsapp, telegram, etc.
  to_address TEXT NOT NULL,               -- Recipient identifier
  account_id TEXT,                        -- Account to send from

  -- Message content
  payloads TEXT NOT NULL,                 -- JSON array of ReplyPayload
  thread_id TEXT,                         -- Thread/conversation ID
  reply_to_id TEXT,                       -- Message being replied to

  -- Delivery options
  best_effort INTEGER NOT NULL DEFAULT 0, -- Boolean: skip retries if true
  gif_playback INTEGER NOT NULL DEFAULT 0,
  silent INTEGER NOT NULL DEFAULT 0,
  mirror TEXT,                            -- JSON: DeliveryMirrorPayload

  -- Processing state
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, sent, failed
  created_at INTEGER NOT NULL,
  processing_started_at INTEGER,
  sent_at INTEGER,

  -- Retry logic
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at INTEGER,

  -- Error tracking
  error TEXT,
  error_stack TEXT
);

-- Indexes for efficient dequeuing
CREATE INDEX IF NOT EXISTS idx_outbound_status_created
  ON outbound_message_queue(status, created_at);

CREATE INDEX IF NOT EXISTS idx_outbound_session_status
  ON outbound_message_queue(session_id, status);

CREATE INDEX IF NOT EXISTS idx_outbound_next_retry
  ON outbound_message_queue(status, next_retry_at)
  WHERE status = 'pending' AND next_retry_at IS NOT NULL;
```

### Table: `outbound_dead_letter`

```sql
CREATE TABLE IF NOT EXISTS outbound_dead_letter (
  id TEXT PRIMARY KEY,
  original_message TEXT NOT NULL,
  final_error TEXT NOT NULL,
  error_history TEXT,
  failed_at INTEGER NOT NULL,
  retry_count INTEGER NOT NULL,

  FOREIGN KEY (id) REFERENCES outbound_message_queue(id)
);

CREATE INDEX IF NOT EXISTS idx_outbound_dlq_failed_at
  ON outbound_dead_letter(failed_at);
```

---

## Schema: Processing Locks

Prevents race conditions when multiple workers try to process the same message.

```sql
CREATE TABLE IF NOT EXISTS queue_processing_locks (
  session_id TEXT PRIMARY KEY,
  locked_at INTEGER NOT NULL,             -- Lock timestamp
  worker_id TEXT NOT NULL,                -- Worker/process identifier
  lock_expires_at INTEGER NOT NULL,       -- Auto-expire stale locks

  -- Lock metadata
  message_id TEXT,                        -- Currently processing message
  lock_type TEXT NOT NULL                 -- 'inbound' or 'outbound'
);

CREATE INDEX IF NOT EXISTS idx_locks_expires
  ON queue_processing_locks(lock_expires_at);
```

---

## Schema: Queue Metrics

For monitoring and observability.

```sql
CREATE TABLE IF NOT EXISTS queue_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at INTEGER NOT NULL,

  -- Queue depths
  inbound_pending INTEGER NOT NULL DEFAULT 0,
  inbound_processing INTEGER NOT NULL DEFAULT 0,
  inbound_failed INTEGER NOT NULL DEFAULT 0,
  outbound_pending INTEGER NOT NULL DEFAULT 0,
  outbound_processing INTEGER NOT NULL DEFAULT 0,
  outbound_failed INTEGER NOT NULL DEFAULT 0,

  -- Processing rates
  inbound_processed_last_minute INTEGER NOT NULL DEFAULT 0,
  outbound_sent_last_minute INTEGER NOT NULL DEFAULT 0,

  -- Error rates
  inbound_errors_last_minute INTEGER NOT NULL DEFAULT 0,
  outbound_errors_last_minute INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_metrics_recorded
  ON queue_metrics(recorded_at);
```

---

## TypeScript Types

```typescript
// src/message-queue/types.ts

export type QueueStatus = 'pending' | 'processing' | 'completed' | 'sent' | 'failed';

export interface InboundQueuedMessage {
  id: string;
  sessionId: string;
  channel: string;
  fromAddress: string;
  chatId?: string;
  chatType?: 'dm' | 'group';
  body?: string;
  mediaUrls?: string[];
  metadata?: Record<string, unknown>;
  status: QueueStatus;
  createdAt: number;
  processingStartedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: number;
  error?: string;
  errorStack?: string;
}

export interface OutboundQueuedMessage {
  id: string;
  sessionId: string;
  channel: string;
  toAddress: string;
  accountId?: string;
  payloads: unknown[]; // ReplyPayload[]
  threadId?: string;
  replyToId?: string;
  bestEffort: boolean;
  gifPlayback: boolean;
  silent: boolean;
  mirror?: unknown; // DeliveryMirrorPayload
  status: QueueStatus;
  createdAt: number;
  processingStartedAt?: number;
  sentAt?: number;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: number;
  error?: string;
  errorStack?: string;
}

export interface DeadLetterMessage {
  id: string;
  originalMessage: string; // JSON
  finalError: string;
  errorHistory?: string; // JSON array
  failedAt: number;
  retryCount: number;
}

export interface ProcessingLock {
  sessionId: string;
  lockedAt: number;
  workerId: string;
  lockExpiresAt: number;
  messageId?: string;
  lockType: 'inbound' | 'outbound';
}

export interface QueueMetrics {
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
```

---

## Migration from File-Based Queue

For existing `delivery-queue/*.json` files:

```typescript
// src/message-queue/migrate-file-queue.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { QueuedDelivery } from '../infra/outbound/delivery-queue.js';

export async function migrateFileQueueToSqlite(params: {
  queueDir: string;
  db: DatabaseSync;
  log: (msg: string) => void;
}): Promise<{ migrated: number; failed: number }> {
  const files = await fs.readdir(params.queueDir);
  let migrated = 0;
  let failed = 0;

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    try {
      const filePath = path.join(params.queueDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const entry: QueuedDelivery = JSON.parse(content);

      // Insert into SQLite
      const stmt = params.db.prepare(`
        INSERT INTO outbound_message_queue
        (id, session_id, channel, to_address, account_id, payloads,
         thread_id, reply_to_id, status, created_at, retry_count, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        entry.id,
        entry.to, // session_id approximation
        entry.channel,
        entry.to,
        entry.accountId,
        JSON.stringify(entry.payloads),
        entry.threadId?.toString(),
        entry.replyToId,
        'pending', // Reset to pending
        entry.enqueuedAt,
        entry.retryCount,
        entry.lastError
      );

      // Delete file after successful migration
      await fs.unlink(filePath);
      migrated++;
      params.log(`Migrated: ${file}`);
    } catch (err) {
      failed++;
      params.log(`Failed to migrate ${file}: ${String(err)}`);
    }
  }

  return { migrated, failed };
}
```

---

## Backoff Strategy

```typescript
// src/message-queue/backoff.ts
export const BACKOFF_DELAYS_MS = [
  1_000,    // retry 1: 1 second
  5_000,    // retry 2: 5 seconds
  25_000,   // retry 3: 25 seconds
  120_000,  // retry 4: 2 minutes
  600_000   // retry 5: 10 minutes
] as const;

export function computeBackoffMs(retryCount: number): number {
  if (retryCount <= 0) return 0;
  const index = Math.min(retryCount - 1, BACKOFF_DELAYS_MS.length - 1);
  return BACKOFF_DELAYS_MS[index];
}

export function computeNextRetryAt(retryCount: number): number {
  return Date.now() + computeBackoffMs(retryCount);
}
```

---

## Schema Initialization

```typescript
// src/message-queue/init-schema.ts
import type { DatabaseSync } from 'node:sqlite';

export function initializeQueueSchema(db: DatabaseSync): void {
  // Enable WAL mode
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  // Create all tables
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
    );

    CREATE INDEX IF NOT EXISTS idx_inbound_status_created
      ON inbound_message_queue(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_inbound_session_status
      ON inbound_message_queue(session_id, status);
    CREATE INDEX IF NOT EXISTS idx_inbound_next_retry
      ON inbound_message_queue(status, next_retry_at)
      WHERE status = 'pending' AND next_retry_at IS NOT NULL;

    -- Outbound queue, dead letter, locks, metrics tables...
    -- (Full SQL from above)
  `);
}
```

---

## Next Steps

1. Get team lead approval on schema design
2. Implement queue service interfaces
3. Implement inbound queue worker
4. Implement outbound queue (SQLite migration)
5. Integration tests
6. Metrics and monitoring

---

**Status:** DRAFT - Pending Approval
**Blockers:** None - Ready to implement once approved
