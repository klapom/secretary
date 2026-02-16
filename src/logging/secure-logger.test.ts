/**
 * Unit tests for SecureLogger.
 *
 * Tests multi-layer defense: redaction + encryption.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { SecureLogger, createSecureLogTransport, enableSecureLogging } from "./secure-logger.js";
import { EncryptionService } from "../security/encryption.js";
import { setLoggerOverride, resetLogger } from "./logger.js";

describe("SecureLogger", () => {
  beforeEach(() => {
    // Use in-memory logging for tests
    setLoggerOverride({ level: "trace", file: "/dev/null" });
  });

  afterEach(() => {
    resetLogger();
  });

  describe("Redaction Only", () => {
    it("should redact credentials by default", () => {
      const logger = new SecureLogger({
        enableRedaction: true,
        enableEncryption: false,
      });

      const message = "API key: sk-1234567890abcdefghijklmnopqrstuvwxyz";

      // Spy on base logger
      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info(message);

      // Check that logged message is redacted
      expect(spy).toHaveBeenCalled();
      const loggedMessage = spy.mock.calls[0][0];
      expect(loggedMessage).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
      expect(loggedMessage).toContain("[REDACTED:OPENAI_KEY]");
    });

    it("should redact multiple credentials", () => {
      const logger = new SecureLogger({ enableRedaction: true });
      const message = "Key: sk-1234567890abcdefghijklmnopqrstuvwxyz Password: MySecret123 Token: ghp_abcdefghijklmnopqrstuvwxyz123456";

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info(message);

      const loggedMessage = spy.mock.calls[0][0];
      expect(loggedMessage).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
      expect(loggedMessage).not.toContain("MySecret123");
      expect(loggedMessage).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
    });

    it("should redact credentials in metadata", () => {
      const logger = new SecureLogger({ enableRedaction: true });
      const metadata = {
        apiKey: "sk-1234567890abcdefghijklmnopqrstuvwxyz",
        user: "john",
      };

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info("User login", metadata);

      const loggedMetadata = spy.mock.calls[0][1];
      expect(loggedMetadata.apiKey).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
      expect(loggedMetadata.user).toBe("john");
    });

    it("should not redact if disabled", () => {
      const logger = new SecureLogger({ enableRedaction: false });
      const message = "API key: sk-1234567890abcdefghijklmnopqrstuvwxyz";

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info(message);

      const loggedMessage = spy.mock.calls[0][0];
      expect(loggedMessage).toBe(message); // Not redacted
    });
  });

  describe("Encryption Only", () => {
    it("should encrypt logs when enabled", () => {
      const key = EncryptionService.generateKey();
      const logger = new SecureLogger({
        enableRedaction: false,
        enableEncryption: true,
        encryptionOptions: { key },
      });

      const message = "Secret message";

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info(message);

      const loggedMessage = spy.mock.calls[0][0];
      // Should be encrypted (format: iv:authTag:encrypted)
      expect(loggedMessage).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
      expect(loggedMessage).not.toContain("Secret message");
    });

    it("should encrypt metadata when enabled", () => {
      const key = EncryptionService.generateKey();
      const logger = new SecureLogger({
        enableRedaction: false,
        enableEncryption: true,
        encryptionOptions: { key },
      });

      const metadata = { userId: "12345", action: "login" };

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info("User action", metadata);

      const loggedMetadata = spy.mock.calls[0][1];
      expect(loggedMetadata).toHaveProperty("_encrypted");
      expect(loggedMetadata._encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });

    it("should be able to decrypt encrypted logs", () => {
      const key = EncryptionService.generateKey();
      const logger = new SecureLogger({
        enableRedaction: false,
        enableEncryption: true,
        encryptionOptions: { key },
      });

      const message = "Original message";

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info(message);

      const encryptedMessage = spy.mock.calls[0][0];

      // Decrypt to verify
      const encryption = new EncryptionService({ key });
      const decrypted = encryption.decryptFromString(encryptedMessage);
      expect(decrypted).toBe(message);
    });
  });

  describe("Multi-Layer Defense (Redaction + Encryption)", () => {
    it("should redact BEFORE encrypting", () => {
      const key = EncryptionService.generateKey();
      const logger = new SecureLogger({
        enableRedaction: true,
        enableEncryption: true,
        encryptionOptions: { key },
      });

      const message = "API key: sk-1234567890abcdefghijklmnopqrstuvwxyz";

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info(message);

      const encryptedMessage = spy.mock.calls[0][0];

      // Decrypt and check that credential was redacted BEFORE encryption
      const encryption = new EncryptionService({ key });
      const decrypted = encryption.decryptFromString(encryptedMessage);

      expect(decrypted).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
      expect(decrypted).toContain("[REDACTED:OPENAI_KEY]"); // Redacted version
    });

    it("should ensure credentials never appear in encrypted logs", () => {
      const key = EncryptionService.generateKey();
      const logger = new SecureLogger({
        enableRedaction: true,
        enableEncryption: true,
        encryptionOptions: { key },
      });

      const sensitiveData = "Password: MySecretP@ssw0rd123";

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info(sensitiveData);

      const encryptedMessage = spy.mock.calls[0][0];

      // Encrypted output should NOT contain the original password
      expect(encryptedMessage).not.toContain("MySecretP@ssw0rd123");

      // Even when decrypted, password should be redacted
      const encryption = new EncryptionService({ key });
      const decrypted = encryption.decryptFromString(encryptedMessage);
      expect(decrypted).not.toContain("MySecretP@ssw0rd123");
    });
  });

  describe("Log Levels", () => {
    it("should support all log levels", () => {
      const logger = new SecureLogger({ enableRedaction: true });

      const levels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

      for (const level of levels) {
        const spy = vi.fn();
        (logger as any).baseLogger[level] = spy;

        logger[level](`${level} message`);

        expect(spy).toHaveBeenCalledWith(`${level} message`, undefined);
      }
    });

    it("should redact at all log levels", () => {
      const logger = new SecureLogger({ enableRedaction: true });
      const message = "Key: sk-1234567890abcdefghijklmnopqrstuvwxyz";

      const levels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

      for (const level of levels) {
        const spy = vi.fn();
        (logger as any).baseLogger[level] = spy;

        logger[level](message);

        const loggedMessage = spy.mock.calls[0][0];
        expect(loggedMessage).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
      }
    });
  });

  describe("Child Logger", () => {
    it("should create child logger with redacted bindings", () => {
      const logger = new SecureLogger({ enableRedaction: true });

      const child = logger.child({
        apiKey: "sk-1234567890abcdefghijklmnopqrstuvwxyz",
        user: "john",
      });

      expect(child).toBeInstanceOf(SecureLogger);
      expect(child.getSecurityStats().redactionEnabled).toBe(true);
    });

    it("should inherit security settings", () => {
      const logger = new SecureLogger({
        enableRedaction: true,
        enableEncryption: true,
        encryptionOptions: { key: EncryptionService.generateKey() },
      });

      const child = logger.child({ context: "test" });

      const stats = child.getSecurityStats();
      expect(stats.redactionEnabled).toBe(true);
      expect(stats.encryptionEnabled).toBe(true);
    });
  });

  describe("Security Stats", () => {
    it("should report security configuration", () => {
      const logger = new SecureLogger({
        enableRedaction: true,
        enableEncryption: false,
      });

      const stats = logger.getSecurityStats();
      expect(stats.redactionEnabled).toBe(true);
      expect(stats.encryptionEnabled).toBe(false);
      expect(stats.patternCount).toBeGreaterThan(0);
    });

    it("should report pattern count", () => {
      const logger = new SecureLogger({ enableRedaction: true });
      const stats = logger.getSecurityStats();
      expect(stats.patternCount).toBeGreaterThanOrEqual(24); // At least 24 patterns
    });
  });

  describe("Log Transport", () => {
    it("should create secure transport", () => {
      const transport = createSecureLogTransport({
        enableRedaction: true,
        enableEncryption: false,
      });

      expect(transport).toBeInstanceOf(Function);
    });

    it("should redact via transport", () => {
      const transport = createSecureLogTransport({ enableRedaction: true });

      const logObj = {
        message: "API key: sk-1234567890abcdefghijklmnopqrstuvwxyz",
        level: "info",
      };

      transport(logObj);

      expect(logObj.message).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
    });

    it("should encrypt via transport", () => {
      const key = EncryptionService.generateKey();
      const transport = createSecureLogTransport({
        enableRedaction: false,
        enableEncryption: true,
        encryptionOptions: { key },
      });

      const logObj = {
        message: "Secret message",
        level: "info",
      };

      transport(logObj);

      expect(logObj).toHaveProperty("_encrypted");
      expect(logObj._encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    });
  });

  describe("Global Registration", () => {
    it("should enable secure logging globally", () => {
      const unregister = enableSecureLogging({ enableRedaction: true });

      expect(unregister).toBeInstanceOf(Function);

      unregister();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty messages", () => {
      const logger = new SecureLogger({ enableRedaction: true });

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info("");

      expect(spy).toHaveBeenCalledWith("", undefined);
    });

    it("should handle null metadata", () => {
      const logger = new SecureLogger({ enableRedaction: true });

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info("Message", undefined);

      expect(spy).toHaveBeenCalledWith("Message", undefined);
    });

    it("should handle complex nested metadata", () => {
      const logger = new SecureLogger({ enableRedaction: true });

      const metadata = {
        user: {
          id: 123,
          credentials: {
            apiKey: "sk-1234567890abcdefghijklmnopqrstuvwxyz",
          },
        },
      };

      const spy = vi.fn();
      (logger as any).baseLogger.info = spy;

      logger.info("User action", metadata);

      const loggedMetadata = spy.mock.calls[0][1];
      expect(loggedMetadata.user.credentials.apiKey).not.toContain(
        "sk-1234567890abcdefghijklmnopqrstuvwxyz",
      );
    });
  });
});
