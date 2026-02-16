# Security Layer Phase 2 - Implementation Guide

**Status:** ✅ Implemented
**Version:** 2026.2.16
**Author:** Security Engineering Team

---

## Overview

Security Layer Phase 2 introduces advanced protections against path traversal attacks and command obfuscation techniques. This layer complements Phase 1 (credential redaction, sandbox hardening) with proactive defense mechanisms.

---

## Components

### 1. Path Traversal Prevention

**File:** `src/security/path-traversal.ts`

#### Features

- **Whitelist-based Validation:** All paths must be within explicitly allowed base directories
- **Path Normalization:** Resolves relative segments (../, ./) before validation
- **Null Byte Protection:** Blocks null byte injection attacks (\0)
- **URL Encoding Bypass Prevention:** Decodes and validates against encoded traversal sequences
- **Symbolic Link Resolution:** Optionally resolves symlinks before validation

#### Usage

```typescript
import { PathTraversalValidator } from "./security/path-traversal.js";

// Create validator with allowed directories
const validator = new PathTraversalValidator({
  allowedBasePaths: ["/var/app/data", "/tmp/uploads"],
  resolveSymlinks: true, // Default: true
  allowNonExistent: false, // Default: false
});

// Validate a path
const result = validator.validate("/var/app/data/user/file.txt");
if (result.valid) {
  console.log("Safe path:", result.normalizedPath);
} else {
  console.error("Invalid path:", result.error);
}

// Or throw on error
try {
  const safePath = validator.validateOrThrow(userInput);
  // Use safePath safely
} catch (err) {
  console.error("Path validation failed:", err);
}
```

#### Helper Functions

```typescript
import {
  validatePath,
  validatePathOrThrow,
  createAppPathValidator,
} from "./security/path-traversal.js";

// Quick validation
const result = validatePath(userInput, ["/allowed/base"]);

// Validate or throw
const safePath = validatePathOrThrow(userInput, ["/allowed/base"]);

// Create validator for common app directories
const appValidator = createAppPathValidator("/app/root", ["/additional/path"]);
```

#### Attack Vectors Blocked

- **Directory Traversal:** `../../etc/passwd`
- **URL-Encoded Traversal:** `%2e%2e%2f`, `%252e%252e%252f`
- **Null Byte Injection:** `file.txt\0.pdf`, `file.txt%00.pdf`
- **Symbolic Link Escape:** Symlinks pointing outside allowed directories
- **Mixed Evasion:** `..%2f`, `.%2e/`

#### Test Coverage

- **39 unit tests** covering all attack vectors
- **Performance:** <1ms per validation
- **Edge cases:** empty strings, special characters, very long paths

---

### 2. Command Obfuscation Detection

**File:** `src/security/command-obfuscation.ts`

#### Features

- **Base64 Detection:** Identifies base64-encoded shell commands
- **Hex Encoding Detection:** Detects hex-encoded payloads
- **Shell Metacharacter Detection:** Identifies command injection characters
- **High Entropy Analysis:** Shannon entropy calculation for randomness detection
- **URL Encoding Detection:** Identifies excessive URL encoding
- **Suspicious Pattern Matching:** Regex patterns for common attack patterns
- **Unicode Homoglyph Detection:** Detects lookalike characters

#### Usage

```typescript
import { CommandObfuscationDetector } from "./security/command-obfuscation.js";

// Create detector with default settings
const detector = new CommandObfuscationDetector();

// Analyze command
const result = detector.detect("echo SGVsbG8gV29ybGQK | base64 -d | bash");

if (result.detected) {
  console.log("Obfuscation detected!");
  console.log("Techniques:", result.techniques);
  console.log("Confidence:", result.confidence);
  console.log("Details:", result.details);
}
```

#### Configuration Options

```typescript
const detector = new CommandObfuscationDetector({
  detectBase64: true, // Default: true
  detectHex: true, // Default: true
  detectMetacharacters: true, // Default: true
  detectHighEntropy: true, // Default: true
  entropyThreshold: 4.5, // Default: 4.5 (0-8 scale)
  minEntropyLength: 20, // Default: 20 characters
  detectSuspiciousPatterns: true, // Default: true
});
```

#### Helper Functions

```typescript
import {
  detectObfuscation,
  isObfuscated,
  sanitizeCommand,
} from "./security/command-obfuscation.js";

// Quick detection
const result = detectObfuscation(command);

// Boolean check
if (isObfuscated(command)) {
  console.log("Command is obfuscated!");
}

// Sanitize for logging
const sanitized = sanitizeCommand(command);
console.log("Sanitized:", sanitized);
```

