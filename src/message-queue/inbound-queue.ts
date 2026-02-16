/**
 * Inbound message queue (file-based).
 *
 * Persists incoming messages to disk before processing to prevent loss during
 * crashes or long-running AI operations. Mirrors the pattern from
 * /src/infra/outbound/delivery-queue.ts for consistency.
 *
 * @module message-queue/inbound-queue
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

const QUEUE_DIRNAME = "inbound-queue";
const FAILED_DIRNAME = "failed";
const MAX_RETRIES = 5;

/** Backoff delays in milliseconds indexed by retry count (1-based). */
const BACKOFF_MS: readonly number[] = [
  1_000, // retry 1: 1s
  5_000, // retry 2: 5s
  25_000, // retry 3: 25s
  120_000, // retry 4: 2m
  600_000, // retry 5: 10m
];

/**
 * Inbound message stored in queue before processing.
 */
export interface QueuedInboundMessage {
  id: string;
  enqueuedAt: number;
  channel: string;
  from: string;
  accountId?: string;
  sessionId: string;
  chatId?: string | null;
  chatType?: "dm" | "group" | null;
  body?: string | null;
  mediaUrls?: string[] | null;
  mentionedJids?: string[] | null;
  replyToId?: string | null;
  metadata?: Record<string, unknown> | null;
  retryCount: number;
  lastError?: string;
}

function resolveQueueDir(stateDir?: string): string {
  const base = stateDir ?? resolveStateDir();
  return path.join(base, QUEUE_DIRNAME);
}

function resolveFailedDir(stateDir?: string): string {
  return path.join(resolveQueueDir(stateDir), FAILED_DIRNAME);
}

/** Ensure the queue directory (and failed/ subdirectory) exist. */
export async function ensureInboundQueueDir(stateDir?: string): Promise<string> {
  const queueDir = resolveQueueDir(stateDir);
  await fs.promises.mkdir(queueDir, { recursive: true, mode: 0o700 });
  await fs.promises.mkdir(resolveFailedDir(stateDir), { recursive: true, mode: 0o700 });
  return queueDir;
}

/** Parameters for enqueueing an inbound message. */
export type QueuedInboundMessageParams = {
  channel: string;
  from: string;
  accountId?: string;
  sessionId: string;
  chatId?: string | null;
  chatType?: "dm" | "group" | null;
  body?: string | null;
  mediaUrls?: string[] | null;
  mentionedJids?: string[] | null;
  replyToId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Persist an inbound message to disk before processing.
 *
 * Uses atomic write (temp file + rename) to prevent corruption.
 *
 * @param params - Message parameters
 * @param stateDir - Optional state directory override
 * @returns Message ID
 *
 * @example
 * ```typescript
 * const id = await enqueueInboundMessage({
 *   channel: 'whatsapp',
 *   from: '+1234567890',
 *   sessionId: 'session-123',
 *   body: 'Hello world'
 * });
 * ```
 */
export async function enqueueInboundMessage(
  params: QueuedInboundMessageParams,
  stateDir?: string,
): Promise<string> {
  const queueDir = await ensureInboundQueueDir(stateDir);
  const id = crypto.randomUUID();
  const entry: QueuedInboundMessage = {
    id,
    enqueuedAt: Date.now(),
    channel: params.channel,
    from: params.from,
    accountId: params.accountId,
    sessionId: params.sessionId,
    chatId: params.chatId,
    chatType: params.chatType,
    body: params.body,
    mediaUrls: params.mediaUrls,
    mentionedJids: params.mentionedJids,
    replyToId: params.replyToId,
    metadata: params.metadata,
    retryCount: 0,
  };
  const filePath = path.join(queueDir, `${id}.json`);
  const tmp = `${filePath}.${process.pid}.tmp`;
  const json = JSON.stringify(entry, null, 2);
  await fs.promises.writeFile(tmp, json, { encoding: "utf-8", mode: 0o600 });
  await fs.promises.rename(tmp, filePath);
  return id;
}

/**
 * Remove a successfully processed entry from the queue.
 *
 * @param id - Message ID
 * @param stateDir - Optional state directory override
 */
export async function ackInboundMessage(id: string, stateDir?: string): Promise<void> {
  const filePath = path.join(resolveQueueDir(stateDir), `${id}.json`);
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : null;
    if (code !== "ENOENT") {
      throw err;
    }
    // Already removed — no-op.
  }
}

/**
 * Update a queue entry after a failed processing attempt.
 *
 * Increments retry count and records error.
 *
 * @param id - Message ID
 * @param error - Error message
 * @param stateDir - Optional state directory override
 */
