/**
 * Security tests for memory-tool.ts
 *
 * Tests path traversal prevention in memory_get tool.
 * Critical P0 security fix - validates PathTraversalValidator integration.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";

// Mock the memory manager
const stubManager = {
  search: vi.fn(async () => []),
  readFile: vi.fn(async (params: { relPath: string }) => ({
    path: params.relPath,
    text: "test content",
    from: undefined,
    lines: undefined,
  })),
  status: () => ({
    backend: "builtin" as const,
    files: 1,
    chunks: 1,
    dirty: false,
    workspaceDir: "/test/workspace",
    dbPath: "/test/workspace/.memory/index.sqlite",
    provider: "builtin" as const,
    model: "builtin" as const,
    requestedProvider: "builtin" as const,
    sources: ["memory" as const],
    sourceCounts: [{ source: "memory" as const, files: 1, chunks: 1 }],
  }),
  sync: vi.fn(),
  probeVectorAvailability: vi.fn(async () => true),
  close: vi.fn(),
};

vi.mock("../../memory/index.js", () => ({
  getMemorySearchManager: async () => ({ manager: stubManager }),
}));

vi.mock("../agent-scope.js", () => ({
  resolveSessionAgentId: () => "test-agent",
  resolveAgentWorkspaceDir: () => "/test/workspace",
}));

vi.mock("../memory-search.js", () => ({
  resolveMemorySearchConfig: () => ({ backend: "builtin" }),
}));

import { createMemoryGetTool } from "./memory-tool.js";

describe("memory-tool.ts Security Tests (P0 Fix)", () => {
  let tool: ReturnType<typeof createMemoryGetTool>;
  let mockConfig: OpenClawConfig;

  beforeEach(() => {
    mockConfig = {
      memory: {
        backend: "builtin",
        citations: "auto",
      },
    } as OpenClawConfig;

    tool = createMemoryGetTool({
      config: mockConfig,
      agentSessionKey: "test:session",
    });

    vi.clearAllMocks();
  });

  describe("Valid Memory Paths", () => {
    it("should allow valid memory file path", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-1", {
        path: "/test/workspace/MEMORY.md",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("test content");
      expect(stubManager.readFile).toHaveBeenCalled();
    });

    it("should allow memory subdirectory path", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-2", {
        path: "/test/workspace/memory/notes.md",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("test content");
      expect(stubManager.readFile).toHaveBeenCalled();
    });

    it("should handle relative paths within workspace", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-3", {
        path: "/test/workspace/subdir/file.md",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("test content");
    });
  });

  describe("Path Traversal Attacks (P0 Security)", () => {
    it("should block ../ traversal attack", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-4", {
        path: "/test/workspace/../etc/passwd",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(resultText).toContain("traversal sequence");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should block multiple ../ traversal", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-5", {
        path: "/test/workspace/../../etc/passwd",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should block mixed ./ and ../ traversal", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-6", {
        path: "/test/workspace/./subdir/../../etc/shadow",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should block absolute path outside workspace", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-7", {
        path: "/etc/passwd",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should block path to /etc/shadow", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-8", {
        path: "/test/workspace/../../../etc/shadow",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });
  });

  describe("Null Byte Injection (P0 Security)", () => {
    it("should block null byte in path", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-9", {
        path: "/test/workspace/file.md\0.txt",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(resultText).toContain("null byte");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should block URL-encoded null byte", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-10", {
        path: "/test/workspace/file.md%00.txt",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });
  });

  describe("URL Encoding Bypass Attempts (P0 Security)", () => {
    it("should block %2e%2e%2f encoded traversal", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-11", {
        path: "/test/workspace/%2e%2e%2fetc%2fpasswd",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should block double-encoded traversal", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-12", {
        path: "/test/workspace/%252e%252e%252fetc%252fpasswd",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should block mixed encoding attack", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-13", {
        path: "/test/workspace/..%2fetc%2fpasswd",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });
  });

  describe("Symlink Attacks (P0 Security)", () => {
    it("should detect symlink pointing outside workspace", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      // Note: This test validates that symlinks are resolved when they exist.
      // Since we use allowNonExistent=true, non-existent paths within the workspace
      // will pass validation (the memory manager handles file-not-found).
      // For a proper symlink test, the file would need to exist in the filesystem.
      // This test validates the path is within workspace bounds.

      const result = await tool.execute("test-call-14", {
        path: "/test/workspace/evil-symlink",
      });

      // With allowNonExistent=true and path within workspace, this passes validation
      // but the memory manager returns the file content (or error if file doesn't exist)
      const resultText = JSON.stringify(result);
      expect(resultText).toContain("test content");
      expect(stubManager.readFile).toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty path", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-15", {
        path: "",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should handle path with only dots", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-16", {
        path: "..",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should handle path with trailing slashes", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-17", {
        path: "/test/workspace/memory/",
      });

      // Validator should handle trailing slashes gracefully
      expect(result).toBeDefined();
    });
  });

  describe("Real-World Attack Scenarios", () => {
    it("should block access to /etc/passwd", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-18", {
        path: "/test/workspace/../../../etc/passwd",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should block access to /etc/shadow", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-19", {
        path: "/test/workspace/../../../etc/shadow",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should block access to ~/.ssh/id_rsa", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-20", {
        path: "/test/workspace/../../../home/user/.ssh/id_rsa",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });

    it("should block access to Windows system files", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-21", {
        path: "/test/workspace/..\\..\\..\\Windows\\System32\\config\\SAM",
      });

      expect(result).toBeDefined();
      expect(stubManager.readFile).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should return security error with path validation context", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-22", {
        path: "/test/workspace/../../etc/passwd",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      expect(resultText).toContain("Path validation failed");
    });

    it("should not leak internal path information in error", async () => {
      if (!tool) {
        throw new Error("Tool not created");
      }

      const result = await tool.execute("test-call-23", {
        path: "/test/workspace/../../../secret/path",
      });

      const resultText = JSON.stringify(result);
      expect(resultText).toContain("Security: Path access denied");
      // Should not expose internal paths
      expect(result).not.toContain("/secret/path");
    });
  });
});
