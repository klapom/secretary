/**
 * Command Obfuscation Detection
 *
 * Detects obfuscated commands that may be used to bypass security controls.
 *
 * Threat Model:
 * - Base64/hex encoded commands (e.g., echo <base64> | base64 -d | bash)
 * - Shell metacharacters used for command injection
 * - URL encoding to hide malicious commands
 * - Homoglyph/unicode attacks
 *
 * Detection Strategies:
 * - Pattern matching for common encoding schemes
 * - Entropy analysis for random-looking strings
 * - Metacharacter detection
 * - Suspicious command pattern detection
 */

/**
 * Configuration for command obfuscation detection.
 */
export type CommandObfuscationConfig = {
  /**
   * Enable base64 detection.
   * Default: true
   */
  detectBase64?: boolean;

  /**
   * Enable hex encoding detection.
   * Default: true
   */
  detectHex?: boolean;

  /**
   * Enable shell metacharacter detection.
   * Default: true
   */
  detectMetacharacters?: boolean;

  /**
   * Enable high entropy detection (random-looking strings).
   * Default: true
   */
  detectHighEntropy?: boolean;

  /**
   * Entropy threshold (0-8, higher = more random).
   * Default: 4.5
   */
  entropyThreshold?: number;

  /**
   * Minimum string length for entropy analysis.
   * Default: 20
   */
  minEntropyLength?: number;

  /**
   * Enable suspicious command pattern detection.
   * Default: true
   */
  detectSuspiciousPatterns?: boolean;
};

/**
 * Result of obfuscation detection.
 */
export type ObfuscationDetectionResult = {
  /**
   * Whether obfuscation was detected.
   */
  detected: boolean;

  /**
   * Confidence level (0-1).
   */
  confidence: number;

  /**
   * List of detected obfuscation techniques.
   */
  techniques: ObfuscationTechnique[];

  /**
   * Detailed findings.
   */
  details: string[];
};

/**
 * Types of obfuscation techniques.
 */
export type ObfuscationTechnique =
  | "base64"
  | "hex"
  | "url-encoding"
  | "shell-metacharacters"
  | "high-entropy"
  | "suspicious-pattern"
  | "unicode-homoglyph";

/**
 * Command Obfuscation Detection Service
 *
 * Analyzes commands for obfuscation techniques commonly used in attacks.
 *
 * Example:
 * ```typescript
 * const detector = new CommandObfuscationDetector();
 * const result = detector.detect('echo SGVsbG8gV29ybGQK | base64 -d');
 *
 * if (result.detected) {
 *   console.log('Obfuscation detected:', result.techniques);
 * }
 * ```
 */
export class CommandObfuscationDetector {
  private config: Required<CommandObfuscationConfig>;

  // Shell metacharacters that can be used for command injection
  private static readonly SHELL_METACHARACTERS = [
    ";",
    "|",
    "&",
    "$(",
    "`",
    "&&",
    "||",
    ">",
    "<",
    ">>",
    "<<",
  ];

