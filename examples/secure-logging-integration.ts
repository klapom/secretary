/**
 * Secure Logging Integration Example
 *
 * Demonstrates how to integrate the multi-layer security system
 * for credential protection in logging.
 *
 * Usage:
 *   pnpm tsx examples/secure-logging-integration.ts
 */

import { SecureLogger, enableSecureLogging } from "../src/logging/secure-logger.js";
import { CredentialRedactor } from "../src/security/credential-redactor.js";
import { EncryptionService } from "../src/security/encryption.js";

console.log("🔐 Secure Logging Integration Examples\n");

// =============================================================================
// Example 1: Basic Redaction (Most Common Use Case)
// =============================================================================

console.log("📝 Example 1: Basic Redaction");
console.log("─".repeat(60));

const basicLogger = new SecureLogger({
  enableRedaction: true,
  enableEncryption: false,
});

// These credentials will be automatically redacted
basicLogger.info("User authenticated with API key: sk-1234567890abcdefghijklmnopqrstuvwxyz");
basicLogger.info("Database connected: postgres://user:MySecret123@localhost:5432/db");
basicLogger.warn("GitHub token found: ghp_abcdefghijklmnopqrstuvwxyz123456");

console.log("✅ Credentials redacted automatically\n");

// =============================================================================
// Example 2: Multi-Layer Defense (Redaction + Encryption)
// =============================================================================

console.log("📝 Example 2: Multi-Layer Defense (Redaction + Encryption)");
console.log("─".repeat(60));

const secureLogger = new SecureLogger({
  enableRedaction: true,
  enableEncryption: true,
});

secureLogger.info("Payment processed", {
  userId: "user123",
  apiKey: "sk-secret-key-12345",
  amount: 99.99,
});

console.log("✅ Message redacted AND encrypted\n");

// =============================================================================
// Example 3: Custom Credential Patterns
// =============================================================================

console.log("📝 Example 3: Custom Credential Patterns");
console.log("─".repeat(60));

const customLogger = new SecureLogger({
  enableRedaction: true,
  redactorOptions: {
    additionalPatterns: [
      {
        name: "CUSTOM_API_KEY",
        regex: /CUSTOM-[A-Z0-9]{16}/g,
        description: "Custom API key format",
      },
      {
        name: "LICENSE_KEY",
        regex: /LIC-[0-9]{4}-[0-9]{4}-[0-9]{4}/g,
        description: "License key format",
      },
    ],
  },
});

customLogger.info("Activating with license: LIC-1234-5678-9012");
customLogger.info("Custom API: CUSTOM-ABCD1234EFGH5678");

console.log("✅ Custom patterns detected and redacted\n");

// =============================================================================
// Example 4: Global Secure Logging (All Loggers Protected)
// =============================================================================

console.log("📝 Example 4: Global Secure Logging");
console.log("─".repeat(60));

// Enable secure logging globally for all loggers
const unregister = enableSecureLogging({
  enableRedaction: true,
  enableEncryption: false,
});

console.log("✅ Secure logging enabled globally");
console.log("   All logs will now be redacted automatically\n");

// Later: disable if needed
// unregister();

// =============================================================================
// Example 5: Standalone Redactor (Non-Logging Use Cases)
// =============================================================================

console.log("📝 Example 5: Standalone Credential Redactor");
console.log("─".repeat(60));

const redactor = new CredentialRedactor();

// Redact text
const unsafeText = "Connect with: mongodb://admin:SuperSecret123@mongo.example.com:27017";
const safeText = redactor.redact(unsafeText);

console.log("Before:", unsafeText);
console.log("After: ", safeText);

// Redact object
const unsafeObject = {
  username: "alice",
  apiKey: "sk-1234567890abcdefghijklmnopqrstuvwxyz",
  config: {
    githubToken: "ghp_abcdefghijklmnopqrstuvwxyz123456",
  },
};

const safeObject = redactor.redactObject(unsafeObject);

console.log("\nBefore:");
console.log(JSON.stringify(unsafeObject, null, 2));
console.log("\nAfter:");
console.log(JSON.stringify(safeObject, null, 2));

