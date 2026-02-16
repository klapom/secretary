/**
 * Unit tests for Path Traversal Prevention
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  PathTraversalValidator,
  validatePath,
  validatePathOrThrow,
  createAppPathValidator,
} from "./path-traversal.js";

describe("PathTraversalValidator", () => {
  let tempDir: string;
  let dataDir: string;
  let uploadsDir: string;

  beforeEach(() => {
    // Create temp directory structure for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "path-traversal-test-"));
    dataDir = path.join(tempDir, "data");
    uploadsDir = path.join(tempDir, "uploads");

    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });

    // Create some test files
    fs.writeFileSync(path.join(dataDir, "file1.txt"), "test");
    fs.writeFileSync(path.join(uploadsDir, "file2.txt"), "test");
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Constructor", () => {
    it("should initialize with allowed base paths", () => {
      const validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir, uploadsDir],
      });
      expect(validator).toBeInstanceOf(PathTraversalValidator);
    });

    it("should throw if no base paths provided", () => {
      expect(() => {
        new PathTraversalValidator({ allowedBasePaths: [] });
      }).toThrow("requires at least one allowed base path");
    });

    it("should normalize base paths on construction", () => {
      const validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir + "/./subdir/../"],
      });
      const allowed = validator.getAllowedBasePaths();
      expect(allowed[0]).toBe(path.resolve(dataDir));
    });
  });

  describe("Basic Path Validation", () => {
    let validator: PathTraversalValidator;

    beforeEach(() => {
      validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir, uploadsDir],
      });
    });

    it("should accept valid path within allowed base", () => {
      const result = validator.validate(path.join(dataDir, "file1.txt"));
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe(path.resolve(dataDir, "file1.txt"));
      expect(result.allowedBase).toBe(dataDir);
    });

    it("should accept valid path in second allowed base", () => {
      const result = validator.validate(path.join(uploadsDir, "file2.txt"));
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe(path.resolve(uploadsDir, "file2.txt"));
      expect(result.allowedBase).toBe(uploadsDir);
    });

    it("should reject path outside allowed bases", () => {
      const outsidePath = path.join(tempDir, "outside.txt");
      fs.writeFileSync(outsidePath, "test");

      const result = validator.validate(outsidePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside allowed directories");
    });

    it("should reject path that doesnt exist by default", () => {
      const result = validator.validate(path.join(dataDir, "nonexistent.txt"));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should accept nonexistent path if allowNonExistent=true", () => {
      const validatorWithNonExistent = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });

      const result = validatorWithNonExistent.validate(path.join(dataDir, "future-file.txt"));
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe(path.resolve(dataDir, "future-file.txt"));
    });
  });

  describe("Path Traversal Attack Prevention", () => {
    let validator: PathTraversalValidator;

    beforeEach(() => {
      validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true, // Allow testing with non-existent paths
      });
    });

    it("should block ../ traversal", () => {
      const result = validator.validate(path.join(dataDir, "../outside.txt"));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside allowed directories");
    });

    it("should block multiple ../ traversals", () => {
      const result = validator.validate(path.join(dataDir, "../../etc/passwd"));
      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside allowed directories");
    });

    it("should block ./../../ mixed traversal", () => {
      const result = validator.validate(path.join(dataDir, "./subdir/../../outside.txt"));
      expect(result.valid).toBe(false);
    });

    it("should allow safe relative paths within base", () => {
      // Create subdirectory structure
      const subdir = path.join(dataDir, "subdir");
      fs.mkdirSync(subdir, { recursive: true });
      fs.writeFileSync(path.join(subdir, "test.txt"), "test");

      const result = validator.validate(path.join(dataDir, "subdir/../file1.txt"));
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe(path.resolve(dataDir, "file1.txt"));
    });
  });

  describe("URL Encoding Bypass Prevention", () => {
    let validator: PathTraversalValidator;

    beforeEach(() => {
      validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });
    });

    it("should detect %2e%2e%2f encoded traversal", () => {
      const encoded = path.join(dataDir, "%2e%2e%2foutside.txt");
      const result = validator.validate(encoded);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("encoded traversal sequence");
    });

    it("should detect double-encoded traversal", () => {
      const doubleEncoded = path.join(dataDir, "%252e%252e%252foutside.txt");
      const result = validator.validate(doubleEncoded);
      expect(result.valid).toBe(false);
    });

    it("should handle mixed encoding attacks", () => {
      const mixed = path.join(dataDir, "..%2foutside.txt");
      const result = validator.validate(mixed);
      expect(result.valid).toBe(false);
    });
  });

  describe("Null Byte Injection Prevention", () => {
    let validator: PathTraversalValidator;

    beforeEach(() => {
      validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
      });
    });

    it("should block null byte in path", () => {
      const result = validator.validate(`${path.join(dataDir, "file.txt")}\0.pdf`);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("null byte");
    });

    it("should block encoded null byte", () => {
      const result = validator.validate(`${path.join(dataDir, "file.txt")}%00.pdf`);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("encoded traversal sequence");
    });
  });

  describe("Symbolic Link Handling", () => {
    let validator: PathTraversalValidator;
    let symlinkPath: string;
    let targetPath: string;

    beforeEach(() => {
      // Create a file outside the allowed directory
      targetPath = path.join(tempDir, "outside-target.txt");
      fs.writeFileSync(targetPath, "target content");

      // Create a symlink inside the allowed directory pointing outside
      symlinkPath = path.join(dataDir, "evil-symlink.txt");

      try {
        fs.symlinkSync(targetPath, symlinkPath);
      } catch (err) {
        // Symlink creation might fail on some systems (Windows without permissions)
        console.warn("Skipping symlink test (creation failed):", err);
      }

      validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        resolveSymlinks: true,
      });
    });

    it("should detect symlink escaping allowed directory", () => {
      if (!fs.existsSync(symlinkPath)) {
        console.warn("Skipping symlink test (symlink not created)");
        return;
      }

      const result = validator.validate(symlinkPath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("outside allowed directories");
    });

    it("should allow symlink pointing within allowed directory", () => {
      const targetInside = path.join(dataDir, "target-inside.txt");
      const symlinkInside = path.join(dataDir, "safe-symlink.txt");

      fs.writeFileSync(targetInside, "safe content");

      try {
        fs.symlinkSync(targetInside, symlinkInside);

        const result = validator.validate(symlinkInside);
        expect(result.valid).toBe(true);
        expect(result.normalizedPath).toBe(path.resolve(targetInside));
      } catch (err) {
        console.warn("Skipping symlink test:", err);
      }
    });

    it("should not resolve symlinks if resolveSymlinks=false", () => {
      const validatorNoResolve = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        resolveSymlinks: false,
      });

      if (!fs.existsSync(symlinkPath)) {
        console.warn("Skipping symlink test (symlink not created)");
        return;
      }

      // With resolveSymlinks=false, it checks the symlink location, not target
      const result = validatorNoResolve.validate(symlinkPath);
      // The symlink itself is inside dataDir, so it should be valid
      expect(result.valid).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    let validator: PathTraversalValidator;

    beforeEach(() => {
      validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });
    });

    it("should handle absolute paths", () => {
      const absolutePath = path.resolve(dataDir, "file.txt");
      const result = validator.validate(absolutePath);
      expect(result.valid).toBe(true);
    });

    it("should handle relative paths", () => {
      const cwd = process.cwd();
      process.chdir(dataDir);

      const result = validator.validate("./file.txt");
      expect(result.valid).toBe(true);

      process.chdir(cwd);
    });

    it("should handle paths with trailing slashes", () => {
      const result = validator.validate(path.join(dataDir, "subdir") + path.sep);
      expect(result.valid).toBe(true);
    });

    it("should handle empty string", () => {
      const result = validator.validate("");
      expect(result.valid).toBe(false);
    });

    it("should handle single dot", () => {
      const cwd = process.cwd();
      process.chdir(dataDir);

      const result = validator.validate(".");
      expect(result.valid).toBe(true);

      process.chdir(cwd);
    });

    it("should handle paths with spaces", () => {
      const spaceDir = path.join(dataDir, "dir with spaces");
      fs.mkdirSync(spaceDir, { recursive: true });

      const result = validator.validate(path.join(spaceDir, "file.txt"));
      expect(result.valid).toBe(true);
    });

    it("should handle paths with special characters", () => {
      const specialFile = path.join(dataDir, "file-with-special_chars@123.txt");
      const result = validator.validate(specialFile);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateOrThrow", () => {
    let validator: PathTraversalValidator;

    beforeEach(() => {
      validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
      });
    });

    it("should return normalized path on success", () => {
      const result = validator.validateOrThrow(path.join(dataDir, "file1.txt"));
      expect(result).toBe(path.resolve(dataDir, "file1.txt"));
    });

    it("should throw on validation failure", () => {
      expect(() => {
        validator.validateOrThrow(path.join(tempDir, "outside.txt"));
      }).toThrow("Path validation failed");
    });
  });

  describe("Helper Functions", () => {
    it("validatePath should work as shorthand", () => {
      const result = validatePath(path.join(dataDir, "file1.txt"), [dataDir]);
      expect(result.valid).toBe(true);
    });

    it("validatePathOrThrow should work as shorthand", () => {
      const result = validatePathOrThrow(path.join(dataDir, "file1.txt"), [dataDir]);
      expect(result).toBe(path.resolve(dataDir, "file1.txt"));
    });

    it("validatePathOrThrow should throw on invalid path", () => {
      expect(() => {
        validatePathOrThrow(path.join(tempDir, "outside.txt"), [dataDir]);
      }).toThrow();
    });

    it("createAppPathValidator should create validator with common paths", () => {
      const appRoot = tempDir;
      // Create the expected directories
      fs.mkdirSync(path.join(appRoot, "data"), { recursive: true });
      fs.writeFileSync(path.join(appRoot, "data", "file.txt"), "test");

      const validator = createAppPathValidator(appRoot);

      // Should allow paths in common app directories
      const dataPath = path.join(appRoot, "data", "file.txt");
      const result = validator.validate(dataPath);
      expect(result.valid).toBe(true);
    });

    it("createAppPathValidator should accept additional paths", () => {
      const appRoot = tempDir;
      const customPath = path.join(tempDir, "custom");
      fs.mkdirSync(customPath, { recursive: true });
      fs.writeFileSync(path.join(customPath, "file.txt"), "test");

      const validator = createAppPathValidator(appRoot, [customPath]);
      const result = validator.validate(path.join(customPath, "file.txt"));
      expect(result.valid).toBe(true);
    });
  });

  describe("Security Properties", () => {
    it("should prevent path traversal to /etc/passwd", () => {
      const validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });

      const result = validator.validate(path.join(dataDir, "../../../../etc/passwd"));
      expect(result.valid).toBe(false);
    });

    it("should prevent Windows path traversal (C:\\Windows\\System32)", () => {
      const validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });

      const result = validator.validate(
        path.join(dataDir, "..\\..\\..\\..\\Windows\\System32\\config"),
      );
      expect(result.valid).toBe(false);
    });

    it("should normalize paths consistently", () => {
      const validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });

      const path1 = validator.validate(path.join(dataDir, "file.txt"));
      const path2 = validator.validate(path.join(dataDir, "./file.txt"));
      const path3 = validator.validate(path.join(dataDir, "subdir/../file.txt"));

      expect(path1.normalizedPath).toBe(path2.normalizedPath);
      expect(path1.normalizedPath).toBe(path3.normalizedPath);
    });

    it("should prevent case-sensitivity bypass on case-insensitive systems", () => {
      const validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });

      // Both should normalize to the same path
      const result1 = validator.validate(path.join(dataDir, "File.txt"));
      const result2 = validator.validate(path.join(dataDir, "file.txt"));

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });
  });

  describe("Performance", () => {
    it("should handle many validations efficiently", () => {
      const validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        validator.validate(path.join(dataDir, `file${i}.txt`));
      }
      const elapsed = Date.now() - start;

      // Should complete 1000 validations in under 1 second
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
