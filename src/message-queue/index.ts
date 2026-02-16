/**
 * Message Queue Module
 *
 * File-based persistent message queues for inbound and outbound messages.
 * Prevents message loss during crashes, long-running operations, or socket reconnects.
 *
 * Features:
 * - Atomic file operations (write to temp + rename)
 * - Automatic retry with exponential backoff
 * - Dead letter queue (failed/ subdirectory)
 * - Recovery on startup
 * - Interface-based design for future SQLite/PostgreSQL migration
 *
 * Directory Structure:
 * ```
 * state/
 *   ├── inbound-queue/
 *   │   ├── {id}.json         # Pending messages
 *   │   └── failed/
 *   │       └── {id}.json     # Dead letter queue
 *   └── delivery-queue/       # Existing outbound (unchanged)
 *       ├── {id}.json
 *       └── failed/
 * ```
 *
 * @module message-queue
 */

// Types
export type {
  IMessageQueue,
  IQueueRecovery,
  IRecoveryLogger,
  RecoveryResult,
} from "./types.js";

// Inbound queue
export {
  enqueueInboundMessage,
  ackInboundMessage,
  failInboundMessage,
  loadPendingInboundMessages,
  moveInboundToFailed,
  computeInboundBackoffMs,
  recoverPendingInboundMessages,
  ensureInboundQueueDir,
  MAX_RETRIES,
} from "./inbound-queue.js";

export type {
  QueuedInboundMessage,
  QueuedInboundMessageParams,
  ProcessInboundFn,
  InboundRecoveryLogger,
} from "./inbound-queue.js";

// Outbound queue (re-export existing)
// Note: Outbound queue is already implemented in /src/infra/outbound/delivery-queue.ts
// We keep it as-is and just provide references here for consistency
export type { QueuedDelivery } from "../infra/outbound/delivery-queue.js";
export {
  enqueueDelivery,
  ackDelivery,
  failDelivery,
  loadPendingDeliveries,
  moveToFailed,
  computeBackoffMs,
  recoverPendingDeliveries,
  ensureQueueDir,
} from "../infra/outbound/delivery-queue.js";
