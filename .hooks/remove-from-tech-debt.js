#!/usr/bin/env node
/**
 * Remove from Technical Debt
 *
 * Removes a resolved issue from the technical debt register.
 */

const fs = require("fs");

const issueId = process.argv[2];
const TECH_DEBT_FILE = "docs/TECHNICAL_DEBT.md";

if (!issueId) {
  console.error("Usage: node remove-from-tech-debt.js <issue-id>");
  process.exit(1);
}

if (!fs.existsSync(TECH_DEBT_FILE)) {
  console.log("No technical debt file found");
  process.exit(0);
}

let techDebt = fs.readFileSync(TECH_DEBT_FILE, "utf-8");

// Remove the issue entry (including following lines until next issue or end)
const lines = techDebt.split("\n");
const newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (line.includes(`[${issueId}]`)) {
    skip = true;
    continue;
  }

  if (skip && line.match(/^- \*\*\[.*\]\*\*/)) {
    skip = false;
  }

  if (!skip) {
    newLines.push(line);
  }
}

fs.writeFileSync(TECH_DEBT_FILE, newLines.join("\n"));
console.log(`✅ Removed ${issueId} from ${TECH_DEBT_FILE}`);
