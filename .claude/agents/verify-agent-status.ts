/**
 * Agent Status Verification Helper (TypeScript)
 *
 * Programmatic verification of agent status messages.
 * Can be integrated into team-lead automation.
 */

import { execSync } from "node:child_process";

export interface VerificationResult {
  success: boolean;
  commitsFound: string[];
  commitsNotFound: string[];
  totalCommits: number;
  message: string;
}

/**
 * Extract commit hashes from agent status message
 */
export function extractCommitHashes(message: string): string[] {
  // Match 7-9 character hex strings (git short hashes)
  const regex = /\b[a-f0-9]{7,9}\b/g;
  const matches = message.match(regex) || [];

  // Deduplicate
  return [...new Set(matches)];
}

/**
 * Verify commit exists in git log
 */
export function verifyCommitExists(hash: string): boolean {
  try {
    const gitLog = execSync('git log --oneline --all', { encoding: 'utf-8' });
    return gitLog.includes(hash);
  } catch (error) {
    console.error(`Error checking git log:`, error);
    return false;
  }
}

/**
 * Verify all commits from agent status message
 */
export function verifyAgentStatus(message: string): VerificationResult {
  const hashes = extractCommitHashes(message);

  if (hashes.length === 0) {
    return {
      success: false,
      commitsFound: [],
      commitsNotFound: [],
      totalCommits: 0,
      message: "No commit hashes found in message"
    };
  }

  const found: string[] = [];
  const notFound: string[] = [];

  for (const hash of hashes) {
    if (verifyCommitExists(hash)) {
      found.push(hash);
    } else {
      notFound.push(hash);
    }
  }

  const allFound = notFound.length === 0;

  return {
    success: allFound,
    commitsFound: found,
    commitsNotFound: notFound,
    totalCommits: hashes.length,
    message: allFound
      ? `All ${hashes.length} commit(s) verified in git log`
      : `${notFound.length}/${hashes.length} commit(s) not found in git log`
  };
}

/**
 * Format verification result for display
 */
export function formatVerificationResult(result: VerificationResult): string {
  const lines: string[] = [];

  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`🔍 Agent Status Verification`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");

  if (result.totalCommits === 0) {
    lines.push("⚠️  No commit hashes found in message");
    lines.push("");
    lines.push("Expected format:");
    lines.push("  📦 Commit: abc123456");
    lines.push("  📦 Commits: abc1234, def5678");
    return lines.join("\n");
  }

  lines.push(`📦 Found ${result.totalCommits} commit hash(es):`);

  for (const hash of result.commitsFound) {
    lines.push(`   ✅ ${hash} - FOUND`);
  }

  for (const hash of result.commitsNotFound) {
    lines.push(`   ❌ ${hash} - NOT FOUND`);
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (result.success) {
    lines.push("✅ VERIFICATION PASSED");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("All reported commits exist in git history.");
    lines.push("Agent status is CONFIRMED.");
  } else if (result.commitsFound.length > 0) {
    lines.push("⚠️  PARTIAL VERIFICATION");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push(`${result.commitsNotFound.length} commit(s) not found.`);
    lines.push("Agent may have reported incorrect hashes or work not committed yet.");
  } else {
    lines.push("❌ VERIFICATION FAILED");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("");
    lines.push("No reported commits found in git log.");
    lines.push("Possible issues:");
    lines.push("  - Agent hasn't committed yet");
    lines.push("  - Agent reported wrong hashes");
    lines.push("  - Git repository out of sync");
  }

  return lines.join("\n");
}

// CLI Usage (if run directly)
if (import.meta.url === `file://${process.argv[1]}`) {
  const message = process.argv[2];

  if (!message) {
    console.log("Usage: node verify-agent-status.ts '<agent-status-message>'");
    console.log("");
    console.log("Example:");
    console.log("  node verify-agent-status.ts '✅ Phase complete (commit: 1a65765eb)'");
    process.exit(1);
  }

  const result = verifyAgentStatus(message);
  console.log(formatVerificationResult(result));

  process.exit(result.success ? 0 : 1);
}
