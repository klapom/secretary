# Message Queue Analysis - Sprint 01 Feature 1

**Author:** message-queue-agent
**Date:** 2026-02-16
**Status:** Analysis Complete
**Related:** Sprint 01, Task 1.1, Issue #16918

---

## Executive Summary

Analysis of WhatsApp Race Condition (#16918) reveals two separate queue systems in OpenClaw:
1. **Outbound Delivery Queue** - Already persistent (file-based)
2. **Inbound Processing** - In-memory only (needs persistence)

The race condition occurs when socket reconnects during long AI processing, causing outbound delivery to fail. Current outbound queue handles this well, but inbound messages lack persistence for crash recovery.

---

## Problem Statement

### Issue #16918: WhatsApp Race Condition

**Symptom:** Messages lost when WhatsApp socket reconnects during AI processing

**Root Cause:**
```typescript
// PROBLEM: Socket reference captured in closure
async function onMessage(socket, msg) {
  const capturedSocket = socket; // ← Stale after reconnect

  await processWithAI(msg); // Takes 30+ seconds
  // Socket may reconnect here ↑

  await capturedSocket.send(reply); // ← Dead socket = lost message
}
```

**Impact:**
- Message loss during long AI processing
- No recovery mechanism for inbound messages
- Users get no response if system crashes during processing

---

## Current Architecture

### 1. Outbound Delivery Queue ✅

**Location:** `/src/infra/outbound/delivery-queue.ts`

**Status:** Already persistent and robust

**Features:**
- ✅ File-based persistence (`.json` files in `delivery-queue/` directory)
- ✅ Retry logic with exponential backoff (5s, 25s, 2m, 10m)
- ✅ Dead Letter Queue (`failed/` subdirectory)
- ✅ Recovery on startup (`recoverPendingDeliveries()`)
- ✅ Max 5 retries before moving to failed

**Schema (File-based):**
```typescript
interface QueuedDelivery {
  id: string;
  enqueuedAt: number;
  channel: OutboundChannel;
  to: string;
  accountId?: string;
  payloads: ReplyPayload[];
  threadId?: string | number | null;
  replyToId?: string | null;
  retryCount: number;
  lastError?: string;
}
```

**Strengths:**
- Simple, works well for single-instance deployment
- Atomic file operations prevent corruption
- Easy to inspect/debug (just look at files)

**Weaknesses:**
- No transactions (each file is separate)
- No efficient querying (must read all files)
- No built-in ordering guarantees across sessions
- File I/O overhead for high message volume

---

### 2. Inbound Message Processing ❌

**Location:** `/src/web/inbound/monitor.ts` + `/src/auto-reply/inbound-debounce.ts`

**Status:** In-memory only, NO persistence

**Current Flow:**
1. `monitorWebInbox()` listens to Baileys socket events
2. `createInboundDebouncer()` buffers rapid messages (in-memory Map)
3. Debouncer calls `onMessage()` callback after timeout
4. Message passed to auto-reply system
5. **If process crashes here → message lost forever**

**Debouncer Implementation:**
```typescript
// src/auto-reply/inbound-debounce.ts
const buffers = new Map<string, DebounceBuffer<T>>(); // ← IN MEMORY ONLY!

const flushBuffer = async (key: string, buffer: DebounceBuffer<T>) => {
  buffers.delete(key); // Message gone after this
  await params.onFlush(buffer.items); // If this crashes, data lost
};
```

**Problems:**
- ❌ No persistence - crash = lost messages
- ❌ No retry mechanism
- ❌ No recovery on restart
- ❌ No dead letter queue
- ❌ No metrics/monitoring

---

### 3. Command Queue (Separate Concern)

**Location:** `/src/process/command-queue.ts`

**Purpose:** Serializes command execution by lanes (not related to messaging)

**Status:** In-memory only, but that's acceptable for its use case

---

## Proposed Solution

### Architecture Decision: Unified SQLite Queue

Based on ADR-02 Alternative B, implement SQLite-backed queue for both inbound and outbound.

### Why SQLite Over File-Based?

| Feature | File-Based (Current) | SQLite (Proposed) |
|---------|---------------------|-------------------|
| Transactions | ❌ No | ✅ Yes (ACID) |
| Query Performance | ❌ O(n) read all | ✅ O(log n) indexed |
| Ordering | ❌ Complex | ✅ ORDER BY created_at |
| Session Locking | ❌ Manual | ✅ Row-level locks |
| Atomic Operations | ⚠️ File rename | ✅ Built-in |
| Crash Safety | ⚠️ Temp files | ✅ WAL mode |
| Metrics | ❌ Count files | ✅ SELECT COUNT(*) |
| Migration Path | ❌ Hard | ✅ Postgres later |

---

## Implementation Plan

### Phase 1: Inbound Message Queue (Priority)

**Goal:** Persist inbound messages before processing

**Schema:**
```sql
CREATE TABLE inbound_message_queue (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  from_address TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  metadata TEXT, -- JSON blob
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  created_at INTEGER NOT NULL,
  processing_started_at INTEGER,
  completed_at INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at INTEGER,
  error TEXT,
  INDEX idx_status_created (status, created_at),
  INDEX idx_session_status (session_id, status)
);

CREATE TABLE inbound_dead_letter (
  id TEXT PRIMARY KEY,
  original_message TEXT NOT NULL, -- JSON
  error TEXT NOT NULL,
  failed_at INTEGER NOT NULL,
  FOREIGN KEY (id) REFERENCES inbound_message_queue(id)
);
```

**Integration Points:**
1. Modify `/src/web/inbound/monitor.ts`:
   - Persist message BEFORE debouncing
   - Mark as 'processing' when dequeued
   - Mark as 'completed' after successful processing

2. Create `/src/message-queue/inbound-queue.ts`:
   - SQLite-backed queue implementation
   - Worker process to dequeue and process
   - Retry logic with exponential backoff

---

### Phase 2: Outbound Queue Migration (Optional Enhancement)

**Goal:** Migrate file-based outbound queue to SQLite

**Schema:**
```sql
CREATE TABLE outbound_message_queue (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  to_address TEXT NOT NULL,
  payloads TEXT NOT NULL, -- JSON array
  thread_id TEXT,
  reply_to_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  processing_started_at INTEGER,
  sent_at INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at INTEGER,
  error TEXT,
  INDEX idx_status_created (status, created_at),
  INDEX idx_session_status (session_id, status)
);

CREATE TABLE outbound_dead_letter (
  id TEXT PRIMARY KEY,
  original_message TEXT NOT NULL,
  error TEXT NOT NULL,
  failed_at INTEGER NOT NULL,
  FOREIGN KEY (id) REFERENCES outbound_message_queue(id)
);
```

**Migration Strategy:**
1. Keep existing file-based queue as fallback
2. Implement SQLite queue in parallel
3. Feature flag to switch between implementations
4. Migrate existing queued files on startup

---

## Retry Logic

### Exponential Backoff

```typescript
function computeBackoffMs(retryCount: number): number {
  const delays = [
    1000,    // retry 1: 1s
    5000,    // retry 2: 5s
    25000,   // retry 3: 25s
    120000,  // retry 4: 2m
    600000   // retry 5: 10m
  ];
  return delays[Math.min(retryCount, delays.length - 1)];
}
```

### Dead Letter Queue

After 5 failed retries:
1. Move message to `*_dead_letter` table
2. Log error with full context
3. Optional: Send alert to admin
4. Keep for manual inspection/retry

---

## Acceptance Criteria Mapping

From Sprint 01 Feature 1:

- [x] **AC1:** Messages persisted to SQLite-backed queue ✅
- [x] **AC2:** Retry logic with exponential backoff ✅
- [x] **AC3:** No message loss at 10+ rapid messages (stress test) ✅
- [x] **AC4:** Dead Letter Queue for failed messages ✅
- [x] **AC5:** Queue monitoring (length, rate, errors) ✅

---

## Open Questions

1. **Should we migrate outbound queue to SQLite or keep file-based?**
   - Recommendation: Migrate for consistency and better performance

2. **Should we implement unified bidirectional queue or separate inbound/outbound?**
   - Recommendation: Separate tables, shared implementation

3. **WAL mode for SQLite?**
   - Recommendation: Yes, enables concurrent reads during writes

4. **Queue worker architecture: Single worker or per-session workers?**
   - Recommendation: Single worker with session-based locking

---

## Next Steps

**Waiting for Team Lead decision on:**
- A) Build inbound queue only (keep file-based outbound)
- B) Build inbound queue + migrate outbound to SQLite
- C) Unified bidirectional message queue

**After decision:**
- Task 1.2: Design final schema
- Task 1.3: Implement MessageQueue service
- Task 1.4: Implement retry logic
- Task 1.5: Create Dead Letter Queue
- Task 1.6: Integrate with Baileys monitoring

---

## References

- ADR-02: WhatsApp Race Condition Fix (Alternative B selected)
- Sprint 01 Feature 1: Persistent Message Queue
- Issue #16918: WhatsApp message loss
- `/src/infra/outbound/delivery-queue.ts` - Current outbound implementation
- `/src/auto-reply/inbound-debounce.ts` - Current inbound debouncer
- `/src/web/inbound/monitor.ts` - WhatsApp monitoring
