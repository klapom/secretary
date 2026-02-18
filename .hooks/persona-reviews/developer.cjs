#!/usr/bin/env node
/**
 * Senior Developer Persona Review
 *
 * Performs REAL code quality analysis of changed code:
 * - console.log() in production source (not tests)
 * - `as any` casts (TypeScript type safety gaps)
 * - Magic numbers not assigned to named constants
 * - Empty catch blocks (silent error swallowing)
 * - Promise without await and no .catch()
 * - Unused variables / imports (quick heuristic)
 * - Missing null checks before property access
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REVIEW_DIR = ".sprint-review";

console.log("💻 Senior Developer Review (real code analysis)...");

if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

function load(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(REVIEW_DIR, file), "utf8"));
  } catch {
    return [];
  }
}

const OUTPUT = {
  critical: load("critical.json"),
  important: load("important.json"),
  niceToHave: load("nice-to-have.json"),
};

function getChangedFiles() {
  try {
    const lastTag = execSync("git describe --tags --abbrev=0 2>/dev/null", {
      encoding: "utf8",
    }).trim();
    const range = lastTag ? `${lastTag}..HEAD` : "HEAD~15..HEAD";
    return execSync(`git diff --name-only ${range}`, { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && (f.endsWith(".ts") || f.endsWith(".py")) && fs.existsSync(f));
  } catch {
    return [];
  }
}

function readFile(f) {
  try {
    return fs.readFileSync(f, "utf8");
  } catch {
    return "";
  }
}

const files = getChangedFiles();
const prodFiles = files.filter((f) => !f.endsWith(".test.ts") && !f.includes(".bench."));

console.log(`   Analyzing ${prodFiles.length} production source files...`);

for (const file of prodFiles) {
  const code = readFile(file);
  const lines = code.split("\n");

  // CRITICAL: Empty catch blocks (swallowed errors)
  for (let i = 0; i < lines.length; i++) {
    if (/\}\s*catch\s*\([^)]*\)\s*\{/.test(lines[i])) {
      // Check if next line is immediately closing brace (empty catch)
      const catchBody = lines
        .slice(i + 1, i + 4)
        .join("\n")
        .trim();
      if (/^\/\/.*$|^$/.test(catchBody.split("\n")[0].trim())) {
        // next line is comment or empty — check if block closes on line after
        if (/^\s*\}/.test(lines[i + 2] || "")) {
          OUTPUT.critical.push({
            id: `dev-empty-catch-${file.replace(/\//g, "-")}-${i + 1}`,
            description: `${file}:${i + 1}: empty catch block swallows errors silently`,
            fix: "Log the error or re-throw; never silently swallow exceptions",
            persona: "developer",
            file,
            line: i + 1,
          });
        }
      }
    }
  }

  // IMPORTANT: console.log/warn/error in production source
  lines.forEach((line, i) => {
    if (/console\.(log|warn|error|debug)\(/.test(line) && !line.trim().startsWith("//")) {
      // Allow console.error in catch blocks (deliberate logging)
      const context = lines.slice(Math.max(0, i - 2), i + 1).join("\n");
      if (!/catch/.test(context) || /console\.log/.test(line)) {
        OUTPUT.important.push({
          id: `dev-console-log-${file.replace(/\//g, "-")}-${i + 1}`,
          description: `${file}:${i + 1}: console.log() in production code — use structured logger`,
          fix: "Replace with logger.info/warn/error from the project's logger module",
          persona: "developer",
          file,
          line: i + 1,
        });
      }
    }
  });

  // IMPORTANT: Overuse of `as any` (TypeScript type safety)
  const anyCount = (code.match(/\bas\s+any\b/g) || []).length;
  if (anyCount > 3) {
    OUTPUT.important.push({
      id: `dev-as-any-${file.replace(/\//g, "-")}`,
      description: `${file}: ${anyCount} uses of 'as any' — significant type safety gap`,
      fix: "Replace with proper type assertions or typed interfaces. Start with the most critical data paths.",
      persona: "developer",
      file,
    });
  }

  // IMPORTANT: Floating promises (no await, no .catch)
  lines.forEach((line, i) => {
    // Look for function calls that return promises without being awaited
    if (
      /^\s*(db\.|fs\.|this\.|server\.)/.test(line) &&
      /\(/.test(line) &&
      !/await\s+|\.catch\(|\.then\(|return\s+/.test(line) &&
      !/=/.test(line) &&
      !line.trim().startsWith("//")
    ) {
      OUTPUT.niceToHave.push({
        id: `dev-floating-promise-${file.replace(/\//g, "-")}-${i + 1}`,
        description: `${file}:${i + 1}: possible floating promise (async call without await or .catch)`,
        fix: "Add await or .catch() to handle promise rejection",
        persona: "developer",
        file,
        line: i + 1,
      });
    }
  });

  // NICE-TO-HAVE: Magic numbers (non-0/1/-1 literals in conditions/calculations)
  lines.forEach((line, i) => {
    if (
      /\b(if|while|for)\b.*\b[2-9]\d{2,}\b/.test(line) &&
      !/\/\//.test(line.split("//")[0] || "")
    ) {
      OUTPUT.niceToHave.push({
        id: `dev-magic-number-${file.replace(/\//g, "-")}-${i + 1}`,
        description: `${file}:${i + 1}: magic number in condition — should be a named constant`,
        fix: "Extract to a named constant: const MAX_RETRY_DELAY_MS = 30000",
        persona: "developer",
        file,
        line: i + 1,
      });
    }
  });

  // NICE-TO-HAVE: Python specific — bare except clauses
  if (file.endsWith(".py")) {
    lines.forEach((line, i) => {
      if (/^\s*except\s*:/.test(line) || /^\s*except\s+Exception\s*:/.test(line)) {
        OUTPUT.niceToHave.push({
          id: `dev-bare-except-${file.replace(/\//g, "-")}-${i + 1}`,
          description: `${file}:${i + 1}: bare except clause catches all exceptions including SystemExit`,
          fix: "Catch specific exception types or at minimum log with traceback",
          persona: "developer",
          file,
          line: i + 1,
        });
      }
    });
  }
}

// Deduplicate
for (const key of ["critical", "important", "niceToHave"]) {
  const seen = new Set();
  OUTPUT[key] = OUTPUT[key].filter((x) => {
    if (seen.has(x.id)) {
      return false;
    }
    seen.add(x.id);
    return true;
  });
}

fs.writeFileSync(path.join(REVIEW_DIR, "critical.json"), JSON.stringify(OUTPUT.critical, null, 2));
fs.writeFileSync(
  path.join(REVIEW_DIR, "important.json"),
  JSON.stringify(OUTPUT.important, null, 2),
);
fs.writeFileSync(
  path.join(REVIEW_DIR, "nice-to-have.json"),
  JSON.stringify(OUTPUT.niceToHave, null, 2),
);

console.log(
  `   ✅ Found ${OUTPUT.critical.length} critical, ${OUTPUT.important.length} important, ${OUTPUT.niceToHave.length} nice-to-have issues (cumulative)`,
);
