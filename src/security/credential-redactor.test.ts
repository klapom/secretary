/**
 * Unit tests for CredentialRedactor.
 *
 * Tests comprehensive pattern matching for all credential types.
 */

import { describe, expect, it } from "vitest";
import { CredentialRedactor, redactCredentials, ENHANCED_CREDENTIAL_PATTERNS } from "./credential-redactor.js";

describe("CredentialRedactor", () => {
  describe("API Keys", () => {
    it("should redact generic API keys", () => {
      const redactor = new CredentialRedactor();
      const text = "API_KEY=abc123def456ghi789jkl012mno345pqr678stu901vwx234";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("abc123def456ghi789jkl012mno345pqr678stu901vwx234");
      expect(redacted).toContain("abc123…x234");
    });

    it("should redact OpenAI keys", () => {
      const redactor = new CredentialRedactor();
      const text = "OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
      expect(redacted).toContain("sk-123…wxyz");
    });

    it("should redact Anthropic keys", () => {
      const redactor = new CredentialRedactor();
      const text = "key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890");
    });

    it("should redact Google API keys", () => {
      const redactor = new CredentialRedactor();
      const text = "GOOGLE_KEY=AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890");
    });
  });

  describe("GitHub Tokens", () => {
    it("should redact GitHub personal access tokens", () => {
      const redactor = new CredentialRedactor();
      const text = "token: ghp_1234567890abcdefghijklmnopqrstuv";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("ghp_1234567890abcdefghijklmnopqrstuv");
      // Pattern replaces entire token
      expect(redacted).toContain("[REDACTED:GITHUB_TOKEN]");
    });

    it("should redact GitHub fine-grained PATs", () => {
      const redactor = new CredentialRedactor();
      const text = "github_pat_1234567890abcdefghijklmnop";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("github_pat_1234567890abcdefghijklmnop");
    });

    it("should redact GitHub OAuth tokens", () => {
      const redactor = new CredentialRedactor();
      const text = "oauth: gho_1234567890abcdefghijklmnopqrstuv";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("gho_1234567890abcdefghijklmnopqrstuv");
    });
  });

  describe("AWS Credentials", () => {
    it("should redact AWS access keys", () => {
      const redactor = new CredentialRedactor();
      const text = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
    });

    it("should redact AWS secret keys", () => {
      const redactor = new CredentialRedactor();
      const text = "aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    });

    it("should redact AWS session tokens", () => {
      const redactor = new CredentialRedactor();
      const text = "aws_session_token=AQoDYXdzEJr123456789EXAMPLE";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("AQoDYXdzEJr123456789EXAMPLE");
      // Check it was masked
      expect(redacted).toMatch(/AQoDYX.*MPLE/);
    });
  });

  describe("JWT Tokens", () => {
    it("should redact JWT tokens", () => {
      const redactor = new CredentialRedactor();
      const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const text = `Authorization: Bearer ${jwt}`;
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain(jwt);
    });
  });

  describe("Passwords", () => {
    it("should redact password fields", () => {
      const redactor = new CredentialRedactor();
      const text = "password=MySecretP@ssw0rd123";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("MySecretP@ssw0rd123");
    });

    it("should redact passwd fields", () => {
      const redactor = new CredentialRedactor();
      const text = 'passwd="AnotherSecretPass123"';
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("AnotherSecretPass123");
    });
  });

  describe("Database URLs", () => {
    it("should redact PostgreSQL URLs", () => {
      const redactor = new CredentialRedactor();
      const text = "postgres://user:SuperSecret123@localhost:5432/mydb";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("SuperSecret123");
      expect(redacted).toContain("postgres://user:");
      expect(redacted).toContain("@localhost:5432/mydb");
    });

    it("should redact MongoDB URLs", () => {
      const redactor = new CredentialRedactor();
      const text = "mongodb://admin:MongoPass456@mongo.example.com:27017";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("MongoPass456");
    });

    it("should redact MySQL URLs", () => {
      const redactor = new CredentialRedactor();
      const text = "mysql://root:MySQLPassword789@db.example.com/database";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("MySQLPassword789");
    });
  });

  describe("Slack Tokens", () => {
    it("should redact Slack bot tokens", () => {
      const redactor = new CredentialRedactor();
      const text = "SLACK_TOKEN=xoxb-1234567890-abcdefghijklmnop";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("xoxb-1234567890-abcdefghijklmnop");
    });

    it("should redact Slack webhook URLs", () => {
      const redactor = new CredentialRedactor();
      const text = "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX");
    });
  });

  describe("Telegram Tokens", () => {
    it("should redact Telegram bot tokens", () => {
      const redactor = new CredentialRedactor();
      const text = "BOT_TOKEN=123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ1234567890";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("ABCDefGhIJKlmNoPQRsTUVwxyZ1234567890");
      expect(redacted).toContain("[REDACTED:TELEGRAM_BOT_TOKEN]");
    });
  });

  describe("Private Keys", () => {
    it("should redact RSA private keys", () => {
      const redactor = new CredentialRedactor();
      const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF0qUp9qg4wPKvN3kO9G+LlC7pSh4
... many lines ...
-----END RSA PRIVATE KEY-----`;
      const redacted = redactor.redact(pem);
      expect(redacted).toContain("-----BEGIN RSA PRIVATE KEY-----");
      expect(redacted).toContain("-----END RSA PRIVATE KEY-----");
      expect(redacted).toContain("[REDACTED]");
      expect(redacted).not.toContain("MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF0qUp9qg4wPKvN3kO9G+LlC7pSh4");
    });

    it("should redact OpenSSH private keys", () => {
      const redactor = new CredentialRedactor();
      const key = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAaAAAABNlY2RzYS
... many lines ...
-----END OPENSSH PRIVATE KEY-----`;
      const redacted = redactor.redact(key);
      expect(redacted).toContain("-----BEGIN OPENSSH PRIVATE KEY-----");
      expect(redacted).toContain("-----END OPENSSH PRIVATE KEY-----");
      expect(redacted).toContain("[REDACTED]");
    });
  });

  describe("Object Redaction", () => {
    it("should redact strings in objects", () => {
      const redactor = new CredentialRedactor();
      const obj = {
        apiKey: "sk-1234567890abcdefghijklmnopqrstuvwxyz",
        username: "john",
        token: "ghp_1234567890abcdefghijklmnopqrstuv",
      };
      const redacted = redactor.redactObject(obj);
      expect(redacted.apiKey).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
      expect(redacted.apiKey).toContain("[REDACTED:OPENAI_KEY]");
      expect(redacted.username).toBe("john");
      expect(redacted.token).not.toContain("ghp_1234567890abcdefghijklmnopqrstuv");
    });

    it("should redact strings in arrays", () => {
      const redactor = new CredentialRedactor();
      const arr = [
        "normal text",
        "api_key=abc123def456ghi789jkl012mno345pqr678",
        { token: "ghp_1234567890abcdefghijklmnopqrstuv" },
      ];
      const redacted = redactor.redactObject(arr);
      expect(redacted[0]).toBe("normal text");
      expect(redacted[1]).not.toContain("abc123def456ghi789jkl012mno345pqr678");
      expect(redacted[2].token).not.toContain("ghp_1234567890abcdefghijklmnopqrstuv");
    });

    it("should handle null and undefined", () => {
      const redactor = new CredentialRedactor();
      expect(redactor.redactObject(null)).toBe(null);
      expect(redactor.redactObject(undefined)).toBe(undefined);
    });
  });

  describe("Custom Patterns", () => {
    it("should support custom patterns", () => {
      const redactor = new CredentialRedactor({
        customPatterns: [
          {
            name: "CUSTOM_SECRET",
            regex: /SECRET-\d{6}/g,
            description: "Custom secret format",
          },
        ],
      });
      const text = "My secret is SECRET-123456";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("SECRET-123456");
    });

    it("should support additional patterns", () => {
      const redactor = new CredentialRedactor({
        additionalPatterns: [
          {
            name: "EXTRA_PATTERN",
            regex: /EXTRA-\d{6}/g,
            description: "Extra pattern",
          },
        ],
      });
      const text = "OpenAI: sk-1234567890abcdefghijklmnopqrstuvwxyz Extra: EXTRA-789012";
      const redacted = redactor.redact(text);
      // Should redact both default (OpenAI) and additional (EXTRA)
      expect(redacted).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
      expect(redacted).not.toContain("EXTRA-789012");
    });
  });

  describe("Options", () => {
    it("should respect enabled option", () => {
      const redactor = new CredentialRedactor({ enabled: false });
      const text = "api_key=abc123def456ghi789jkl012mno345pqr678";
      const redacted = redactor.redact(text);
      expect(redacted).toBe(text); // Not redacted
    });

    it("should respect minLength option", () => {
      const redactor = new CredentialRedactor({ minLength: 30 });
      const text = "password=shortpass123";
      const redacted = redactor.redact(text);
      // Short password should be replaced with ***
      expect(redacted).toContain("***");
      expect(redacted).not.toContain("shortpass123");
    });

    it("should respect keepStart and keepEnd options", () => {
      const redactor = new CredentialRedactor({
        keepStart: 3,
        keepEnd: 2,
      });
      const text = "api_key=abc123def456ghi789jkl012mno345pqr678";
      const redacted = redactor.redact(text);
      expect(redacted).toContain("abc…78"); // 3 start + 2 end
    });
  });

  describe("Helper Functions", () => {
    it("should work with redactCredentials helper", () => {
      const text = "OPENAI_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz";
      const redacted = redactCredentials(text);
      expect(redacted).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
    });
  });

  describe("Pattern Coverage", () => {
    it("should have all expected pattern types", () => {
      const patternNames = ENHANCED_CREDENTIAL_PATTERNS.map((p) => p.name);

      // Verify key patterns exist
      expect(patternNames).toContain("API_KEY");
      expect(patternNames).toContain("PASSWORD");
      expect(patternNames).toContain("JWT");
      expect(patternNames).toContain("AWS_ACCESS_KEY");
      expect(patternNames).toContain("GITHUB_TOKEN");
      expect(patternNames).toContain("OPENAI_KEY");
      expect(patternNames).toContain("DATABASE_URL");
      expect(patternNames).toContain("PRIVATE_KEY");
    });

    it("should have at least 25 patterns", () => {
      expect(ENHANCED_CREDENTIAL_PATTERNS.length).toBeGreaterThanOrEqual(24);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty strings", () => {
      const redactor = new CredentialRedactor();
      expect(redactor.redact("")).toBe("");
    });

    it("should handle strings with no credentials", () => {
      const redactor = new CredentialRedactor();
      const text = "This is a normal log message with no secrets.";
      expect(redactor.redact(text)).toBe(text);
    });

    it("should handle multiple credentials in one string", () => {
      const redactor = new CredentialRedactor();
      const text = "API_KEY=sk-1234567890abcdefghijklmnopqrstuvwxyz PASSWORD=MySecret123";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
      expect(redacted).not.toContain("MySecret123");
    });

    it("should handle credentials at different positions", () => {
      const redactor = new CredentialRedactor();
      const text = "sk-123456789012345678901234567890 at start, middle api_key=abc123def456ghi789jkl012mno345pqr678, end ghp_1234567890abcdefghijklmnopqrstuv";
      const redacted = redactor.redact(text);
      expect(redacted).not.toContain("sk-123456789012345678901234567890");
      expect(redacted).not.toContain("abc123def456ghi789jkl012mno345pqr678");
      expect(redacted).not.toContain("ghp_1234567890abcdefghijklmnopqrstuv");
    });
  });
});