export async function failInboundMessage(
  id: string,
  error: string,
  stateDir?: string,
): Promise<void> {
  const filePath = path.join(resolveQueueDir(stateDir), `${id}.json`);
  const raw = await fs.promises.readFile(filePath, "utf-8");
  const entry: QueuedInboundMessage = JSON.parse(raw);
  entry.retryCount += 1;
  entry.lastError = error;
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(entry, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  await fs.promises.rename(tmp, filePath);
}

/**
 * Load all pending inbound messages from the queue directory.
 *
 * Skips malformed or inaccessible entries.
 *
 * @param stateDir - Optional state directory override
 * @returns Array of queued messages
 */
export async function loadPendingInboundMessages(
  stateDir?: string,
): Promise<QueuedInboundMessage[]> {
  const queueDir = resolveQueueDir(stateDir);
  let files: string[];
  try {
    files = await fs.promises.readdir(queueDir);
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : null;
    if (code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const entries: QueuedInboundMessage[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const filePath = path.join(queueDir, file);
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        continue;
      }
      const raw = await fs.promises.readFile(filePath, "utf-8");
      entries.push(JSON.parse(raw));
    } catch {
      // Skip malformed or inaccessible entries.
    }
  }
  return entries;
}

/**
 * Move a queue entry to the failed/ subdirectory (dead letter queue).
 *
 * @param id - Message ID
 * @param stateDir - Optional state directory override
 */
export async function moveInboundToFailed(id: string, stateDir?: string): Promise<void> {
  const queueDir = resolveQueueDir(stateDir);
  const failedDir = resolveFailedDir(stateDir);
  await fs.promises.mkdir(failedDir, { recursive: true, mode: 0o700 });
  const src = path.join(queueDir, `${id}.json`);
  const dest = path.join(failedDir, `${id}.json`);
  await fs.promises.rename(src, dest);
}

/**
 * Compute the backoff delay in ms for a given retry count.
 *
 * @param retryCount - Number of retries (1-based)
 * @returns Backoff delay in milliseconds
 */
export function computeInboundBackoffMs(retryCount: number): number {
  if (retryCount <= 0) {
    return 0;
  }
  return BACKOFF_MS[Math.min(retryCount - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS.at(-1) ?? 0;
}

/**
 * Process function type for inbound message handlers.
 */
export type ProcessInboundFn = (message: QueuedInboundMessage) => Promise<void>;

/**
 * Logger interface for recovery operations.
 */
export interface InboundRecoveryLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * On startup, scan the inbound queue and process any pending entries.
 *
 * Uses exponential backoff and moves entries that exceed MAX_RETRIES to failed/.
 * Processes oldest messages first.
 *
 * @param opts - Recovery options
 * @returns Recovery statistics
 *
 * @example
 * ```typescript
 * const result = await recoverPendingInboundMessages({
 *   process: async (msg) => { await handleMessage(msg); },
 *   log: console,
 * });
 * console.log(`Recovered: ${result.recovered}, Failed: ${result.failed}`);
 * ```
 */
export async function recoverPendingInboundMessages(opts: {
  process: ProcessInboundFn;
  log: InboundRecoveryLogger;
  stateDir?: string;
  /** Override for testing — resolves instead of using real setTimeout. */
  delay?: (ms: number) => Promise<void>;
  /** Maximum wall-clock time for recovery in ms. Default: 60,000. */
  maxRecoveryMs?: number;
}): Promise<{ recovered: number; failed: number; skipped: number }> {
  const pending = await loadPendingInboundMessages(opts.stateDir);
  if (pending.length === 0) {
    return { recovered: 0, failed: 0, skipped: 0 };
  }

  // Process oldest first.
  pending.sort((a, b) => a.enqueuedAt - b.enqueuedAt);

  opts.log.info(
    `Found ${pending.length} pending inbound message entries — starting recovery`,
  );

  const delayFn = opts.delay ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (opts.maxRecoveryMs ?? 60_000);

  let recovered = 0;
  let failed = 0;
  let skipped = 0;

  for (const entry of pending) {
    const now = Date.now();
    if (now >= deadline) {
      const deferred = pending.length - recovered - failed - skipped;
      opts.log.warn(`Recovery time budget exceeded — ${deferred} entries deferred to next restart`);
      break;
    }
    if (entry.retryCount >= MAX_RETRIES) {
      opts.log.warn(
        `Inbound message ${entry.id} exceeded max retries (${entry.retryCount}/${MAX_RETRIES}) — moving to failed/`,
      );
      try {
        await moveInboundToFailed(entry.id, opts.stateDir);
      } catch (err) {
        opts.log.error(`Failed to move entry ${entry.id} to failed/: ${String(err)}`);
      }
      skipped += 1;
      continue;
    }

    const backoff = computeInboundBackoffMs(entry.retryCount + 1);
    if (backoff > 0) {
      if (now + backoff >= deadline) {
        const deferred = pending.length - recovered - failed - skipped;
        opts.log.warn(
          `Recovery time budget exceeded — ${deferred} entries deferred to next restart`,
        );
        break;
      }
      opts.log.info(`Waiting ${backoff}ms before retrying inbound message ${entry.id}`);
      await delayFn(backoff);
    }

    try {
      await opts.process(entry);
      await ackInboundMessage(entry.id, opts.stateDir);
      recovered += 1;
      opts.log.info(`Recovered inbound message ${entry.id} from ${entry.channel}:${entry.from}`);
    } catch (err) {
      try {
        await failInboundMessage(
          entry.id,
          err instanceof Error ? err.message : String(err),
          opts.stateDir,
        );
      } catch {
        // Best-effort update.
      }
      failed += 1;
      opts.log.warn(
        `Retry failed for inbound message ${entry.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  opts.log.info(
    `Inbound recovery complete: ${recovered} recovered, ${failed} failed, ${skipped} skipped (max retries)`,
  );
  return { recovered, failed, skipped };
}

export { MAX_RETRIES };