  // Suspicious command patterns
  private static readonly SUSPICIOUS_PATTERNS = [
    /base64\s+-d/i,
    /xxd\s+-r\s+-p/i,
    /python\s+-c/i,
    /perl\s+-e/i,
    /ruby\s+-e/i,
    /node\s+-e/i,
    /eval\s*\(/i,
    /exec\s*\(/i,
    /system\s*\(/i,
    /\bsh\s+-c\b/i,
    /\bbash\s+-c\b/i,
    /\$\(.*\)/,
    /`.*`/,
    /curl.*\|\s*sh/i,
    /wget.*\|\s*sh/i,
    /\.\.\/.*\.\.\/.*\.\.\//,
  ];

  // Base64-like patterns (length > 20, ends with = or ==)
  private static readonly BASE64_PATTERN = /\b[A-Za-z0-9+/]{20,}={0,2}\b/;

  // Hex-like patterns (long sequences of hex chars)
  private static readonly HEX_PATTERN = /\b[0-9a-fA-F]{40,}\b/;

  // URL encoding patterns
  private static readonly URL_ENCODING_PATTERN = /%[0-9a-fA-F]{2}/;

  constructor(config: CommandObfuscationConfig = {}) {
    this.config = {
      detectBase64: config.detectBase64 !== false,
      detectHex: config.detectHex !== false,
      detectMetacharacters: config.detectMetacharacters !== false,
      detectHighEntropy: config.detectHighEntropy !== false,
      entropyThreshold: config.entropyThreshold ?? 4.5,
      minEntropyLength: config.minEntropyLength ?? 20,
      detectSuspiciousPatterns: config.detectSuspiciousPatterns !== false,
    };
  }

  /**
   * Detect obfuscation in a command string.
   *
   * @param command - Command string to analyze
   * @returns Detection result with techniques and confidence
   */
  detect(command: string): ObfuscationDetectionResult {
    const techniques: ObfuscationTechnique[] = [];
    const details: string[] = [];
    let totalConfidence = 0;
    let detectionCount = 0;

    // 1. Base64 detection
    if (this.config.detectBase64 && this.detectBase64(command)) {
      techniques.push("base64");
      details.push("Base64-encoded string detected");
      totalConfidence += 0.8;
      detectionCount++;
    }

    // 2. Hex encoding detection
    if (this.config.detectHex && this.detectHex(command)) {
      techniques.push("hex");
      details.push("Hex-encoded string detected");
      totalConfidence += 0.7;
      detectionCount++;
    }

    // 3. URL encoding detection
    if (this.detectUrlEncoding(command)) {
      techniques.push("url-encoding");
      details.push("URL-encoded characters detected");
      totalConfidence += 0.6;
      detectionCount++;
    }

    // 4. Shell metacharacter detection
    if (this.config.detectMetacharacters) {
      const metacharCount = this.detectMetacharacters(command);
      if (metacharCount > 0) {
        techniques.push("shell-metacharacters");
        details.push(`${metacharCount} shell metacharacters detected`);
        totalConfidence += Math.min(0.9, 0.3 + metacharCount * 0.1);
        detectionCount++;
      }
    }

    // 5. High entropy detection
    if (this.config.detectHighEntropy) {
      const entropy = this.calculateEntropy(command);
      if (
        command.length >= this.config.minEntropyLength &&
        entropy > this.config.entropyThreshold
      ) {
        techniques.push("high-entropy");
        details.push(`High entropy detected: ${entropy.toFixed(2)}`);
        totalConfidence += 0.5;
        detectionCount++;
      }
    }

    // 6. Suspicious pattern detection
    if (this.config.detectSuspiciousPatterns) {
      const suspiciousPatterns = this.detectSuspiciousPatterns(command);
      if (suspiciousPatterns.length > 0) {
        techniques.push("suspicious-pattern");
        details.push(`Suspicious patterns: ${suspiciousPatterns.join(", ")}`);
        totalConfidence += 0.9;
        detectionCount++;
      }
    }

    // 7. Unicode homoglyph detection
    if (this.detectHomoglyphs(command)) {
      techniques.push("unicode-homoglyph");
      details.push("Unicode homoglyphs detected");
      totalConfidence += 0.7;
      detectionCount++;
    }

    const confidence = detectionCount > 0 ? Math.min(1.0, totalConfidence / detectionCount) : 0;

    return {
      detected: techniques.length > 0,
      confidence,
      techniques,
      details,
    };
  }

  /**
   * Detect base64-encoded strings.
   */
  private detectBase64(command: string): boolean {
    if (!CommandObfuscationDetector.BASE64_PATTERN.test(command)) {
      return false;
    }

    // Try to decode and check if it contains suspicious commands
    const matches = command.match(CommandObfuscationDetector.BASE64_PATTERN);
    if (!matches) {
      return false;
    }

    for (const match of matches) {
      try {
        const decoded = Buffer.from(match, "base64").toString("utf8");
        // Check if decoded string contains shell commands
        if (this.containsShellCommands(decoded)) {
          return true;
        }
      } catch {
        // Not valid base64, continue
      }
    }

    return false;
  }

  /**
   * Detect hex-encoded strings.
   */
  private detectHex(command: string): boolean {
    if (!CommandObfuscationDetector.HEX_PATTERN.test(command)) {
      return false;
    }

    const matches = command.match(CommandObfuscationDetector.HEX_PATTERN);
    if (!matches) {
      return false;
    }

    for (const match of matches) {
      try {
        const decoded = Buffer.from(match, "hex").toString("utf8");
        if (this.containsShellCommands(decoded)) {
          return true;
        }
      } catch {
        // Not valid hex, continue
      }
    }

    return false;
  }

  /**
   * Detect URL-encoded strings.
   */
  private detectUrlEncoding(command: string): boolean {
    if (!CommandObfuscationDetector.URL_ENCODING_PATTERN.test(command)) {
      return false;
    }

    // Check if more than 10% of the string is URL-encoded
    const matches = command.match(/%[0-9a-fA-F]{2}/g);
    if (!matches) {
      return false;
    }

    const encodedRatio = (matches.length * 3) / command.length;
    return encodedRatio > 0.1;
  }

  /**
   * Detect shell metacharacters.
   */
  private detectMetacharacters(command: string): number {
    let count = 0;
    for (const metachar of CommandObfuscationDetector.SHELL_METACHARACTERS) {
      if (command.includes(metachar)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Calculate Shannon entropy of a string.
   * Higher entropy indicates more randomness (potential obfuscation).
   */
  private calculateEntropy(str: string): number {
    if (str.length === 0) {
      return 0;
    }

    const freq: Record<string, number> = {};
    for (const char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }

    let entropy = 0;
    const len = str.length;

    for (const count of Object.values(freq)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Detect suspicious command patterns.
   */
  private detectSuspiciousPatterns(command: string): string[] {
    const detected: string[] = [];

    for (const pattern of CommandObfuscationDetector.SUSPICIOUS_PATTERNS) {
      if (pattern.test(command)) {
        detected.push(pattern.toString());
      }
    }

    return detected;
  }

  /**
   * Check if string contains shell commands.
   */
  private containsShellCommands(str: string): boolean {
    const commonCommands = [
      "bash",
      "sh",
      "curl",
      "wget",
      "nc",
      "netcat",
      "python",
      "perl",
      "ruby",
      "eval",
      "exec",
      "chmod",
      "sudo",
    ];

    const lowerStr = str.toLowerCase();
    return commonCommands.some((cmd) => lowerStr.includes(cmd));
  }

  /**
   * Detect Unicode homoglyphs (lookalike characters).
   */
  private detectHomoglyphs(command: string): boolean {
    // Check for non-ASCII characters that look like ASCII
    const homoglyphs: Record<string, string[]> = {
      a: ["\u0430"], // Cyrillic a
      c: ["\u0441"], // Cyrillic c
      e: ["\u0435"], // Cyrillic e
      o: ["\u043e"], // Cyrillic o
      p: ["\u0440"], // Cyrillic p
      x: ["\u0445"], // Cyrillic x
    };

    for (const [_ascii, lookalikes] of Object.entries(homoglyphs)) {
      for (const lookalike of lookalikes) {
        if (command.includes(lookalike)) {
          return true;
        }
      }
    }

    return false;
  }
}

/**
 * Quick helper to detect obfuscation in a command.
 *
 * @param command - Command string to analyze
 * @returns Detection result
 */
export function detectObfuscation(command: string): ObfuscationDetectionResult {
  const detector = new CommandObfuscationDetector();
  return detector.detect(command);
}

/**
 * Quick helper to check if a command is obfuscated.
 *
 * @param command - Command string to analyze
 * @returns True if obfuscation detected
 */
export function isObfuscated(command: string): boolean {
  const result = detectObfuscation(command);
  return result.detected;
}

/**
 * Sanitize a command by removing detected obfuscation.
 * WARNING: This is not a substitute for proper input validation.
 *
 * @param command - Command to sanitize
 * @returns Sanitized command
 */
export function sanitizeCommand(command: string): string {
  // Remove base64 patterns
  let sanitized = command.replace(CommandObfuscationDetector.BASE64_PATTERN, "[REDACTED-BASE64]");

  // Remove hex patterns
  sanitized = sanitized.replace(CommandObfuscationDetector.HEX_PATTERN, "[REDACTED-HEX]");

  // Remove URL encoding
  sanitized = sanitized.replace(/%[0-9a-fA-F]{2}/g, "[REDACTED-URLENC]");

  return sanitized;
}
