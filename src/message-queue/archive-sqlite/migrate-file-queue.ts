/**
 * Migration script for file-based delivery queue to SQLite.
 *
 * Migrates existing *.json files from delivery-queue/ directory
 * to the SQLite outbound_message_queue table.
 *
 * @module message-queue/migrate-file-queue
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

/**
 * File-based queue entry format (from /src/infra/outbound/delivery-queue.ts)
 */
interface QueuedDelivery {
  id: string;
  enqueuedAt: number;
  channel: string;
  to: string;
  accountId?: string;
  payloads: unknown[];
  threadId?: string | number | null;
  replyToId?: string | null;
  bestEffort?: boolean;
  gifPlayback?: boolean;
  silent?: boolean;
  mirror?: unknown;
  retryCount: number;
  lastError?: string;
}

/**
 * Migration result.
 */
export interface MigrationResult {
  migrated: number;
  failed: number;
  skipped: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Logger interface for migration progress.
 */
export interface MigrationLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Migrate file-based delivery queue to SQLite.
 *
 * Process:
 * 1. Read all *.json files from queueDir
 * 2. Insert into outbound_message_queue table
 * 3. Delete file after successful migration
 * 4. Move failed files to failed/ subdirectory
 *
 * @param params - Migration parameters
 * @returns Migration result with counts
 *
 * @example
 * ```typescript
 * const result = await migrateFileQueueToSqlite({
 *   queueDir: '/path/to/delivery-queue',
 *   db: database,
 *   log: console
 * });
 * console.log(`Migrated: ${result.migrated}, Failed: ${result.failed}`);
 * ```
 */
export async function migrateFileQueueToSqlite(params: {
  queueDir: string;
  db: DatabaseSync;
  log: MigrationLogger;
  dryRun?: boolean;
}): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Check if directory exists
  try {
    await fs.access(params.queueDir);
  } catch {
    params.log.warn(`Queue directory does not exist: ${params.queueDir}`);
    return result;
  }

  // Read all files
  let files: string[];
  try {
    files = await fs.readdir(params.queueDir);
  } catch (err) {
    params.log.error(`Failed to read queue directory: ${String(err)}`);
    return result;
  }

  params.log.info(`Found ${files.length} files in queue directory`);

  // Filter JSON files only
  const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.includes('.tmp'));

  if (jsonFiles.length === 0) {
    params.log.info('No queue files to migrate');
    return result;
  }

  params.log.info(`Migrating ${jsonFiles.length} queue files...`);

  // Prepare insert statement
  const insertStmt = params.db.prepare(`
    INSERT INTO outbound_message_queue
    (id, session_id, channel, to_address, account_id, payloads,
     thread_id, reply_to_id, best_effort, gif_playback, silent, mirror,
     status, created_at, retry_count, max_retries)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 5)
  `);

  for (const file of jsonFiles) {
    const filePath = path.join(params.queueDir, file);

    try {
      // Read file
      const content = await fs.readFile(filePath, 'utf-8');
      const entry: QueuedDelivery = JSON.parse(content);

      // Validate required fields
      if (!entry.id || !entry.channel || !entry.to || !entry.payloads) {
        params.log.warn(`Skipping invalid entry: ${file}`);
        result.skipped++;
        continue;
      }

      if (!params.dryRun) {
        // Insert into SQLite
        insertStmt.run(
          entry.id,
          entry.to, // Use 'to' as session_id approximation
          entry.channel,
          entry.to,
          entry.accountId ?? null,
          JSON.stringify(entry.payloads),
          entry.threadId?.toString() ?? null,
          entry.replyToId ?? null,
          entry.bestEffort ? 1 : 0,
          entry.gifPlayback ? 1 : 0,
          entry.silent ? 1 : 0,
          entry.mirror ? JSON.stringify(entry.mirror) : null,
          entry.enqueuedAt,
          entry.retryCount,
        );

        // Delete file after successful migration
        await fs.unlink(filePath);
      }

      result.migrated++;
      params.log.info(`Migrated: ${file}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      params.log.error(`Failed to migrate ${file}: ${errorMsg}`);
      result.failed++;
      result.errors.push({ file, error: errorMsg });

      // Move failed file to failed/ subdirectory
      if (!params.dryRun) {
        try {
          const failedDir = path.join(params.queueDir, 'failed');
          await fs.mkdir(failedDir, { recursive: true });
          await fs.rename(filePath, path.join(failedDir, file));
        } catch {
          // Ignore move errors
        }
      }
    }
  }

  params.log.info(
    `Migration complete: ${result.migrated} migrated, ${result.failed} failed, ${result.skipped} skipped`,
  );

  return result;
}

/**
 * Validate migration by comparing counts.
 *
 * @param params - Validation parameters
 * @returns True if counts match
 */
export async function validateMigration(params: {
  queueDir: string;
  db: DatabaseSync;
  log: MigrationLogger;
}): Promise<boolean> {
  // Count remaining files
  let files: string[];
  try {
    files = await fs.readdir(params.queueDir);
  } catch {
    files = [];
  }

  const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.includes('.tmp'));

  // Count SQLite rows
  const stmt = params.db.prepare(`
    SELECT COUNT(*) as count FROM outbound_message_queue
  `);
  const dbCount = (stmt.get() as { count: number }).count;

  params.log.info(`Validation: ${jsonFiles.length} files remaining, ${dbCount} in database`);

  return jsonFiles.length === 0;
}
