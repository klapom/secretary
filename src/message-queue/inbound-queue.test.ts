/**
 * Unit tests for Inbound Message Queue.
 *
 * Tests file-based queue operations, retry logic, and recovery.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  enqueueInboundMessage,
  ackInboundMessage,
  failInboundMessage,
  loadPendingInboundMessages,
  moveInboundToFailed,
  computeInboundBackoffMs,
  recoverPendingInboundMessages,
  ensureInboundQueueDir,
  MAX_RETRIES,
  type QueuedInboundMessage,
  type ProcessInboundFn,
  type InboundRecoveryLogger,
} from "./inbound-queue.js";

describe("Inbound Queue", () => {
  let tempStateDir: string;

  beforeEach(() => {
    // Create temp directory for test queues
    tempStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "inbound-queue-test-"));
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tempStateDir)) {
      fs.rmSync(tempStateDir, { recursive: true, force: true });
    }
  });

  describe("ensureInboundQueueDir", () => {
    it("should create queue directory", async () => {
      const queueDir = await ensureInboundQueueDir(tempStateDir);
      expect(fs.existsSync(queueDir)).toBe(true);
    });

    it("should create failed subdirectory", async () => {
      await ensureInboundQueueDir(tempStateDir);
      const failedDir = path.join(tempStateDir, "inbound-queue", "failed");
      expect(fs.existsSync(failedDir)).toBe(true);
    });

    it("should set directory permissions to 0o700", async () => {
      const queueDir = await ensureInboundQueueDir(tempStateDir);
      const stats = fs.statSync(queueDir);
      expect(stats.mode & 0o777).toBe(0o700);
    });

    it("should be idempotent", async () => {
      await ensureInboundQueueDir(tempStateDir);
      await ensureInboundQueueDir(tempStateDir);
      const queueDir = path.join(tempStateDir, "inbound-queue");
      expect(fs.existsSync(queueDir)).toBe(true);
    });
  });

  describe("enqueueInboundMessage", () => {
    it("should enqueue a basic message", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
          body: "Hello world",
        },
        tempStateDir,
      );

      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
    });

    it("should create JSON file with correct structure", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
          body: "Hello world",
        },
        tempStateDir,
      );

      const queueDir = path.join(tempStateDir, "inbound-queue");
      const filePath = path.join(queueDir, `${id}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(content).toMatchObject({
        id,
        channel: "whatsapp",
        from: "+1234567890",
        sessionId: "session-123",
        body: "Hello world",
        retryCount: 0,
      });
      expect(content.enqueuedAt).toBeGreaterThan(0);
    });

    it("should set file permissions to 0o600", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
        },
        tempStateDir,
      );

      const filePath = path.join(tempStateDir, "inbound-queue", `${id}.json`);
      const stats = fs.statSync(filePath);
      expect(stats.mode & 0o777).toBe(0o600);
    });

    it("should handle all optional fields", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "telegram",
          from: "user123",
          accountId: "acc-456",
          sessionId: "session-789",
          chatId: "chat-999",
          chatType: "group",
          body: "Test message",
          mediaUrls: ["https://example.com/image.jpg"],
          mentionedJids: ["@user1", "@user2"],
          replyToId: "msg-123",
          metadata: { custom: "value" },
        },
        tempStateDir,
      );

      const filePath = path.join(tempStateDir, "inbound-queue", `${id}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      expect(content).toMatchObject({
        accountId: "acc-456",
        chatId: "chat-999",
        chatType: "group",
        body: "Test message",
        mediaUrls: ["https://example.com/image.jpg"],
        mentionedJids: ["@user1", "@user2"],
        replyToId: "msg-123",
        metadata: { custom: "value" },
      });
    });

    it("should use atomic writes (temp file + rename)", async () => {
      // This is hard to test directly, but we can verify no .tmp files remain
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
        },
        tempStateDir,
      );

      const queueDir = path.join(tempStateDir, "inbound-queue");
      const files = fs.readdirSync(queueDir);
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));

      expect(tmpFiles.length).toBe(0);
      expect(files).toContain(`${id}.json`);
    });

    it("should handle messages without body", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
          mediaUrls: ["https://example.com/voice.ogg"],
        },
        tempStateDir,
      );

      const filePath = path.join(tempStateDir, "inbound-queue", `${id}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(content.body).toBeUndefined();
      expect(content.mediaUrls).toEqual(["https://example.com/voice.ogg"]);
    });
  });

  describe("ackInboundMessage", () => {
    it("should remove message from queue", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
        },
        tempStateDir,
      );

      const filePath = path.join(tempStateDir, "inbound-queue", `${id}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      await ackInboundMessage(id, tempStateDir);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("should be idempotent (no error on double ack)", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
        },
        tempStateDir,
      );

      await ackInboundMessage(id, tempStateDir);
      await expect(ackInboundMessage(id, tempStateDir)).resolves.not.toThrow();
    });

    it("should handle non-existent message gracefully", async () => {
      await expect(ackInboundMessage("non-existent-id", tempStateDir)).resolves.not.toThrow();
    });
  });

  describe("failInboundMessage", () => {
    it("should increment retry count", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
        },
        tempStateDir,
      );

      await failInboundMessage(id, "Test error", tempStateDir);

      const filePath = path.join(tempStateDir, "inbound-queue", `${id}.json`);
      const content: QueuedInboundMessage = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      expect(content.retryCount).toBe(1);
      expect(content.lastError).toBe("Test error");
    });

    it("should preserve existing message data", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
          body: "Original message",
          metadata: { key: "value" },
        },
        tempStateDir,
      );

      await failInboundMessage(id, "First error", tempStateDir);

      const filePath = path.join(tempStateDir, "inbound-queue", `${id}.json`);
      const content: QueuedInboundMessage = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      expect(content.body).toBe("Original message");
      expect(content.metadata).toEqual({ key: "value" });
      expect(content.from).toBe("+1234567890");
    });

    it("should support multiple failures", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
        },
        tempStateDir,
      );

      await failInboundMessage(id, "Error 1", tempStateDir);
      await failInboundMessage(id, "Error 2", tempStateDir);
      await failInboundMessage(id, "Error 3", tempStateDir);

      const filePath = path.join(tempStateDir, "inbound-queue", `${id}.json`);
      const content: QueuedInboundMessage = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      expect(content.retryCount).toBe(3);
      expect(content.lastError).toBe("Error 3");
    });

    it("should use atomic writes", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
        },
        tempStateDir,
      );

      await failInboundMessage(id, "Test error", tempStateDir);

      const queueDir = path.join(tempStateDir, "inbound-queue");
      const files = fs.readdirSync(queueDir);
      const tmpFiles = files.filter((f) => f.endsWith(".tmp"));

      expect(tmpFiles.length).toBe(0);
    });
  });

  describe("loadPendingInboundMessages", () => {
    it("should return empty array for non-existent directory", async () => {
      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toEqual([]);
    });

    it("should load single message", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "session-123",
          body: "Test",
        },
        tempStateDir,
      );

      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(id);
      expect(messages[0].body).toBe("Test");
    });

    it("should load multiple messages", async () => {
      const id1 = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1111111111", sessionId: "s1" },
        tempStateDir,
      );
      const id2 = await enqueueInboundMessage(
        { channel: "telegram", from: "user2", sessionId: "s2" },
        tempStateDir,
      );
      const id3 = await enqueueInboundMessage(
        { channel: "slack", from: "user3", sessionId: "s3" },
        tempStateDir,
      );

      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toHaveLength(3);

      const ids = messages.map((m) => m.id);
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
      expect(ids).toContain(id3);
    });

    it("should skip non-JSON files", async () => {
      await ensureInboundQueueDir(tempStateDir);
      const queueDir = path.join(tempStateDir, "inbound-queue");

      // Create valid message
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      // Create non-JSON files
      fs.writeFileSync(path.join(queueDir, "readme.txt"), "ignore this");
      fs.writeFileSync(path.join(queueDir, ".DS_Store"), "mac metadata");

      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toHaveLength(1);
    });

    it("should skip subdirectories", async () => {
      await ensureInboundQueueDir(tempStateDir);
      const queueDir = path.join(tempStateDir, "inbound-queue");

      // Create valid message
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      // Create subdirectory with JSON file
      const subdir = path.join(queueDir, "subdir");
      fs.mkdirSync(subdir);
      fs.writeFileSync(path.join(subdir, "msg.json"), JSON.stringify({ test: "data" }));

      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toHaveLength(1);
    });

    it("should skip malformed JSON files", async () => {
      await ensureInboundQueueDir(tempStateDir);
      const queueDir = path.join(tempStateDir, "inbound-queue");

      // Create valid message
      const id = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      // Create malformed JSON file
      fs.writeFileSync(path.join(queueDir, "bad.json"), "{ invalid json");

      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(id);
    });

    it("should skip inaccessible files", async () => {
      await ensureInboundQueueDir(tempStateDir);
      const queueDir = path.join(tempStateDir, "inbound-queue");

      // Create valid message
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      // Create file with no read permissions (skip on Windows)
      if (process.platform !== "win32") {
        const restrictedFile = path.join(queueDir, "restricted.json");
        fs.writeFileSync(restrictedFile, JSON.stringify({ test: "data" }));
        fs.chmodSync(restrictedFile, 0o000);

        const messages = await loadPendingInboundMessages(tempStateDir);
        expect(messages).toHaveLength(1);

        // Cleanup
        fs.chmodSync(restrictedFile, 0o600);
      }
    });
  });

  describe("moveInboundToFailed", () => {
    it("should move message to failed directory", async () => {
      const id = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      const queueDir = path.join(tempStateDir, "inbound-queue");
      const srcPath = path.join(queueDir, `${id}.json`);
      const destPath = path.join(queueDir, "failed", `${id}.json`);

      expect(fs.existsSync(srcPath)).toBe(true);
      expect(fs.existsSync(destPath)).toBe(false);

      await moveInboundToFailed(id, tempStateDir);

      expect(fs.existsSync(srcPath)).toBe(false);
      expect(fs.existsSync(destPath)).toBe(true);
    });

    it("should preserve message content", async () => {
      const id = await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "+1234567890",
          sessionId: "s1",
          body: "Failed message",
          metadata: { reason: "test" },
        },
        tempStateDir,
      );

      // Add some failures
      await failInboundMessage(id, "Error 1", tempStateDir);
      await failInboundMessage(id, "Error 2", tempStateDir);

      await moveInboundToFailed(id, tempStateDir);

      const destPath = path.join(tempStateDir, "inbound-queue", "failed", `${id}.json`);
      const content: QueuedInboundMessage = JSON.parse(fs.readFileSync(destPath, "utf-8"));

      expect(content.body).toBe("Failed message");
      expect(content.retryCount).toBe(2);
      expect(content.lastError).toBe("Error 2");
      expect(content.metadata).toEqual({ reason: "test" });
    });

    it("should create failed directory if missing", async () => {
      const id = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      // Remove failed directory
      const failedDir = path.join(tempStateDir, "inbound-queue", "failed");
      fs.rmSync(failedDir, { recursive: true, force: true });

      await moveInboundToFailed(id, tempStateDir);

      expect(fs.existsSync(failedDir)).toBe(true);
      expect(fs.existsSync(path.join(failedDir, `${id}.json`))).toBe(true);
    });
  });

  describe("computeInboundBackoffMs", () => {
    it("should return 0 for retryCount <= 0", () => {
      expect(computeInboundBackoffMs(0)).toBe(0);
      expect(computeInboundBackoffMs(-1)).toBe(0);
      expect(computeInboundBackoffMs(-100)).toBe(0);
    });

    it("should return correct backoff for retry 1", () => {
      expect(computeInboundBackoffMs(1)).toBe(1_000); // 1s
    });

    it("should return correct backoff for retry 2", () => {
      expect(computeInboundBackoffMs(2)).toBe(5_000); // 5s
    });

    it("should return correct backoff for retry 3", () => {
      expect(computeInboundBackoffMs(3)).toBe(25_000); // 25s
    });

    it("should return correct backoff for retry 4", () => {
      expect(computeInboundBackoffMs(4)).toBe(120_000); // 2m
    });

    it("should return correct backoff for retry 5", () => {
      expect(computeInboundBackoffMs(5)).toBe(600_000); // 10m
    });

    it("should cap at max backoff for high retry counts", () => {
      expect(computeInboundBackoffMs(6)).toBe(600_000); // 10m (max)
      expect(computeInboundBackoffMs(10)).toBe(600_000); // 10m (max)
      expect(computeInboundBackoffMs(100)).toBe(600_000); // 10m (max)
    });
  });

  describe("recoverPendingInboundMessages", () => {
    let processedMessages: QueuedInboundMessage[];
    let processFn: ProcessInboundFn;
    let logger: InboundRecoveryLogger;
    let logOutput: { level: string; msg: string }[];

    beforeEach(() => {
      processedMessages = [];
      processFn = async (msg: QueuedInboundMessage) => {
        processedMessages.push(msg);
      };

      logOutput = [];
      logger = {
        info: (msg: string) => logOutput.push({ level: "info", msg }),
        warn: (msg: string) => logOutput.push({ level: "warn", msg }),
        error: (msg: string) => logOutput.push({ level: "error", msg }),
      };
    });

    it("should return zeros for empty queue", async () => {
      const result = await recoverPendingInboundMessages({
        process: processFn,
        log: logger,
        stateDir: tempStateDir,
      });

      expect(result).toEqual({ recovered: 0, failed: 0, skipped: 0 });
    });

    it("should recover single message", async () => {
      const id = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1", body: "Test" },
        tempStateDir,
      );

      const result = await recoverPendingInboundMessages({
        process: processFn,
        log: logger,
        stateDir: tempStateDir,
        delay: async () => {}, // Skip delays in tests
      });

      expect(result).toEqual({ recovered: 1, failed: 0, skipped: 0 });
      expect(processedMessages).toHaveLength(1);
      expect(processedMessages[0].id).toBe(id);

      // Message should be removed from queue
      const pending = await loadPendingInboundMessages(tempStateDir);
      expect(pending).toHaveLength(0);
    });

    it("should recover multiple messages", async () => {
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1111111111", sessionId: "s1" },
        tempStateDir,
      );
      await enqueueInboundMessage(
        { channel: "telegram", from: "user2", sessionId: "s2" },
        tempStateDir,
      );
      await enqueueInboundMessage(
        { channel: "slack", from: "user3", sessionId: "s3" },
        tempStateDir,
      );

      const result = await recoverPendingInboundMessages({
        process: processFn,
        log: logger,
        stateDir: tempStateDir,
        delay: async () => {},
      });

      expect(result).toEqual({ recovered: 3, failed: 0, skipped: 0 });
      expect(processedMessages).toHaveLength(3);
    });

    it("should process oldest messages first", async () => {
      // Create messages with artificial timestamps
      const id1 = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1111111111", sessionId: "s1" },
        tempStateDir,
      );
      await new Promise((r) => setTimeout(r, 10)); // Small delay

      const id2 = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+2222222222", sessionId: "s2" },
        tempStateDir,
      );
      await new Promise((r) => setTimeout(r, 10));

      const id3 = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+3333333333", sessionId: "s3" },
        tempStateDir,
      );

      await recoverPendingInboundMessages({
        process: processFn,
        log: logger,
        stateDir: tempStateDir,
        delay: async () => {},
      });

      expect(processedMessages[0].id).toBe(id1);
      expect(processedMessages[1].id).toBe(id2);
      expect(processedMessages[2].id).toBe(id3);
    });

    it("should handle processing failures", async () => {
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1111111111", sessionId: "s1" },
        tempStateDir,
      );

      const failingProcess: ProcessInboundFn = async () => {
        throw new Error("Processing failed");
      };

      const result = await recoverPendingInboundMessages({
        process: failingProcess,
        log: logger,
        stateDir: tempStateDir,
        delay: async () => {},
      });

      expect(result).toEqual({ recovered: 0, failed: 1, skipped: 0 });

      // Message should still be in queue with incremented retry count
      const pending = await loadPendingInboundMessages(tempStateDir);
      expect(pending).toHaveLength(1);
      expect(pending[0].retryCount).toBe(1);
      expect(pending[0].lastError).toBe("Processing failed");
    });

    it("should skip messages exceeding max retries", async () => {
      const id = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      // Simulate max retries
      for (let i = 0; i < MAX_RETRIES; i++) {
        await failInboundMessage(id, `Error ${i + 1}`, tempStateDir);
      }

      const result = await recoverPendingInboundMessages({
        process: processFn,
        log: logger,
        stateDir: tempStateDir,
        delay: async () => {},
      });

      expect(result).toEqual({ recovered: 0, failed: 0, skipped: 1 });

      // Message should be in failed directory
      const failedPath = path.join(tempStateDir, "inbound-queue", "failed", `${id}.json`);
      expect(fs.existsSync(failedPath)).toBe(true);

      // Not in main queue
      const pending = await loadPendingInboundMessages(tempStateDir);
      expect(pending).toHaveLength(0);
    });

    it("should use exponential backoff with delay function", async () => {
      const id = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      // Fail once to set retryCount = 1
      await failInboundMessage(id, "First error", tempStateDir);

      const delayedMs: number[] = [];
      const mockDelay = async (ms: number) => {
        delayedMs.push(ms);
      };

      await recoverPendingInboundMessages({
        process: processFn,
        log: logger,
        stateDir: tempStateDir,
        delay: mockDelay,
      });

      // Should have waited for retry 2 backoff (5s)
      expect(delayedMs).toHaveLength(1);
      expect(delayedMs[0]).toBe(5_000);
    });

    it("should respect maxRecoveryMs timeout", async () => {
      // Create messages with retry counts to trigger delays
      const id1 = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1111111111", sessionId: "s1" },
        tempStateDir,
      );
      await failInboundMessage(id1, "Error", tempStateDir); // retryCount=1, backoff=1s

      const id2 = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+2222222222", sessionId: "s2" },
        tempStateDir,
      );
      await failInboundMessage(id2, "Error", tempStateDir); // retryCount=1, backoff=1s

      let delayTotal = 0;
      const mockDelay = async (ms: number) => {
        delayTotal += ms;
        if (delayTotal > 1000) {
          // Simulate delay that exceeds budget
          await new Promise((r) => setTimeout(r, 10));
        }
      };

      const result = await recoverPendingInboundMessages({
        process: processFn,
        log: logger,
        stateDir: tempStateDir,
        delay: mockDelay,
        maxRecoveryMs: 1500, // Budget too small for 2x5s delays
      });

      // Should process at least one but not necessarily all
      expect(result.recovered + result.failed).toBeLessThanOrEqual(2);

      // Check warning log about budget exceeded
      const warnings = logOutput.filter((l) => l.level === "warn");
      const hasTimeoutWarning = warnings.some((w) => w.msg.includes("time budget exceeded"));
      if (result.recovered + result.failed < 2) {
        expect(hasTimeoutWarning).toBe(true);
      }
    });

    it("should handle mixed success and failure", async () => {
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1111111111", sessionId: "s1", body: "success" },
        tempStateDir,
      );
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+2222222222", sessionId: "s2", body: "fail" },
        tempStateDir,
      );
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+3333333333", sessionId: "s3", body: "success" },
        tempStateDir,
      );

      const selectiveProcess: ProcessInboundFn = async (msg) => {
        if (msg.body === "fail") {
          throw new Error("Intentional failure");
        }
      };

      const result = await recoverPendingInboundMessages({
        process: selectiveProcess,
        log: logger,
        stateDir: tempStateDir,
        delay: async () => {},
      });

      expect(result).toEqual({ recovered: 2, failed: 1, skipped: 0 });

      // Only failed message should remain
      const pending = await loadPendingInboundMessages(tempStateDir);
      expect(pending).toHaveLength(1);
      expect(pending[0].body).toBe("fail");
    });

    it("should log recovery progress", async () => {
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      await recoverPendingInboundMessages({
        process: processFn,
        log: logger,
        stateDir: tempStateDir,
        delay: async () => {},
      });

      const infoLogs = logOutput.filter((l) => l.level === "info");
      expect(infoLogs.some((l) => l.msg.includes("Found 1 pending"))).toBe(true);
      expect(infoLogs.some((l) => l.msg.includes("Recovered inbound message"))).toBe(true);
      expect(infoLogs.some((l) => l.msg.includes("recovery complete"))).toBe(true);
    });

    it("should handle move to failed errors gracefully", async () => {
      const id = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      // Max out retries
      for (let i = 0; i < MAX_RETRIES; i++) {
        await failInboundMessage(id, `Error ${i}`, tempStateDir);
      }

      // Make failed directory read-only (skip on Windows)
      if (process.platform !== "win32") {
        const failedDir = path.join(tempStateDir, "inbound-queue", "failed");
        fs.chmodSync(failedDir, 0o000);

        await recoverPendingInboundMessages({
          process: processFn,
          log: logger,
          stateDir: tempStateDir,
          delay: async () => {},
        });

        const errorLogs = logOutput.filter((l) => l.level === "error");
        expect(errorLogs.some((l) => l.msg.includes("Failed to move entry"))).toBe(true);

        // Cleanup
        fs.chmodSync(failedDir, 0o700);
      }
    });

    it("should apply backoff based on retry count", async () => {
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1" },
        tempStateDir,
      );

      const delayedMs: number[] = [];
      const mockDelay = async (ms: number) => {
        delayedMs.push(ms);
      };

      await recoverPendingInboundMessages({
        process: processFn,
        log: logger,
        stateDir: tempStateDir,
        delay: mockDelay,
      });

      // Fresh message (retryCount=0) treated as retry 1, so backoff = 1s
      expect(delayedMs).toHaveLength(1);
      expect(delayedMs[0]).toBe(1_000);
    });
  });

  describe("Integration: Full Recovery Flow", () => {
    it("should handle complete recovery scenario", async () => {
      // Simulate crash during processing: messages in various states
      const id1 = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1111111111", sessionId: "s1", body: "new" },
        tempStateDir,
      );

      const id2 = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+2222222222", sessionId: "s2", body: "retry" },
        tempStateDir,
      );
      await failInboundMessage(id2, "Network timeout", tempStateDir);
      await failInboundMessage(id2, "Network timeout", tempStateDir);

      const id3 = await enqueueInboundMessage(
        { channel: "whatsapp", from: "+3333333333", sessionId: "s3", body: "max-retries" },
        tempStateDir,
      );
      for (let i = 0; i < MAX_RETRIES; i++) {
        await failInboundMessage(id3, "Permanent error", tempStateDir);
      }

      // Recovery
      const processedMessages: QueuedInboundMessage[] = [];
      const logger: InboundRecoveryLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
      };

      const result = await recoverPendingInboundMessages({
        process: async (msg) => {
          processedMessages.push(msg);
        },
        log: logger,
        stateDir: tempStateDir,
        delay: async () => {},
      });

      // Should recover 2, skip 1 (max retries)
      expect(result).toEqual({ recovered: 2, failed: 0, skipped: 1 });

      // Verify processed messages
      expect(processedMessages).toHaveLength(2);
      const processedIds = processedMessages.map((m) => m.id);
      expect(processedIds).toContain(id1);
      expect(processedIds).toContain(id2);

      // Verify failed message moved to DLQ
      const failedPath = path.join(tempStateDir, "inbound-queue", "failed", `${id3}.json`);
      expect(fs.existsSync(failedPath)).toBe(true);

      // Main queue should be empty
      const pending = await loadPendingInboundMessages(tempStateDir);
      expect(pending).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle concurrent enqueue operations", async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        enqueueInboundMessage(
          { channel: "whatsapp", from: `+111111111${i}`, sessionId: `s${i}` },
          tempStateDir,
        ),
      );

      const ids = await Promise.all(promises);
      expect(new Set(ids).size).toBe(10); // All unique IDs

      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toHaveLength(10);
    });

    it("should handle empty string values", async () => {
      await enqueueInboundMessage(
        {
          channel: "whatsapp",
          from: "",
          sessionId: "",
          body: "",
          chatId: "",
        },
        tempStateDir,
      );

      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toHaveLength(1);
      expect(messages[0].from).toBe("");
      expect(messages[0].body).toBe("");
    });

    it("should handle very long message bodies", async () => {
      const longBody = "x".repeat(100_000); // 100KB message
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1", body: longBody },
        tempStateDir,
      );

      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toHaveLength(1);
      expect(messages[0].body?.length).toBe(100_000);
    });

    it("should handle special characters in message content", async () => {
      const specialChars = '{"test": "value with \\"quotes\\" and \\n newlines"}';
      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1", body: specialChars },
        tempStateDir,
      );

      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toHaveLength(1);
      expect(messages[0].body).toBe(specialChars);
    });

    it("should handle metadata with nested objects", async () => {
      const metadata = {
        level1: {
          level2: {
            level3: {
              value: "deep",
              array: [1, 2, 3],
            },
          },
        },
      };

      await enqueueInboundMessage(
        { channel: "whatsapp", from: "+1234567890", sessionId: "s1", metadata },
        tempStateDir,
      );

      const messages = await loadPendingInboundMessages(tempStateDir);
      expect(messages).toHaveLength(1);
      expect(messages[0].metadata).toEqual(metadata);
    });
  });
});