#### Detection Capabilities

| Technique           | Example                       | Confidence |
| ------------------- | ----------------------------- | ---------- |
| Base64              | `echo YmFzaA== \| base64 -d`  | 0.8        |
| Hex                 | `echo 626173682... \| xxd -r` | 0.7        |
| URL Encoding        | `curl%20evil.com%2Fshell`     | 0.6        |
| Metacharacters      | `ls; rm -rf /`                | 0.5-0.9    |
| High Entropy        | Random-looking strings        | 0.5        |
| Suspicious Patterns | `bash -c`, `eval()`           | 0.9        |
| Homoglyphs          | Cyrillic lookalikes           | 0.7        |

#### Suspicious Patterns Detected

- `base64 -d`
- `xxd -r -p`
- `python -c`, `perl -e`, `ruby -e`, `node -e`
- `eval()`, `exec()`, `system()`
- `bash -c`, `sh -c`
- `$(...)`, `` `...` ``
- `curl ... | sh`, `wget ... | sh`
- `../../../` (excessive traversal)

#### Test Coverage

- **51 unit tests** covering all detection methods
- **Real-world attack examples:** reverse shells, privilege escalation, data exfiltration
- **Performance:** <10ms per detection
- **Edge cases:** empty strings, very long commands, special characters

---

## Integration with Existing Security

### Phase 1 Components

Security Layer Phase 2 builds upon Phase 1:

1. **Credential Redaction** (`credential-redactor.ts`) - Redacts secrets from logs
2. **Encryption Service** (`encryption.ts`) - AES-256-GCM encryption
3. **Security Audit** (`audit.ts`) - Comprehensive security checks

### Multi-Layer Defense Strategy

```
User Input
    ↓
[Path Traversal Prevention] ← Phase 2
    ↓
[Command Obfuscation Detection] ← Phase 2
    ↓
[Credential Redaction] ← Phase 1
    ↓
[Sandbox Execution] ← Phase 1
    ↓
[Encryption at Rest] ← Phase 1
    ↓
Safe Execution
```

---

## Tool Security Audit

### Tools Requiring Path Validation

The following tools in `src/agents/tools/` handle file paths and should integrate path traversal prevention:

1. **File Operations:**
   - Read/Write operations in subagent tools
   - Memory tool (`memory-tool.ts`)
   - Canvas tool (`canvas-tool.ts`)

2. **Web Tools:**
   - Browser tool (`browser-tool.ts`)
   - Web fetch (`web-fetch.ts`)

3. **Session Tools:**
   - Sessions history (`sessions-history-tool.ts`)
   - Sessions send (`sessions-send-tool.ts`)

### Tools Requiring Command Validation

Tools that execute or process commands should use obfuscation detection:

1. **Execution Tools:**
   - Agent step tool (`agent-step.ts`)
   - Gateway tool (`gateway-tool.ts`)

2. **Communication Tools:**
   - Discord actions (`discord-actions.ts`)
   - Telegram actions (`telegram-actions.ts`)
   - WhatsApp actions (`whatsapp-actions.ts`)
   - Slack actions (`slack-actions.ts`)

---

## Best Practices

### 1. Always Validate User-Provided Paths

```typescript
// ❌ BAD
const filePath = req.body.path;
fs.readFileSync(filePath);

// ✅ GOOD
const validator = new PathTraversalValidator({
  allowedBasePaths: [process.env.DATA_DIR],
});
const safePath = validator.validateOrThrow(req.body.path);
fs.readFileSync(safePath);
```

### 2. Check Commands Before Execution

```typescript
// ❌ BAD
exec(userCommand);

// ✅ GOOD
const detector = new CommandObfuscationDetector();
const result = detector.detect(userCommand);
if (result.detected && result.confidence > 0.7) {
  throw new Error(`Suspicious command detected: ${result.details.join(", ")}`);
}
exec(userCommand); // Still needs additional sandboxing
```

### 3. Layer Multiple Defenses

