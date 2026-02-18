/**
 * SQLite schema for character management system.
 *
 * Creates tables for:
 * - Character profiles
 * - Active character tracking
 * - Asset metadata
 *
 * @module characters/schema
 */

import type { DatabaseSync } from "node:sqlite";

/**
 * Initialize the character management schema.
 *
 * Creates all tables and indexes. Idempotent - safe to call multiple times.
 *
 * @param db - SQLite database instance
 *
 * @example
 * ```typescript
 * const db = createCharacterDatabase({ dbPath: './characters.db' });
 * initializeCharacterSchema(db);
 * ```
 */
export function initializeCharacterSchema(db: DatabaseSync): void {
  // Character profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      avatar_image_path TEXT,
      voice_id TEXT,
      voice_sample_path TEXT,
      personality TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      metadata TEXT
    )
  `);

  // Indexes for character profiles
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_character_name
      ON character_profiles(name)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_character_active
      ON character_profiles(is_active)
      WHERE is_active = 1
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_character_updated
      ON character_profiles(updated_at DESC)
  `);

  // Asset metadata table (tracks uploaded files)
  db.exec(`
    CREATE TABLE IF NOT EXISTS character_assets (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_at INTEGER NOT NULL,
      FOREIGN KEY (character_id) REFERENCES character_profiles(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_asset_character
      ON character_assets(character_id, asset_type)
  `);
}

/**
 * Drop all character tables.
 *
 * WARNING: This deletes all character data. Use only for testing or migrations.
 *
 * @param db - SQLite database instance
 */
export function dropCharacterSchema(db: DatabaseSync): void {
  db.exec("DROP TABLE IF EXISTS character_assets");
  db.exec("DROP TABLE IF EXISTS character_profiles");
}

/**
 * Vacuum the database to reclaim space and optimize performance.
 *
 * Should be called periodically (e.g., after deleting characters).
 *
 * @param db - SQLite database instance
 */
export function vacuumCharacterDatabase(db: DatabaseSync): void {
  db.exec("VACUUM");
}

/**
 * Get schema version for migrations.
 *
 * @returns Current schema version
 */
export function getSchemaVersion(): number {
  return 1;
}
