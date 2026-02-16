/**
 * Enhanced credential redaction service for comprehensive security.
 *
 * This module extends the existing redaction patterns in src/logging/redact.ts
 * with additional patterns for database URLs, JWT tokens, AWS credentials, and more.
 *
 * Multi-layer defense: Redaction happens BEFORE encryption.
 */

export type CredentialPattern = {
  name: string;
  regex: RegExp;
  description: string;
};

/**
 * Comprehensive credential patterns covering common secrets.
 * Extends DEFAULT_REDACT_PATTERNS from logging/redact.ts
 */
export const ENHANCED_CREDENTIAL_PATTERNS: CredentialPattern[] = [
  // API Keys & Tokens (General)
  {
    name: "API_KEY",
    regex: /(?:api[_-]?key|apikey)[\s:=]+["']?([a-zA-Z0-9_-]{20,})["']?/gi,
    description: "Generic API keys",
  },
  {
    name: "ACCESS_TOKEN",
    regex: /(?:access[_-]?token|accesstoken)[\s:=]+["']?([a-zA-Z0-9_\-.]{20,})["']?/gi,
    description: "Generic access tokens",
  },
  {
    name: "SECRET_KEY",
    regex: /(?:secret[_-]?key|secretkey)[\s:=]+["']?([a-zA-Z0-9_-]{20,})["']?/gi,
    description: "Generic secret keys",
  },

  // Passwords
  {
    name: "PASSWORD",
    regex: /(?:password|passwd|pwd)[\s:=]+["']?([^\s"']{8,})["']?/gi,
    description: "Passwords",
  },

  // JWT Tokens
  {
    name: "JWT",
    regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
    description: "JWT tokens (3-part base64)",
  },

  // Bearer Tokens
  {
    name: "BEARER_TOKEN",
    regex: /(?:Authorization|authorization)[\s:=]*Bearer\s+([A-Za-z0-9._\-+=]{18,})/g,
    description: "Bearer authorization tokens",
  },

  // AWS Credentials
  {
    name: "AWS_ACCESS_KEY",
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    description: "AWS access keys",
  },
  {
    name: "AWS_SECRET_KEY",
    regex: /aws_secret_access_key[\s:=]+["']?([A-Za-z0-9/+=]{40})["']?/gi,
    description: "AWS secret access keys",
  },
  {
    name: "AWS_SESSION_TOKEN",
    regex: /aws_session_token[\s:=]+["']?([A-Za-z0-9/+=.<>]{20,})["']?/gi,
    description: "AWS session tokens",
  },

  // GitHub Tokens
  {
    name: "GITHUB_TOKEN",
    regex: /\b(ghp_[a-zA-Z0-9]{20,})\b/g,
    description: "GitHub personal access tokens",
  },
  {
    name: "GITHUB_PAT",
    regex: /\b(github_pat_[A-Za-z0-9_]{20,})\b/g,
    description: "GitHub fine-grained PATs",
  },
  {
    name: "GITHUB_OAUTH",
    regex: /\b(gho_[a-zA-Z0-9]{20,})\b/g,
    description: "GitHub OAuth tokens",
  },

  // OpenAI / Anthropic
  {
    name: "OPENAI_KEY",
    regex: /\b(sk-[A-Za-z0-9_-]{20,})\b/g,
    description: "OpenAI API keys",
  },
  {
    name: "ANTHROPIC_KEY",
    regex: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g,
    description: "Anthropic API keys",
  },

  // Slack
  {
    name: "SLACK_TOKEN",
    regex: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
    description: "Slack tokens",
  },
  {
    name: "SLACK_WEBHOOK",
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]{9,}\/[A-Z0-9]{9,}\/[A-Za-z0-9]{24}/g,
    description: "Slack webhook URLs",
  },

  // Google
  {
    name: "GOOGLE_API_KEY",
    regex: /\b(AIza[0-9A-Za-z\-_]{32,})\b/g,
    description: "Google API keys",
  },
  {
    name: "GOOGLE_OAUTH",
    regex: /\b([0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com)\b/g,
    description: "Google OAuth client IDs",
  },

  // Telegram
  {
    name: "TELEGRAM_BOT_TOKEN",
    regex: /\b(\d{8,10}:[A-Za-z0-9_-]{30,})\b/g,
    description: "Telegram bot tokens",
  },

  // Database URLs
  {
    name: "DATABASE_URL",
    regex:
      /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:]+:([^@]+)@[^\s"']+/gi,
    description: "Database connection URLs with passwords",
  },
  {
    name: "CONNECTION_STRING",
    regex: /(?:Server|Data Source|Host)=[^;]+;.*(?:Password|Pwd)=([^;]+)/gi,
    description: "SQL Server connection strings",
  },

  // PEM Private Keys
  {
    name: "PRIVATE_KEY",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g,
    description: "PEM private keys",
  },

  // SSH Keys
  {
    name: "SSH_PRIVATE_KEY",
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]+?-----END OPENSSH PRIVATE KEY-----/g,
    description: "OpenSSH private keys",
  },

  // Generic Secrets (catch-all)
  {
    name: "SECRET",
    regex: /(?:secret)[\s:=]+["']?([a-zA-Z0-9_-]{20,})["']?/gi,
    description: "Generic secrets",
  },
];

/**
 * Options for credential redaction.
 */
export type RedactorOptions = {
  /**
   * Enable/disable redaction entirely.
   * Default: true
   */
  enabled?: boolean;

  /**
   * Custom patterns to use instead of defaults.
   * If provided, only these patterns will be used.
   */
  customPatterns?: CredentialPattern[];

  /**
   * Additional patterns to add to the defaults.
   */
  additionalPatterns?: CredentialPattern[];

  /**
   * Minimum length for a match to be redacted.
   * Shorter matches are replaced with "***".
   * Default: 18
   */
  minLength?: number;

  /**
   * Number of characters to keep at the start of redacted value.
   * Default: 6
   */
  keepStart?: number;

  /**
   * Number of characters to keep at the end of redacted value.
   * Default: 4
   */
  keepEnd?: number;
};

const DEFAULT_MIN_LENGTH = 18;
const DEFAULT_KEEP_START = 6;
const DEFAULT_KEEP_END = 4;

/**
 * Enhanced credential redactor with comprehensive pattern matching.
 */
export class CredentialRedactor {
  private patterns: CredentialPattern[];
  private options: Required<RedactorOptions>;

  constructor(options: RedactorOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      customPatterns: options.customPatterns ?? [],
      additionalPatterns: options.additionalPatterns ?? [],
      minLength: options.minLength ?? DEFAULT_MIN_LENGTH,
      keepStart: options.keepStart ?? DEFAULT_KEEP_START,
      keepEnd: options.keepEnd ?? DEFAULT_KEEP_END,
    };

    // Use custom patterns if provided, otherwise use defaults + additional
    this.patterns =
      this.options.customPatterns.length > 0
        ? this.options.customPatterns
        : [...ENHANCED_CREDENTIAL_PATTERNS, ...this.options.additionalPatterns];
  }

  /**
   * Redact credentials from text using all configured patterns.
   */
  redact(text: string): string {
    if (!this.options.enabled || !text) {
      return text;
    }

    let redacted = text;

    for (const pattern of this.patterns) {
      redacted = redacted.replace(pattern.regex, (...args: string[]) => {
        const match = args[0];
        const groups = args.slice(1, args.length - 2);

        // Handle PEM blocks specially
        if (
          match.includes("PRIVATE KEY-----") ||
          match.includes("OPENSSH PRIVATE KEY-----")
        ) {
          return this.redactPemBlock(match);
        }

        // Extract the actual credential from capture groups
        const credential =
          groups.filter((g) => typeof g === "string" && g.length > 0).at(-1) ??
          match;

        const masked = this.maskCredential(credential);

        // Replace only the credential part, keep surrounding context
        if (credential === match) {
          return `[REDACTED:${pattern.name}]`;
        }

        return match.replace(credential, masked);
      });
    }

    return redacted;
  }

  /**
   * Redact credentials from an object (recursively).
   * Useful for logging structured data.
   */
  redactObject<T>(obj: T): T {
    if (!this.options.enabled) {
      return obj;
    }

    if (typeof obj === "string") {
      return this.redact(obj) as T;
    }

    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item)) as T;
    }

    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Redact both key and value
      const redactedKey = this.redact(key);
      redacted[redactedKey] = this.redactObject(value);
    }

    return redacted as T;
  }

  /**
   * Mask a credential value, keeping some characters visible for debugging.
   */
  private maskCredential(credential: string): string {
    if (credential.length < this.options.minLength) {
      return "***";
    }

    const start = credential.slice(0, this.options.keepStart);
    const end = credential.slice(-this.options.keepEnd);

    return `${start}…${end}`;
  }

  /**
   * Redact PEM blocks while preserving begin/end markers.
   */
  private redactPemBlock(block: string): string {
    const lines = block.split(/\r?\n/).filter(Boolean);

    if (lines.length < 2) {
      return "***";
    }

    // Keep first and last line (BEGIN/END markers), redact content
    return `${lines[0]}\n…[REDACTED]…\n${lines[lines.length - 1]}`;
  }

  /**
   * Get the number of patterns currently active.
   */
  getPatternCount(): number {
    return this.patterns.length;
  }

  /**
   * Get all active patterns (for testing/debugging).
   */
  getPatterns(): CredentialPattern[] {
    return [...this.patterns];
  }
}

/**
 * Create a default credential redactor instance.
 */
export function createDefaultRedactor(): CredentialRedactor {
  return new CredentialRedactor();
}

/**
 * Quick helper to redact text with default patterns.
 */
export function redactCredentials(text: string): string {
  const redactor = createDefaultRedactor();
  return redactor.redact(text);
}
