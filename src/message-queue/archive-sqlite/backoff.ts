/**
 * Retry backoff logic for message queue.
 *
 * Implements exponential backoff with configurable delays.
 * Preserves existing outbound queue retry intervals for compatibility.
 *
 * @module message-queue/backoff
 */

/**
 * Outbound queue backoff delays (preserves existing behavior).
 * From /src/infra/outbound/delivery-queue.ts
 */
export const OUTBOUND_BACKOFF_MS = [
  5_000, // retry 1: 5s
  25_000, // retry 2: 25s
  120_000, // retry 3: 2m
  600_000, // retry 4: 10m
  600_000, // retry 5: 10m (repeat last)
] as const;

/**
 * Inbound queue backoff delays (more aggressive for user-facing messages).
 */
export const INBOUND_BACKOFF_MS = [
  1_000, // retry 1: 1s
  5_000, // retry 2: 5s
  25_000, // retry 3: 25s
  120_000, // retry 4: 2m
  600_000, // retry 5: 10m
] as const;

/**
 * Compute backoff delay in milliseconds for a given retry count.
 *
 * @param retryCount - Number of retries (1-based)
 * @param type - Queue type ('inbound' or 'outbound')
 * @returns Backoff delay in milliseconds
 *
 * @example
 * ```typescript
 * const delay = computeBackoffMs(1, 'inbound'); // 1000ms
 * const delay = computeBackoffMs(3, 'outbound'); // 120000ms
 * ```
 */
export function computeBackoffMs(
  retryCount: number,
  type: 'inbound' | 'outbound' = 'inbound',
): number {
  if (retryCount <= 0) {
    return 0;
  }

  const delays = type === 'outbound' ? OUTBOUND_BACKOFF_MS : INBOUND_BACKOFF_MS;
  const index = Math.min(retryCount - 1, delays.length - 1);
  return delays[index] ?? delays[delays.length - 1] ?? 0;
}

/**
 * Compute the next retry timestamp.
 *
 * @param retryCount - Number of retries (1-based)
 * @param type - Queue type
 * @returns Unix timestamp (ms) for next retry
 *
 * @example
 * ```typescript
 * const nextRetry = computeNextRetryAt(1, 'inbound');
 * // Returns Date.now() + 1000
 * ```
 */
export function computeNextRetryAt(
  retryCount: number,
  type: 'inbound' | 'outbound' = 'inbound',
): number {
  return Date.now() + computeBackoffMs(retryCount, type);
}

/**
 * Check if a message should be retried based on retry count.
 *
 * @param retryCount - Current retry count
 * @param maxRetries - Maximum allowed retries
 * @returns True if should retry, false if should move to DLQ
 */
export function shouldRetry(retryCount: number, maxRetries: number): boolean {
  return retryCount < maxRetries;
}

/**
 * Check if a retry is due based on timestamp.
 *
 * @param nextRetryAt - Scheduled retry timestamp (ms)
 * @returns True if retry is due now
 */
export function isRetryDue(nextRetryAt: number | null | undefined): boolean {
  if (nextRetryAt == null) {
    return true;
  }
  return Date.now() >= nextRetryAt;
}
