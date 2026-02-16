#!/usr/bin/env node
/**
 * Scan existing log files for potential credentials.
 *
 * This script:
 * 1. Finds all log files in the log directory
 * 2. Scans each file for credential patterns
 * 3. Reports findings with line numbers
 * 4. Optionally creates redacted copies of logs
 *
 * Usage:
 *   pnpm tsx scripts/scan-logs-for-credentials.ts [--redact] [--log-dir <path>]
 *
 * Options:
 *   --redact       Create redacted copies of logs
 *   --log-dir      Custom log directory (default: from config)
 */

import fs from "node:fs";
import path from "node:path";
import { createDefaultRedactor } from "../src/security/credential-redactor.js";
import { DEFAULT_LOG_DIR } from "../src/logging/logger.js";

type ScanOptions = {
  logDir: string;
  redact: boolean;
  outputDir?: string;
};

type Finding = {
  file: string;
  line: number;
  patternName: string;
  context: string;
};

/**
 * Scan a single log file for credentials.
 */
function scanLogFile(filePath: string): Finding[] {
  const findings: Finding[] = [];
  const redactor = createDefaultRedactor();
  const patterns = redactor.getPatterns();

  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of patterns) {
        const matches = line.matchAll(pattern.regex);

        for (const match of matches) {
          findings.push({
            file: filePath,
            line: i + 1,
            patternName: pattern.name,
            context: line.substring(0, 100), // First 100 chars
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning ${filePath}:`, error);
  }

  return findings;
}

/**
 * Create a redacted copy of a log file.
 */
function redactLogFile(
  inputPath: string,
  outputDir: string,
): { success: boolean; outputPath?: string; error?: string } {
  try {
    const redactor = createDefaultRedactor();
    const content = fs.readFileSync(inputPath, "utf8");
    const redacted = redactor.redact(content);

    // Create output filename
    const basename = path.basename(inputPath);
    const outputPath = path.join(outputDir, `${basename}.redacted`);

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // Write redacted content
    fs.writeFileSync(outputPath, redacted, "utf8");

    return { success: true, outputPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Find all log files in a directory.
 */
function findLogFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    if (!fs.existsSync(dir)) {
      console.warn(`Log directory does not exist: ${dir}`);
      return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".log")) {
        files.push(path.join(dir, entry.name));
      }
    }
  } catch (error) {
    console.error(`Error reading log directory ${dir}:`, error);
  }

  return files;
}

/**
 * Format findings for display.
 */
function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) {
    return "✅ No credentials found in logs.";
  }

  const lines: string[] = [
    `⚠️  Found ${findings.length} potential credential(s) in logs:\n`,
  ];

  // Group by file
  const byFile = new Map<string, Finding[]>();
  for (const finding of findings) {
    const existing = byFile.get(finding.file) ?? [];
    existing.push(finding);
    byFile.set(finding.file, existing);
  }

  for (const [file, fileFindings] of byFile.entries()) {
    lines.push(`\n📄 ${file} (${fileFindings.length} findings):`);

    for (const finding of fileFindings) {
      lines.push(
        `  Line ${finding.line}: [${finding.patternName}]`,
        `    ${finding.context.trim()}...`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Main scan function.
 */
function scanLogs(options: ScanOptions): void {
  console.log("🔍 Scanning logs for credentials...\n");
  console.log(`Log directory: ${options.logDir}`);
  console.log(`Redaction mode: ${options.redact ? "ENABLED" : "disabled"}\n`);

  // Find log files
  const logFiles = findLogFiles(options.logDir);

  if (logFiles.length === 0) {
    console.log("No log files found.");
    return;
  }

  console.log(`Found ${logFiles.length} log file(s) to scan.\n`);

  // Scan each file
  const allFindings: Finding[] = [];

  for (const logFile of logFiles) {
    console.log(`Scanning: ${path.basename(logFile)}...`);
    const findings = scanLogFile(logFile);
    allFindings.push(...findings);
  }

  // Display findings
  console.log("\n" + formatFindings(allFindings));

  // Redact if requested
  if (options.redact && allFindings.length > 0) {
    console.log("\n🔐 Creating redacted copies...\n");

    const outputDir = options.outputDir ?? path.join(options.logDir, "redacted");

    const filesToRedact = new Set(allFindings.map((f) => f.file));

    for (const file of filesToRedact) {
      const result = redactLogFile(file, outputDir);

      if (result.success) {
        console.log(`✅ ${path.basename(file)} → ${result.outputPath}`);
      } else {
        console.error(`❌ ${path.basename(file)}: ${result.error}`);
      }
    }

    console.log(
      `\n✅ Redacted logs saved to: ${outputDir}`,
      `\n⚠️  Original logs left unchanged. Review and delete manually if needed.`,
    );
  }

  // Exit with error code if credentials found
  if (allFindings.length > 0) {
    console.log(
      `\n⚠️  SECURITY WARNING: Found ${allFindings.length} potential credential(s).`,
      "\n   Please review and remediate.",
    );
    process.exit(1);
  }

  console.log("\n✅ No credentials found. Logs are clean.");
}

/**
 * Parse command line arguments.
 */
function parseArgs(): ScanOptions {
  const args = process.argv.slice(2);

  const options: ScanOptions = {
    logDir: DEFAULT_LOG_DIR,
    redact: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--redact") {
      options.redact = true;
    } else if (arg === "--log-dir" && i + 1 < args.length) {
      options.logDir = args[i + 1];
      i++;
    } else if (arg === "--output-dir" && i + 1 < args.length) {
      options.outputDir = args[i + 1];
      i++;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: scan-logs-for-credentials.ts [options]

Scan log files for potential credentials and optionally create redacted copies.

Options:
  --redact           Create redacted copies of logs with credentials
  --log-dir <path>   Custom log directory (default: from config)
  --output-dir <path> Custom output directory for redacted logs
  -h, --help         Show this help message

Examples:
  # Scan logs (read-only)
  pnpm tsx scripts/scan-logs-for-credentials.ts

  # Scan and create redacted copies
  pnpm tsx scripts/scan-logs-for-credentials.ts --redact

  # Scan custom directory
  pnpm tsx scripts/scan-logs-for-credentials.ts --log-dir /var/log/openclaw
      `);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  scanLogs(options);
}

export { scanLogs, scanLogFile, redactLogFile, findLogFiles };
