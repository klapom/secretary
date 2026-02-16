#!/usr/bin/env node
/**
 * Add to Technical Debt
 *
 * Adds nice-to-have issues to the technical debt register.
 */

const fs = require("fs");
// const path = require('path');

const issuesFile = process.argv[2];

if (!issuesFile || !fs.existsSync(issuesFile)) {
  console.error("Issues file not found");
  process.exit(1);
}

const issues = JSON.parse(fs.readFileSync(issuesFile, "utf-8"));
const TECH_DEBT_FILE = "docs/TECHNICAL_DEBT.md";

// Ensure docs directory exists
if (!fs.existsSync("docs")) {
  fs.mkdirSync("docs", { recursive: true });
}

// Create or load tech debt file
let techDebt = "";
if (fs.existsSync(TECH_DEBT_FILE)) {
  techDebt = fs.readFileSync(TECH_DEBT_FILE, "utf-8");
} else {
  techDebt = `# Technical Debt Register

This file tracks technical debt items identified during sprint reviews.

## Format

- **[ID]** Description
  - **Persona:** Who identified it
  - **Fix:** How to resolve it
  - **Added:** Sprint number

---

`;
}

// Add new issues
const date = new Date().toISOString().split("T")[0];
let newEntries = "\n## Added " + date + "\n\n";

for (const issue of issues) {
  newEntries += `- **[${issue.id}]** ${issue.description}\n`;
  newEntries += `  - **Persona:** ${issue.persona}\n`;
  newEntries += `  - **Fix:** ${issue.fix}\n\n`;
}

techDebt += newEntries;

fs.writeFileSync(TECH_DEBT_FILE, techDebt);
console.log(`✅ Added ${issues.length} issues to ${TECH_DEBT_FILE}`);
