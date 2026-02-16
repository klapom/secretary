/**
 * Secure logger with multi-layer defense: redaction + encryption.
 *
 * Security Architecture:
 * 1. Redaction FIRST - Remove credentials from logs
 * 2. Encryption SECOND - Encrypt redacted logs
 *
 * This ensures that even if encryption keys are compromised,
 * credentials are never present in the encrypted logs.
 */

import type { Logger as TsLogger } from "tslog";
import { CredentialRedactor, type RedactorOptions } from "../security/credential-redactor.js";
import { EncryptionService, type EncryptionOptions } from "../security/encryption.js";
import { getLogger, type LogTransport, registerLogTransport } from "./logger.js";
import type { LogLevel } from "./levels.js";

/**
 * Options for secure logging.
 */
export type SecureLoggerOptions = {
  /**
   * Enable credential redaction.
   * Default: true
   */
  enableRedaction?: boolean;

  /**
   * Enable log encryption.
   * Default: false (opt-in)
   */
  enableEncryption?: boolean;

  /**
   * Redactor configuration.
   */
  redactorOptions?: RedactorOptions;

  /**
   * Encryption configuration.
   */
  encryptionOptions?: EncryptionOptions;
};

/**
 * Secure logger wrapper with multi-layer security.
 *
 * Usage:
 * ```typescript
 * const secureLogger = new SecureLogger({
 *   enableRedaction: true,
 *   enableEncryption: true,
 * });
 *
 * secureLogger.info("User logged in with token: sk-abc123...");
 * // Logged as: "User logged in with token: [REDACTED:OPENAI_KEY]"
 * ```
 */
export class SecureLogger {
  private baseLogger: TsLogger<Record<string, unknown>>;
  private redactor?: CredentialRedactor;
  private encryption?: EncryptionService;
  private enableRedaction: boolean;
  private enableEncryption: boolean;

  constructor(options: SecureLoggerOptions = {}) {
    this.baseLogger = getLogger();
    this.enableRedaction = options.enableRedaction ?? true;
    this.enableEncryption = options.enableEncryption ?? false;

    // Initialize redactor
    if (this.enableRedaction) {
      this.redactor = new CredentialRedactor(options.redactorOptions);
    }

    // Initialize encryption
    if (this.enableEncryption) {
      this.encryption = new EncryptionService(options.encryptionOptions);
    }
  }

  /**
   * Log a message with security applied.
   *
   * Security flow:
   * 1. Redact credentials from message and metadata
   * 2. Encrypt the redacted content (if encryption enabled)
   * 3. Write to log file
   */
  log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    // Apply redaction first
    let secureMessage = this.enableRedaction && this.redactor
      ? this.redactor.redact(message)
      : message;

    let secureMetadata = metadata;
    if (this.enableRedaction && this.redactor && metadata) {
      secureMetadata = this.redactor.redactObject(metadata);
    }

    // Apply encryption second (to redacted content)
    if (this.enableEncryption && this.encryption) {
      // Encrypt the message
      secureMessage = this.encryption.encryptToString(secureMessage);

      // Encrypt metadata if present
      if (secureMetadata) {
        const metadataStr = JSON.stringify(secureMetadata);
        const encryptedMetadata = this.encryption.encryptToString(metadataStr);
        secureMetadata = { _encrypted: encryptedMetadata };
      }
    }

    // Log with base logger
    this.baseLogger[level](secureMessage, secureMetadata);
  }

  // Convenience methods for each log level

  trace(message: string, metadata?: Record<string, unknown>): void {
    this.log("trace", message, metadata);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log("debug", message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log("warn", message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log("error", message, metadata);
  }

  fatal(message: string, metadata?: Record<string, unknown>): void {
    this.log("fatal", message, metadata);
  }

  /**
   * Create a child logger with bindings.
   */
  child(bindings: Record<string, unknown>): SecureLogger {
    // Redact bindings before creating child
    const secureBindings = this.enableRedaction && this.redactor
      ? this.redactor.redactObject(bindings)
      : bindings;

    // Create new secure logger with same options
    const child = new SecureLogger({
      enableRedaction: this.enableRedaction,
      enableEncryption: this.enableEncryption,
      redactorOptions: this.redactor
        ? {
            enabled: this.enableRedaction,
            customPatterns: this.redactor.getPatterns(),
          }
        : undefined,
      encryptionOptions: this.encryption
        ? {
            key: Buffer.from(this.encryption.exportKey(), "hex"),
          }
        : undefined,
    });

    // Add bindings to base logger
    child.baseLogger = this.baseLogger.getSubLogger({
      name: JSON.stringify(secureBindings),
    });

    return child;
  }

  /**
   * Get security statistics.
   */
  getSecurityStats() {
    return {
      redactionEnabled: this.enableRedaction,
      encryptionEnabled: this.enableEncryption,
      patternCount: this.redactor?.getPatternCount() ?? 0,
    };
  }
}

/**
 * Create a secure logger transport for the base logger.
 *
 * This allows you to add security to existing loggers without replacing them.
 */
export function createSecureLogTransport(
  options: SecureLoggerOptions = {},
): LogTransport {
  const redactor = options.enableRedaction !== false
    ? new CredentialRedactor(options.redactorOptions)
    : undefined;

  const encryption = options.enableEncryption === true
    ? new EncryptionService(options.encryptionOptions)
    : undefined;

  return (logObj: Record<string, unknown>) => {
    // Apply redaction to all string values in log object
    if (redactor) {
      for (const [key, value] of Object.entries(logObj)) {
        if (typeof value === "string") {
          logObj[key] = redactor.redact(value);
        } else if (typeof value === "object" && value !== null) {
          logObj[key] = redactor.redactObject(value);
        }
      }
    }

    // Apply encryption (after redaction)
    if (encryption) {
      // Encrypt the entire log object
      const logStr = JSON.stringify(logObj);
      logObj._encrypted = encryption.encryptToString(logStr);

      // Clear other fields (they're now in _encrypted)
      for (const key of Object.keys(logObj)) {
        if (key !== "_encrypted") {
          delete logObj[key];
        }
      }
    }
  };
}

/**
 * Register secure logging globally.
 *
 * This adds secure transport to the existing logger system.
 */
export function enableSecureLogging(options: SecureLoggerOptions = {}): () => void {
  const transport = createSecureLogTransport(options);
  return registerLogTransport(transport);
}

/**
 * Create a default secure logger instance.
 */
export function createDefaultSecureLogger(): SecureLogger {
  return new SecureLogger({
    enableRedaction: true,
    enableEncryption: false, // Opt-in for encryption
  });
}
