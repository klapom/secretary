/**
 * Path Traversal Prevention
 *
 * Provides whitelist-based path validation to prevent directory traversal attacks.
 *
 * Security Model:
 * - All paths must be within explicitly whitelisted base directories
 * - Path normalization prevents ../ and symbolic link attacks
 * - Null byte injection protection
 * - URL encoding bypass prevention
 */

import { realpathSync, existsSync, lstatSync } from "node:fs";
import path from "node:path";

/**
 * Configuration for path traversal validation.
 */
export type PathTraversalConfig = {
  /**
   * List of allowed base directories (absolute paths).
   * All validated paths must be within one of these directories.
   */
  allowedBasePaths: string[];

  /**
   * If true, resolve symbolic links before validation.
   * Default: true (recommended for security)
   */
  resolveSymlinks?: boolean;

  /**
   * If true, allow paths that don't exist yet.
   * Default: false (only validate existing paths)
   */
  allowNonExistent?: boolean;
};

/**
 * Result of path validation.
 */
export type PathValidationResult = {
  /**
   * Whether the path is valid and safe.
   */
  valid: boolean;

  /**
   * Normalized absolute path (if valid).
   */
  normalizedPath?: string;

  /**
   * Base path that this path is allowed under (if valid).
   */
  allowedBase?: string;

  /**
   * Error message if validation failed.
   */
  error?: string;
};

/**
 * Path Traversal Prevention Service
 *
 * Validates paths against a whitelist of allowed base directories.
 *
 * Example:
 * ```typescript
 * const validator = new PathTraversalValidator({
 *   allowedBasePaths: ['/var/app/data', '/tmp/uploads']
 * });
 *
 * const result = validator.validate('/var/app/data/user/file.txt');
 * if (result.valid) {
 *   // Safe to use result.normalizedPath
 * }
 * ```
 */
export class PathTraversalValidator {
  private allowedBasePaths: string[];
  private resolveSymlinks: boolean;
  private allowNonExistent: boolean;

  constructor(config: PathTraversalConfig) {
    if (!config.allowedBasePaths || config.allowedBasePaths.length === 0) {
      throw new Error("PathTraversalValidator requires at least one allowed base path");
    }

    // Normalize and resolve all base paths
    this.allowedBasePaths = config.allowedBasePaths.map((p) => path.resolve(p));
    this.resolveSymlinks = config.resolveSymlinks !== false; // Default true
    this.allowNonExistent = config.allowNonExistent === true; // Default false
  }

  /**
   * Validate a path against the whitelist.
   *
   * @param inputPath - Path to validate (can be relative or absolute)
   * @returns Validation result with normalized path if valid
   */
  validate(inputPath: string): PathValidationResult {
    // 1. Check for null bytes (common attack vector)
    if (inputPath.includes("\0")) {
      return {
        valid: false,
        error: "Path contains null byte",
      };
    }

    // 2. Check for URL-encoded path traversal attempts
    const decoded = this.decodePathSafely(inputPath);
    if (decoded.includes("..") || decoded.includes("\0")) {
      return {
        valid: false,
        error: "Path contains encoded traversal sequence",
      };
    }

    // 3. Normalize the path (resolve relative segments)
    let normalizedPath: string;
    try {
      normalizedPath = path.resolve(decoded);
    } catch (err) {
      return {
        valid: false,
        error: `Failed to normalize path: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 4. Check if path exists (if required)
    if (!this.allowNonExistent && !existsSync(normalizedPath)) {
      return {
        valid: false,
        error: "Path does not exist",
      };
    }

    // 5. Resolve symbolic links (if enabled and path exists)
    if (this.resolveSymlinks && existsSync(normalizedPath)) {
      try {
        const stats = lstatSync(normalizedPath);
        if (stats.isSymbolicLink()) {
          normalizedPath = realpathSync(normalizedPath);
        }
      } catch (err) {
        return {
          valid: false,
          error: `Failed to resolve symlink: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // 6. Check if normalized path is within any allowed base
    for (const basePath of this.allowedBasePaths) {
      if (this.isPathInside(basePath, normalizedPath)) {
        return {
          valid: true,
          normalizedPath,
          allowedBase: basePath,
        };
      }
    }

    // Path is outside all allowed bases
    return {
      valid: false,
      error: "Path is outside allowed directories",
    };
  }

  /**
   * Validate a path and return the normalized path if valid, or throw an error.
   *
   * @param inputPath - Path to validate
   * @returns Normalized absolute path
   * @throws Error if path is invalid
   */
  validateOrThrow(inputPath: string): string {
    const result = this.validate(inputPath);
    if (!result.valid) {
      throw new Error(`Path validation failed: ${result.error}`);
    }
    return result.normalizedPath!;
  }

  /**
   * Check if a path is inside a base directory.
   * Uses path.relative() to detect upward traversal.
   */
  private isPathInside(basePath: string, candidatePath: string): boolean {
    const rel = path.relative(basePath, candidatePath);
    // If relative path starts with .., it's outside the base
    // If relative path is absolute, it's outside the base
    // Empty string means it's the same path as base, which is valid
    return !rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel);
  }

  /**
   * Safely decode URL-encoded paths.
   * Handles double-encoding and other evasion techniques.
   */
  private decodePathSafely(input: string): string {
    let decoded = input;
    let prevDecoded = "";

    // Decode up to 3 times (handles double/triple encoding)
    for (let i = 0; i < 3; i++) {
      prevDecoded = decoded;
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
        // If decoding fails, use the previous value
        return prevDecoded;
      }

      // If no change, we're done
      if (decoded === prevDecoded) {
        break;
      }
    }

    return decoded;
  }

  /**
   * Get the list of allowed base paths.
   */
  getAllowedBasePaths(): string[] {
    return [...this.allowedBasePaths];
  }
}

/**
 * Quick helper to validate a path against allowed bases.
 *
 * @param inputPath - Path to validate
 * @param allowedBasePaths - List of allowed base directories
 * @returns Validation result
 */
export function validatePath(inputPath: string, allowedBasePaths: string[]): PathValidationResult {
  const validator = new PathTraversalValidator({ allowedBasePaths });
  return validator.validate(inputPath);
}

/**
 * Quick helper to validate and throw on error.
 *
 * @param inputPath - Path to validate
 * @param allowedBasePaths - List of allowed base directories
 * @returns Normalized path
 * @throws Error if validation fails
 */
export function validatePathOrThrow(inputPath: string, allowedBasePaths: string[]): string {
  const validator = new PathTraversalValidator({ allowedBasePaths });
  return validator.validateOrThrow(inputPath);
}

/**
 * Create a validator for common application directories.
 *
 * @param appRoot - Application root directory
 * @param additionalPaths - Additional allowed paths
 */
export function createAppPathValidator(
  appRoot: string,
  additionalPaths: string[] = [],
): PathTraversalValidator {
  const allowedBasePaths = [
    path.join(appRoot, "data"),
    path.join(appRoot, "uploads"),
    path.join(appRoot, "tmp"),
    ...additionalPaths,
  ];

  return new PathTraversalValidator({ allowedBasePaths });
}
