/**
 * Unit tests for EncryptionService.
 *
 * Tests AES-256-GCM encryption/decryption functionality.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { EncryptionService, encryptText, decryptText } from "./encryption.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("EncryptionService", () => {
  let tempKeyFile: string;

  beforeEach(() => {
    // Create temp directory for test keys
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "encryption-test-"));
    tempKeyFile = path.join(tempDir, "test.key");
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tempKeyFile)) {
      fs.rmSync(path.dirname(tempKeyFile), { recursive: true, force: true });
    }
  });

  describe("Key Generation", () => {
    it("should generate 32-byte keys", () => {
      const key = EncryptionService.generateKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it("should generate random keys", () => {
      const key1 = EncryptionService.generateKey();
      const key2 = EncryptionService.generateKey();
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe("Initialization", () => {
    it("should accept a key buffer", () => {
      const key = EncryptionService.generateKey();
      const service = new EncryptionService({ key });
      expect(service).toBeInstanceOf(EncryptionService);
    });

    it("should auto-generate key if none provided", () => {
      const service = new EncryptionService({
        keyFile: tempKeyFile,
        autoGenerateKey: true,
      });
      expect(service).toBeInstanceOf(EncryptionService);
      expect(fs.existsSync(tempKeyFile)).toBe(true);
    });

    it("should load existing key from file", () => {
      // Generate and save a key
      const key = EncryptionService.generateKey();
      fs.mkdirSync(path.dirname(tempKeyFile), { recursive: true });
      fs.writeFileSync(tempKeyFile, key.toString("hex"));

      // Load it
      const service = new EncryptionService({ keyFile: tempKeyFile });
      const exported = service.exportKey();
      expect(exported).toBe(key.toString("hex"));
    });

    it("should throw if key file missing and autoGenerate=false", () => {
      expect(() => {
        new EncryptionService({
          keyFile: tempKeyFile,
          autoGenerateKey: false,
        });
      }).toThrow();
    });

    it("should reject invalid key lengths", () => {
      const shortKey = Buffer.alloc(16); // Only 16 bytes
      expect(() => {
        new EncryptionService({ key: shortKey });
      }).toThrow("Encryption key must be 32 bytes");
    });
  });

  describe("Encryption/Decryption", () => {
    let service: EncryptionService;

    beforeEach(() => {
      const key = EncryptionService.generateKey();
      service = new EncryptionService({ key });
    });

    it("should encrypt plaintext", () => {
      const plaintext = "Hello, World!";
      const encrypted = service.encrypt(plaintext);

      expect(encrypted).toHaveProperty("iv");
      expect(encrypted).toHaveProperty("authTag");
      expect(encrypted).toHaveProperty("encrypted");
      expect(encrypted.iv).toMatch(/^[0-9a-f]{32}$/); // 16 bytes hex
      expect(encrypted.authTag).toMatch(/^[0-9a-f]{32}$/); // 16 bytes hex
      expect(encrypted.encrypted).toMatch(/^[0-9a-f]+$/); // hex string
    });

    it("should decrypt encrypted data", () => {
      const plaintext = "Secret message!";
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should use different IVs for each encryption", () => {
      const plaintext = "Same message";
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
    });

    it("should handle empty strings", () => {
      const plaintext = "";
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should handle long texts", () => {
      const plaintext = "A".repeat(10000);
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should handle special characters", () => {
      const plaintext = "Special chars: 🔐 中文 עברית €£¥";
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should handle newlines and whitespace", () => {
      const plaintext = "Line 1\nLine 2\r\nLine 3\n\tTabbed";
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("String Format", () => {
    let service: EncryptionService;

    beforeEach(() => {
      const key = EncryptionService.generateKey();
      service = new EncryptionService({ key });
    });

    it("should encrypt to string format", () => {
      const plaintext = "Test message";
      const encrypted = service.encryptToString(plaintext);
      expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it("should decrypt from string format", () => {
      const plaintext = "Another test";
      const encrypted = service.encryptToString(plaintext);
      const decrypted = service.decryptFromString(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should reject invalid string format", () => {
      expect(() => {
        service.decryptFromString("invalid");
      }).toThrow("Invalid encrypted string format");
    });

    it("should reject malformed parts", () => {
      expect(() => {
        service.decryptFromString("part1:part2");
      }).toThrow("Invalid encrypted string format");
    });
  });

  describe("Authentication", () => {
    let service: EncryptionService;

    beforeEach(() => {
      const key = EncryptionService.generateKey();
      service = new EncryptionService({ key });
    });

    it("should detect tampered ciphertext", () => {
      const plaintext = "Authentic message";
      const encrypted = service.encrypt(plaintext);

      // Tamper with ciphertext
      encrypted.encrypted = encrypted.encrypted.slice(0, -2) + "ff";

      expect(() => {
        service.decrypt(encrypted);
      }).toThrow();
    });

    it("should detect tampered auth tag", () => {
      const plaintext = "Authentic message";
      const encrypted = service.encrypt(plaintext);

      // Tamper with auth tag
      encrypted.authTag = encrypted.authTag.slice(0, -2) + "ff";

      expect(() => {
        service.decrypt(encrypted);
      }).toThrow();
    });

    it("should detect wrong key", () => {
      const plaintext = "Secret";
      const encrypted = service.encrypt(plaintext);

      // Try to decrypt with different key
      const otherKey = EncryptionService.generateKey();
      const otherService = new EncryptionService({ key: otherKey });

      expect(() => {
        otherService.decrypt(encrypted);
      }).toThrow();
    });
  });

  describe("Key Management", () => {
    it("should export key as hex", () => {
      const key = EncryptionService.generateKey();
      const service = new EncryptionService({ key });
      const exported = service.exportKey();
      expect(exported).toBe(key.toString("hex"));
      expect(exported).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
    });

    it("should save key to file with correct permissions", () => {
      const service = new EncryptionService({
        keyFile: tempKeyFile,
        autoGenerateKey: true,
      });

      expect(fs.existsSync(tempKeyFile)).toBe(true);

      // Check file permissions (Unix only)
      if (process.platform !== "win32") {
        const stats = fs.statSync(tempKeyFile);
        const mode = stats.mode & 0o777;
        expect(mode).toBe(0o600); // Owner read/write only
      }
    });

    it("should use same key across instances with same file", () => {
      // Create first service, auto-generates key
      const service1 = new EncryptionService({
        keyFile: tempKeyFile,
        autoGenerateKey: true,
      });

      const plaintext = "Shared secret";
      const encrypted = service1.encryptToString(plaintext);

      // Create second service, loads existing key
      const service2 = new EncryptionService({ keyFile: tempKeyFile });
      const decrypted = service2.decryptFromString(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("Helper Functions", () => {
    it("should work with encryptText helper", () => {
      const plaintext = "Helper test";
      const encrypted = encryptText(plaintext);
      expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it("should work with decryptText helper", () => {
      const plaintext = "Round trip";
      const encrypted = encryptText(plaintext);
      const decrypted = decryptText(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("Edge Cases", () => {
    let service: EncryptionService;

    beforeEach(() => {
      const key = EncryptionService.generateKey();
      service = new EncryptionService({ key });
    });

    it("should handle JSON data", () => {
      const obj = { user: "john", password: "secret123" };
      const plaintext = JSON.stringify(obj);
      const encrypted = service.encryptToString(plaintext);
      const decrypted = service.decryptFromString(encrypted);
      expect(JSON.parse(decrypted)).toEqual(obj);
    });

    it("should handle binary-like data", () => {
      const plaintext = "\x00\x01\x02\xFF";
      const encrypted = service.encryptToString(plaintext);
      const decrypted = service.decryptFromString(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should handle very long texts", () => {
      const plaintext = "X".repeat(1000000); // 1MB
      const encrypted = service.encryptToString(plaintext);
      const decrypted = service.decryptFromString(encrypted);
      expect(decrypted.length).toBe(plaintext.length);
    });
  });

  describe("Security Properties", () => {
    it("should not leak plaintext in encrypted output", () => {
      const service = new EncryptionService({ key: EncryptionService.generateKey() });
      const plaintext = "SuperSecretPassword123";
      const encrypted = service.encryptToString(plaintext);

      // Encrypted output should not contain plaintext
      expect(encrypted.toLowerCase()).not.toContain("supersecret");
      expect(encrypted.toLowerCase()).not.toContain("password");
      expect(encrypted).not.toContain("123");
    });

    it("should produce different output for same plaintext", () => {
      const service = new EncryptionService({ key: EncryptionService.generateKey() });
      const plaintext = "Same message";

      const encrypted1 = service.encryptToString(plaintext);
      const encrypted2 = service.encryptToString(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });
});
