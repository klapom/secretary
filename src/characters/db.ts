/**
 * Character database connection and operations.
 */

import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { initializeCharacterSchema } from "./schema.js";
import type {
  CharacterProfile,
  CreateCharacterInput,
  UpdateCharacterInput,
  CharacterAssetUpload,
} from "../config/types.characters.js";

export interface CharacterDatabaseConfig {
  dbPath: string;
  assetsDir: string;
}

export class CharacterDatabase {
  private db: DatabaseSync;
  private config: CharacterDatabaseConfig;

  constructor(config: CharacterDatabaseConfig) {
    this.config = config;

    // Ensure database directory exists
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Ensure assets directory exists
    if (!fs.existsSync(config.assetsDir)) {
      fs.mkdirSync(config.assetsDir, { recursive: true });
    }

    // Initialize database
    const sqlite = requireNodeSqlite();
    this.db = new sqlite.DatabaseSync(config.dbPath);

    // Enable WAL mode for better concurrency
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");

    // Initialize schema
    initializeCharacterSchema(this.db);
  }

  /**
   * Create a new character profile
   */
  createCharacter(input: CreateCharacterInput): CharacterProfile {
    const now = Date.now();
    const id = crypto.randomUUID();

    const stmt = this.db.prepare(`
      INSERT INTO character_profiles (
        id, name, display_name, description, personality,
        is_active, created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      input.displayName,
      input.description || null,
      input.personality || null,
      now,
      now,
      input.metadata ? JSON.stringify(input.metadata) : null,
    );

    return this.getCharacterById(id)!;
  }

  /**
   * Get character by ID
   */
  getCharacterById(id: string): CharacterProfile | null {
    const stmt = this.db.prepare("SELECT * FROM character_profiles WHERE id = ?");
    const row = stmt.get(id) as any;

    if (!row) return null;

    return this.rowToCharacter(row);
  }

  /**
   * Get character by name
   */
  getCharacterByName(name: string): CharacterProfile | null {
    const stmt = this.db.prepare("SELECT * FROM character_profiles WHERE name = ?");
    const row = stmt.get(name) as any;

    if (!row) return null;

    return this.rowToCharacter(row);
  }

  /**
   * Get all characters
   */
  getAllCharacters(): CharacterProfile[] {
    const stmt = this.db.prepare("SELECT * FROM character_profiles ORDER BY updated_at DESC");
    const rows = stmt.all() as any[];

    return rows.map((row) => this.rowToCharacter(row));
  }

  /**
   * Get active character
   */
  getActiveCharacter(): CharacterProfile | null {
    const stmt = this.db.prepare("SELECT * FROM character_profiles WHERE is_active = 1 LIMIT 1");
    const row = stmt.get() as any;

    if (!row) return null;

    return this.rowToCharacter(row);
  }

  /**
   * Update character
   */
  updateCharacter(id: string, input: UpdateCharacterInput): CharacterProfile | null {
    const existing = this.getCharacterById(id);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = ["updated_at = ?"];
    const values: any[] = [now];

    if (input.displayName !== undefined) {
      fields.push("display_name = ?");
      values.push(input.displayName);
    }

    if (input.description !== undefined) {
      fields.push("description = ?");
      values.push(input.description);
    }

    if (input.personality !== undefined) {
      fields.push("personality = ?");
      values.push(input.personality);
    }

    if (input.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(input.metadata));
    }

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE character_profiles
      SET ${fields.join(", ")}
      WHERE id = ?
    `);

    stmt.run(...values);

    return this.getCharacterById(id);
  }

  /**
   * Delete character
   */
  deleteCharacter(id: string): boolean {
    // Check if character exists
    const existing = this.getCharacterById(id);
    if (!existing) return false;

    // Delete associated assets
    const assets = this.getCharacterAssets(id);
    for (const asset of assets) {
      try {
        if (fs.existsSync(asset.file_path)) {
          fs.unlinkSync(asset.file_path);
        }
      } catch (err) {
        console.error(`Failed to delete asset file: ${asset.file_path}`, err);
      }
    }

    // Delete character (CASCADE will delete asset records)
    const stmt = this.db.prepare("DELETE FROM character_profiles WHERE id = ?");
    stmt.run(id);

    return true;
  }

  /**
   * Activate a character (deactivates all others)
   */
  activateCharacter(id: string): CharacterProfile | null {
    const existing = this.getCharacterById(id);
    if (!existing) return null;

    // Deactivate all characters
    this.db.prepare("UPDATE character_profiles SET is_active = 0").run();

    // Activate target character
    this.db.prepare("UPDATE character_profiles SET is_active = 1, updated_at = ? WHERE id = ?").run(
      Date.now(),
      id,
    );

    return this.getCharacterById(id);
  }

  /**
   * Update character avatar
   */
  updateCharacterAvatar(id: string, avatarPath: string): CharacterProfile | null {
    const stmt = this.db.prepare(`
      UPDATE character_profiles
      SET avatar_image_path = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(avatarPath, Date.now(), id);

    return this.getCharacterById(id);
  }

  /**
   * Update character voice
   */
  updateCharacterVoice(
    id: string,
    voiceSamplePath: string,
    voiceId?: string,
  ): CharacterProfile | null {
    const stmt = this.db.prepare(`
      UPDATE character_profiles
      SET voice_sample_path = ?, voice_id = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(voiceSamplePath, voiceId || null, Date.now(), id);

    return this.getCharacterById(id);
  }

  /**
   * Record asset upload
   */
  recordAssetUpload(upload: CharacterAssetUpload): void {
    const id = crypto.randomUUID();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO character_assets (
        id, character_id, asset_type, file_path,
        mime_type, file_size, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      upload.characterId,
      upload.assetType,
      upload.filePath,
      upload.mimeType,
      upload.fileSize,
      now,
    );
  }

  /**
   * Get character assets
   */
  getCharacterAssets(characterId: string): Array<{
    id: string;
    asset_type: string;
    file_path: string;
    mime_type: string;
    file_size: number;
    uploaded_at: number;
  }> {
    const stmt = this.db.prepare("SELECT * FROM character_assets WHERE character_id = ?");
    return stmt.all(characterId) as any[];
  }

  /**
   * Convert database row to CharacterProfile
   */
  private rowToCharacter(row: any): CharacterProfile {
    return {
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description || undefined,
      avatarImagePath: row.avatar_image_path || undefined,
      voiceId: row.voice_id || undefined,
      voiceSamplePath: row.voice_sample_path || undefined,
      personality: row.personality || undefined,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Singleton instance for the character database
 */
let dbInstance: CharacterDatabase | null = null;

export function getCharacterDatabase(config: CharacterDatabaseConfig): CharacterDatabase {
  if (!dbInstance) {
    dbInstance = new CharacterDatabase(config);
  }
  return dbInstance;
}

export function closeCharacterDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
