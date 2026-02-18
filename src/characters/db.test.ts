/**
 * Character database tests
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CharacterDatabase, getCharacterDatabase, closeCharacterDatabase } from "./db.js";
import { dropCharacterSchema, vacuumCharacterDatabase, getSchemaVersion } from "./schema.js";

describe("CharacterDatabase", () => {
  const testDbPath = path.join(process.cwd(), "test-characters.db");
  const testAssetsDir = path.join(process.cwd(), "test-assets");
  let db: CharacterDatabase;

  beforeEach(() => {
    // Clean up previous test data
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testAssetsDir)) {
      fs.rmSync(testAssetsDir, { recursive: true });
    }

    db = new CharacterDatabase({
      dbPath: testDbPath,
      assetsDir: testAssetsDir,
    });
  });

  afterEach(() => {
    db.close();

    // Clean up test files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      fs.unlinkSync(`${testDbPath}-shm`);
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      fs.unlinkSync(`${testDbPath}-wal`);
    }
    if (fs.existsSync(testAssetsDir)) {
      fs.rmSync(testAssetsDir, { recursive: true });
    }
  });

  describe("createCharacter", () => {
    it("should create a new character", () => {
      const input = {
        name: "test-character",
        displayName: "Test Character",
        description: "A test character",
        personality: "Friendly and helpful",
      };

      const character = db.createCharacter(input);

      expect(character).toBeDefined();
      expect(character.id).toBeTruthy();
      expect(character.name).toBe(input.name);
      expect(character.displayName).toBe(input.displayName);
      expect(character.description).toBe(input.description);
      expect(character.personality).toBe(input.personality);
      expect(character.isActive).toBe(false);
      expect(character.createdAt).toBeGreaterThan(0);
      expect(character.updatedAt).toBeGreaterThan(0);
    });

    it("should enforce unique names", () => {
      const input = {
        name: "unique-character",
        displayName: "Unique Character",
      };

      db.createCharacter(input);

      // Attempting to create another character with same name should fail
      // Note: SQLite will throw error due to UNIQUE constraint
      expect(() => db.createCharacter(input)).toThrow();
    });
  });

  describe("getCharacterById", () => {
    it("should retrieve character by ID", () => {
      const input = {
        name: "test-character",
        displayName: "Test Character",
      };

      const created = db.createCharacter(input);
      const retrieved = db.getCharacterById(created.id);

      expect(retrieved).toEqual(created);
    });

    it("should return null for non-existent ID", () => {
      const result = db.getCharacterById("non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("getCharacterByName", () => {
    it("should retrieve character by name", () => {
      const input = {
        name: "test-character",
        displayName: "Test Character",
      };

      const created = db.createCharacter(input);
      const retrieved = db.getCharacterByName(input.name);

      expect(retrieved).toEqual(created);
    });

    it("should return null for non-existent name", () => {
      const result = db.getCharacterByName("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("getAllCharacters", () => {
    it("should return all characters", () => {
      const input1 = { name: "char1", displayName: "Character 1" };
      const input2 = { name: "char2", displayName: "Character 2" };

      db.createCharacter(input1);
      db.createCharacter(input2);

      const all = db.getAllCharacters();

      expect(all).toHaveLength(2);
      expect(all.map((c) => c.name)).toContain("char1");
      expect(all.map((c) => c.name)).toContain("char2");
    });

    it("should return empty array when no characters exist", () => {
      const all = db.getAllCharacters();
      expect(all).toEqual([]);
    });
  });

  describe("updateCharacter", () => {
    it("should update character fields", async () => {
      const input = {
        name: "test-character",
        displayName: "Test Character",
      };

      const created = db.createCharacter(input);

      // Wait 2ms to ensure updatedAt timestamp is different
      await new Promise((resolve) => setTimeout(resolve, 2));

      const update = {
        displayName: "Updated Character",
        description: "New description",
      };

      const updated = db.updateCharacter(created.id, update);

      expect(updated).toBeDefined();
      expect(updated!.displayName).toBe(update.displayName);
      expect(updated!.description).toBe(update.description);
      expect(updated!.name).toBe(input.name); // Name should not change
      expect(updated!.updatedAt).toBeGreaterThan(created.updatedAt);
    });

    it("should return null for non-existent character", () => {
      const result = db.updateCharacter("non-existent", { displayName: "Test" });
      expect(result).toBeNull();
    });
  });

  describe("deleteCharacter", () => {
    it("should delete character", () => {
      const input = {
        name: "test-character",
        displayName: "Test Character",
      };

      const created = db.createCharacter(input);
      const deleted = db.deleteCharacter(created.id);

      expect(deleted).toBe(true);
      expect(db.getCharacterById(created.id)).toBeNull();
    });

    it("should return false for non-existent character", () => {
      const result = db.deleteCharacter("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("activateCharacter", () => {
    it("should activate character", () => {
      const input1 = { name: "char1", displayName: "Character 1" };
      const input2 = { name: "char2", displayName: "Character 2" };

      const char1 = db.createCharacter(input1);
      const char2 = db.createCharacter(input2);

      const activated = db.activateCharacter(char2.id);

      expect(activated).toBeDefined();
      expect(activated!.isActive).toBe(true);

      // Check that char1 is deactivated
      const char1Updated = db.getCharacterById(char1.id);
      expect(char1Updated!.isActive).toBe(false);
    });

    it("should return null for non-existent character", () => {
      const result = db.activateCharacter("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("getActiveCharacter", () => {
    it("should return active character", () => {
      const input1 = { name: "char1", displayName: "Character 1" };
      const input2 = { name: "char2", displayName: "Character 2" };

      db.createCharacter(input1);
      const char2 = db.createCharacter(input2);
      db.activateCharacter(char2.id);

      const active = db.getActiveCharacter();

      expect(active).toBeDefined();
      expect(active!.id).toBe(char2.id);
      expect(active!.isActive).toBe(true);
    });

    it("should return null when no character is active", () => {
      const active = db.getActiveCharacter();
      expect(active).toBeNull();
    });
  });

  describe("updateCharacterAvatar", () => {
    it("should update character avatar path", () => {
      const input = { name: "test-char", displayName: "Test" };
      const char = db.createCharacter(input);

      const avatarPath = "/path/to/avatar.png";
      const updated = db.updateCharacterAvatar(char.id, avatarPath);

      expect(updated).toBeDefined();
      expect(updated!.avatarImagePath).toBe(avatarPath);
    });

    it("should return null for non-existent character", () => {
      const result = db.updateCharacterAvatar("non-existent", "/path/avatar.png");
      expect(result).toBeNull();
    });
  });

  describe("updateCharacterVoice", () => {
    it("should update character voice sample and voice ID", () => {
      const input = { name: "test-char", displayName: "Test" };
      const char = db.createCharacter(input);

      const voicePath = "/path/to/voice.mp3";
      const voiceId = "voice-123";
      const updated = db.updateCharacterVoice(char.id, voicePath, voiceId);

      expect(updated).toBeDefined();
      expect(updated!.voiceSamplePath).toBe(voicePath);
      expect(updated!.voiceId).toBe(voiceId);
    });

    it("should update voice sample without voice ID", () => {
      const input = { name: "test-char", displayName: "Test" };
      const char = db.createCharacter(input);

      const voicePath = "/path/to/voice.wav";
      const updated = db.updateCharacterVoice(char.id, voicePath);

      expect(updated).toBeDefined();
      expect(updated!.voiceSamplePath).toBe(voicePath);
      expect(updated!.voiceId).toBeUndefined();
    });

    it("should return null for non-existent character", () => {
      const result = db.updateCharacterVoice("non-existent", "/path/voice.mp3");
      expect(result).toBeNull();
    });
  });

  describe("asset management", () => {
    it("should record asset uploads", () => {
      const input = { name: "test-char", displayName: "Test" };
      const char = db.createCharacter(input);

      db.recordAssetUpload({
        characterId: char.id,
        assetType: "avatar",
        filePath: "/path/avatar.png",
        mimeType: "image/png",
        fileSize: 1024,
      });

      const assets = db.getCharacterAssets(char.id);
      expect(assets).toHaveLength(1);
      expect(assets[0].asset_type).toBe("avatar");
      expect(assets[0].file_path).toBe("/path/avatar.png");
      expect(assets[0].mime_type).toBe("image/png");
      expect(assets[0].file_size).toBe(1024);
    });

    it("should retrieve multiple assets for a character", () => {
      const input = { name: "test-char", displayName: "Test" };
      const char = db.createCharacter(input);

      db.recordAssetUpload({
        characterId: char.id,
        assetType: "avatar",
        filePath: "/path/avatar.png",
        mimeType: "image/png",
        fileSize: 1024,
      });

      db.recordAssetUpload({
        characterId: char.id,
        assetType: "voice",
        filePath: "/path/voice.mp3",
        mimeType: "audio/mpeg",
        fileSize: 5120,
      });

      const assets = db.getCharacterAssets(char.id);
      expect(assets).toHaveLength(2);
      expect(assets.map((a) => a.asset_type)).toContain("avatar");
      expect(assets.map((a) => a.asset_type)).toContain("voice");
    });

    it("should return empty array for character with no assets", () => {
      const input = { name: "test-char", displayName: "Test" };
      const char = db.createCharacter(input);

      const assets = db.getCharacterAssets(char.id);
      expect(assets).toHaveLength(0);
    });
  });

  describe("deleteCharacter with asset files", () => {
    it("should delete asset files from disk on character deletion", () => {
      const char = db.createCharacter({ name: "asset-char", displayName: "Asset Char" });

      // Create a real temporary file to simulate an uploaded asset
      const fakeAssetPath = path.join(testAssetsDir, "fake-avatar.png");
      fs.mkdirSync(testAssetsDir, { recursive: true });
      fs.writeFileSync(fakeAssetPath, "fake image data");

      db.recordAssetUpload({
        characterId: char.id,
        assetType: "avatar",
        filePath: fakeAssetPath,
        mimeType: "image/png",
        fileSize: 16,
      });

      expect(fs.existsSync(fakeAssetPath)).toBe(true);

      const deleted = db.deleteCharacter(char.id);

      expect(deleted).toBe(true);
      expect(fs.existsSync(fakeAssetPath)).toBe(false);
    });

    it("should not fail if asset file does not exist on disk", () => {
      const char = db.createCharacter({ name: "missing-asset-char", displayName: "Missing Asset" });

      db.recordAssetUpload({
        characterId: char.id,
        assetType: "avatar",
        filePath: "/tmp/non-existent-file-xyz.png",
        mimeType: "image/png",
        fileSize: 0,
      });

      // Should not throw even if file is missing
      expect(() => db.deleteCharacter(char.id)).not.toThrow();
    });
  });

  describe("ensureDefaultCharacter", () => {
    it("should create default character if none exist", async () => {
      const { ensureDefaultCharacter } = await import("./default-character.js");

      const chars = db.getAllCharacters();
      expect(chars).toHaveLength(0);

      ensureDefaultCharacter(db);

      const updated = db.getAllCharacters();
      expect(updated).toHaveLength(1);
      expect(updated[0].name).toBe("secretary");
      expect(updated[0].isActive).toBe(true);
    });

    it("should not create default character if one exists", async () => {
      const { ensureDefaultCharacter } = await import("./default-character.js");

      db.createCharacter({
        name: "existing-char",
        displayName: "Existing",
      });

      ensureDefaultCharacter(db);

      const chars = db.getAllCharacters();
      expect(chars).toHaveLength(1);
      expect(chars[0].name).toBe("existing-char");
    });
  });

  describe("singleton (getCharacterDatabase / closeCharacterDatabase)", () => {
    const singletonDbPath = path.join(process.cwd(), "test-singleton.db");
    const singletonAssetsDir = path.join(process.cwd(), "test-singleton-assets");

    afterEach(() => {
      closeCharacterDatabase();
      for (const f of [singletonDbPath, `${singletonDbPath}-shm`, `${singletonDbPath}-wal`]) {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
        }
      }
      if (fs.existsSync(singletonAssetsDir)) {
        fs.rmSync(singletonAssetsDir, { recursive: true });
      }
    });

    it("should return the same instance on repeated calls", () => {
      const config = { dbPath: singletonDbPath, assetsDir: singletonAssetsDir };
      const first = getCharacterDatabase(config);
      const second = getCharacterDatabase(config);
      expect(first).toBe(second);
    });

    it("should create a new instance after closeCharacterDatabase", () => {
      const config = { dbPath: singletonDbPath, assetsDir: singletonAssetsDir };
      getCharacterDatabase(config).createCharacter({ name: "before-close", displayName: "Before" });
      closeCharacterDatabase();
      // After close, a new instance is created — verify it's functional
      const second = getCharacterDatabase(config);
      expect(() => second.getAllCharacters()).not.toThrow();
    });

    it("closeCharacterDatabase should be safe to call when no instance exists", () => {
      closeCharacterDatabase(); // ensure clean state
      expect(() => closeCharacterDatabase()).not.toThrow();
    });
  });
});

describe("schema helpers", () => {
  it("getSchemaVersion should return 1", () => {
    expect(getSchemaVersion()).toBe(1);
  });

  it("dropCharacterSchema should drop tables without error", () => {
    const memDb = new DatabaseSync(":memory:");
    // Tables don't exist yet — DROP IF EXISTS should not throw
    expect(() => dropCharacterSchema(memDb)).not.toThrow();
  });

  it("vacuumCharacterDatabase should run without error", () => {
    const memDb = new DatabaseSync(":memory:");
    expect(() => vacuumCharacterDatabase(memDb)).not.toThrow();
  });
});
