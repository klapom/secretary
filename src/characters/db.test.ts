/**
 * Character database tests
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CharacterDatabase } from "./db.js";

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
});