```typescript
// Multi-layer security
async function executeUserCommand(command: string, workDir: string) {
  // 1. Validate work directory
  const validator = new PathTraversalValidator({
    allowedBasePaths: ["/workspace"],
  });
  const safeWorkDir = validator.validateOrThrow(workDir);

  // 2. Check for obfuscation
  const detector = new CommandObfuscationDetector();
  const obfuscation = detector.detect(command);
  if (obfuscation.detected && obfuscation.confidence > 0.8) {
    throw new SecurityError("Command obfuscation detected");
  }

  // 3. Redact credentials from logs
  const redactor = new CredentialRedactor();
  logger.info("Executing:", redactor.redact(command));

  // 4. Execute in sandbox
  return sandbox.exec(command, { cwd: safeWorkDir });
}
```

### 4. Configure Appropriate Thresholds

```typescript
// For production environments (strict)
const strictDetector = new CommandObfuscationDetector({
  entropyThreshold: 4.0, // Lower = more sensitive
  minEntropyLength: 15, // Detect shorter patterns
});

// For development (relaxed)
const relaxedDetector = new CommandObfuscationDetector({
  entropyThreshold: 5.5, // Higher = less sensitive
  minEntropyLength: 30,
});
```

---

## Performance Considerations

- **Path Validation:** < 1ms per call
- **Command Detection:** < 10ms per call
- **Minimal overhead for most operations**
- **Caching recommendations:** Reuse validator instances

```typescript
// ✅ GOOD - Reuse instance
const validator = new PathTraversalValidator({ allowedBasePaths: [...] });
for (const path of userPaths) {
  validator.validate(path);
}

// ❌ BAD - Creating new instance each time
for (const path of userPaths) {
  new PathTraversalValidator({ allowedBasePaths: [...] }).validate(path);
}
```

---

## Testing

### Running Tests

```bash
# Run all security tests
npm run test -- src/security/

# Run specific test suites
npm run test -- src/security/path-traversal.test.ts
npm run test -- src/security/command-obfuscation.test.ts

# Run with coverage
npm run test:coverage -- src/security/
```

### Test Results

- **path-traversal.test.ts:** 39/39 tests passing ✅
- **command-obfuscation.test.ts:** 51/51 tests passing ✅
- **Total:** 90 security tests

---

## Threat Model

### Attacks Mitigated

1. **Path Traversal (OWASP A01:2021)**
   - Directory traversal to sensitive files
   - Symbolic link attacks
   - Null byte injection

2. **Command Injection (OWASP A03:2021)**
   - Obfuscated payloads
   - Base64/hex encoded commands
   - Shell metacharacter injection

3. **Injection Attacks (OWASP A03:2021)**
   - URL encoding bypass
   - Unicode normalization attacks
   - Homoglyph substitution

### Limitations

- **Does NOT replace sandboxing:** Always use sandbox execution for untrusted code
- **Does NOT prevent all attacks:** Defense in depth required
- **Requires proper integration:** Tools must explicitly use these validators
- **Static analysis only:** Runtime behavior monitoring still needed

---

## Migration Guide

### Integrating into Existing Code

1. **Identify file path operations:**

```bash
grep -r "fs.readFile\|fs.writeFile\|path.join" src/agents/tools/
```

2. **Add path validation:**

```typescript
import { PathTraversalValidator } from "../security/path-traversal.js";

// Before tool execution
const validator = new PathTraversalValidator({
  allowedBasePaths: [toolConfig.dataDir],
});
const safePath = validator.validateOrThrow(userInputPath);
```

3. **Identify command execution:**

```bash
grep -r "exec\|spawn\|system" src/agents/tools/
```

4. **Add obfuscation detection:**

```typescript
import { CommandObfuscationDetector } from "../security/command-obfuscation.js";

const detector = new CommandObfuscationDetector();
const result = detector.detect(userCommand);
if (result.detected && result.confidence > 0.7) {
  throw new Error("Suspicious command detected");
}
```

---

## Roadmap

### Phase 3 (Future)

- [ ] SQL injection detection
- [ ] XSS prevention for web outputs
- [ ] Rate limiting for repeated security violations
- [ ] Security event logging and alerting
- [ ] Machine learning-based anomaly detection

---

## References

- **OWASP Top 10 2021:** https://owasp.org/Top10/
- **CWE-22 (Path Traversal):** https://cwe.mitre.org/data/definitions/22.html
- **CWE-78 (OS Command Injection):** https://cwe.mitre.org/data/definitions/78.html
- **CWE-116 (Encoding/Escaping):** https://cwe.mitre.org/data/definitions/116.html

---

## Support

For security issues, please contact the security team or create an issue with the `security` label.

**Last Updated:** 2026-02-16