console.log("\n✅ Standalone redaction complete\n");

// =============================================================================
// Example 6: Encryption Service (Key Management)
// =============================================================================

console.log("📝 Example 6: Encryption Service");
console.log("─".repeat(60));

// Create encryption service (auto-generates key if needed)
const encryption = new EncryptionService({
  keyFile: "/tmp/example-encryption.key",
  autoGenerateKey: true,
});

const plaintext = "Sensitive data that should be encrypted";

// Encrypt
const encrypted = encryption.encryptToString(plaintext);
console.log("Plaintext: ", plaintext);
console.log("Encrypted: ", encrypted.substring(0, 50) + "...");

// Decrypt
const decrypted = encryption.decryptFromString(encrypted);
console.log("Decrypted: ", decrypted);

console.log("\n✅ Encryption/Decryption successful\n");

// =============================================================================
// Example 7: Child Loggers (Contextual Logging)
// =============================================================================

console.log("📝 Example 7: Child Loggers");
console.log("─".repeat(60));

const parentLogger = new SecureLogger({ enableRedaction: true });

// Create child loggers with context
const authLogger = parentLogger.child({ module: "auth" });
const dbLogger = parentLogger.child({ module: "database" });

authLogger.info("User login with token: sk-abc123xyz789...");
dbLogger.info("Query executed: SELECT * FROM users WHERE password='secret123'");

console.log("✅ Child loggers inherit security from parent\n");

// =============================================================================
// Example 8: Security Statistics
// =============================================================================

console.log("📝 Example 8: Security Statistics");
console.log("─".repeat(60));

const statsLogger = new SecureLogger({
  enableRedaction: true,
  enableEncryption: false,
});

const stats = statsLogger.getSecurityStats();

console.log("Security Configuration:");
console.log(`  - Redaction: ${stats.redactionEnabled ? "✅ Enabled" : "❌ Disabled"}`);
console.log(`  - Encryption: ${stats.encryptionEnabled ? "✅ Enabled" : "❌ Disabled"}`);
console.log(`  - Patterns: ${stats.patternCount} credential types protected`);

console.log("\n✅ Security stats retrieved\n");

// =============================================================================
// Example 9: Error Handling with Secure Logging
// =============================================================================

console.log("📝 Example 9: Error Handling");
console.log("─".repeat(60));

const errorLogger = new SecureLogger({ enableRedaction: true });

try {
  // Simulate API call that might throw error with credentials
  throw new Error("API call failed: Invalid key sk-1234567890abcdefghijklmnopqrstuvwxyz");
} catch (error) {
  // Error message will be redacted
  errorLogger.error("API error occurred", {
    error: (error as Error).message,
    timestamp: new Date().toISOString(),
  });
}

console.log("✅ Error logged with credentials redacted\n");

// =============================================================================
// Example 10: Real-World Express Integration
// =============================================================================

console.log("📝 Example 10: Express Middleware Pattern");
console.log("─".repeat(60));

// Simulated Express middleware
function secureLoggingMiddleware() {
  const logger = new SecureLogger({ enableRedaction: true });

  return (req: any, res: any, next: () => void) => {
    // Log request (headers may contain Authorization tokens)
    logger.info("Incoming request", {
      method: req.method,
      url: req.url,
      headers: req.headers, // Automatically redacted if contains credentials
      ip: req.ip,
    });

    // Continue processing
    next();
  };
}

console.log("✅ Express middleware pattern demonstrated");
console.log("   Use: app.use(secureLoggingMiddleware())\n");

// =============================================================================
// Summary
// =============================================================================

console.log("=" .repeat(60));
console.log("🎉 All Examples Complete!");
console.log("=" .repeat(60));

console.log("\n📚 Next Steps:");
console.log("  1. Enable SecureLogger in your application");
console.log("  2. Run log scanning: pnpm tsx scripts/scan-logs-for-credentials.ts");
console.log("  3. Add custom patterns for your service-specific credentials");
console.log("  4. Enable encryption for production environments");
console.log("\n📖 Documentation: docs-secretary/security/CREDENTIAL_PROTECTION.md\n");
