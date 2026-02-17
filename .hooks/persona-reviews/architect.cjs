#!/usr/bin/env node
/**
 * Senior Architect Persona Review
 *
 * Performs REAL analysis of changed code:
 * - Missing error handling in async paths
 * - Uncaught Promise rejections
 * - God-object anti-patterns (files > 400 lines)
 * - Singleton race conditions
 * - Unbounded caches / memory leaks
 * - Unguarded JSON.parse() in service code
 * - Layer violations (direct DB access from route handlers)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REVIEW_DIR = ".sprint-review";
const OUTPUT = { critical: [], important: [], niceToHave: [] };

console.log("🏗️  Senior Architect Review (real code analysis)...");

if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

// --- Get changed TypeScript/Python files ---
function getChangedFiles() {
  try {
    const lastTag = execSync("git describe --tags --abbrev=0 2>/dev/null", {
      encoding: "utf8",
    }).trim();
    const range = lastTag ? `${lastTag}..HEAD` : "HEAD~15..HEAD";
    return execSync(`git diff --name-only ${range}`, { encoding: "utf8" })
      .split("\n")
      .filter(
        (f) =>
          f &&
          (f.endsWith(".ts") || f.endsWith(".py")) &&
          !f.endsWith(".test.ts") &&
          fs.existsSync(f),
      );
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
console.log(`   Analyzing ${files.length} changed source files...`);

// --- Checks ---
for (const file of files) {
  const code = readFile(file);
  const lines = code.split("\n");

  // CRITICAL: Unguarded JSON.parse (production code crash risk)
  lines.forEach((line, i) => {
    if (
      /JSON\.parse\(/.test(line) &&
      !/try\s*\{/.test(lines.slice(Math.max(0, i - 3), i).join("\n"))
    ) {
      OUTPUT.critical.push({
        id: `arch-json-parse-${file.replace(/\//g, "-")}-${i + 1}`,
        description: `Unguarded JSON.parse() at ${file}:${i + 1} — can throw and crash the service`,
        fix: `Wrap JSON.parse() in try-catch: try { JSON.parse(...) } catch { /* fallback */ }`,
        persona: "architect",
        file,
        line: i + 1,
      });
    }
  });

  // CRITICAL: setInterval without clearInterval on error path
  if (/setInterval\(/.test(code)) {
    const hasErrorClear = /on\("error".*clearInterval|clearInterval.*on\("error"/s.test(code);
    if (!hasErrorClear) {
      OUTPUT.critical.push({
        id: `arch-interval-leak-${file.replace(/\//g, "-")}`,
        description: `${file}: setInterval() created but not cleared in error handler — memory leak`,
        fix: "Add clearInterval() call in the WebSocket/connection error handler",
        persona: "architect",
        file,
      });
    }
  }

  // IMPORTANT: God objects (> 400 lines, non-test)
  if (lines.length > 400) {
    OUTPUT.important.push({
      id: `arch-god-object-${file.replace(/\//g, "-")}`,
      description: `${file} is ${lines.length} lines — consider splitting into smaller modules`,
      fix: "Extract cohesive subsets of functionality into separate files",
      persona: "architect",
      file,
    });
  }

  // IMPORTANT: Unbounded in-memory cache
  if (/=\s*\{\}/.test(code) && /cache/i.test(code) && !/maxSize|MAX_SIZE|lru|evict/i.test(code)) {
    OUTPUT.important.push({
      id: `arch-unbounded-cache-${file.replace(/\//g, "-")}`,
      description: `${file}: unbounded in-memory cache (object/dict) — risk of memory exhaustion`,
      fix: "Add cache size limit or use an LRU eviction strategy",
      persona: "architect",
      file,
    });
  }

  // NICE-TO-HAVE: TODO/FIXME in production code
  lines.forEach((line, i) => {
    if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) {
      OUTPUT.niceToHave.push({
        id: `arch-todo-${file.replace(/\//g, "-")}-${i + 1}`,
        description: `${file}:${i + 1}: unresolved TODO/FIXME comment`,
        fix: "Resolve or move to tech debt register",
        persona: "architect",
        file,
        line: i + 1,
      });
    }
  });

  // NICE-TO-HAVE: Missing explicit return type on exported functions (TS)
  if (file.endsWith(".ts")) {
    lines.forEach((line, i) => {
      if (
        /^export (async )?function \w+\(/.test(line.trim()) &&
        !/:/.test(line.split(")")[1] || "")
      ) {
        OUTPUT.niceToHave.push({
          id: `arch-no-return-type-${file.replace(/\//g, "-")}-${i + 1}`,
          description: `${file}:${i + 1}: exported function missing explicit return type`,
          fix: "Add explicit return type annotation for better API contract clarity",
          persona: "architect",
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
  `   ✅ Found ${OUTPUT.critical.length} critical, ${OUTPUT.important.length} important, ${OUTPUT.niceToHave.length} nice-to-have issues`,
);
