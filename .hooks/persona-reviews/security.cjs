#!/usr/bin/env node
/**
 * Senior Security Engineer Persona Review
 *
 * Performs REAL security analysis of changed code:
 * - Hardcoded secrets / credentials
 * - eval() / new Function()
 * - Path traversal without validation
 * - SQL injection via string concatenation
 * - File uploads without MIME/magic-bytes check
 * - Unvalidated WebSocket message casts
 * - Missing auth on server endpoints
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REVIEW_DIR = ".sprint-review";

console.log("🔒 Senior Security Engineer Review (real code analysis)...");

if (!fs.existsSync(REVIEW_DIR)) {
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
}

// MERGE with existing findings from previous personas
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
      .filter(
        (f) =>
          f && (f.endsWith(".ts") || f.endsWith(".py") || f.endsWith(".js")) && fs.existsSync(f),
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
console.log(`   Analyzing ${files.length} changed files for security issues...`);

const SECRET_PATTERNS = [
  /password\s*=\s*["'][^"']{4,}/i,
  /api[_-]?key\s*=\s*["'][^"']{4,}/i,
  /secret\s*=\s*["'][^"']{8,}/i,
  /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{30,}/,
];

for (const file of files) {
  const code = readFile(file);
  const lines = code.split("\n");

  // CRITICAL: Hardcoded secrets
  lines.forEach((line, i) => {
    const commentIdx = line.indexOf("//");
    const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    for (const pat of SECRET_PATTERNS) {
      if (pat.test(codePart)) {
        OUTPUT.critical.push({
          id: `sec-hardcoded-secret-${file.replace(/\//g, "-")}-${i + 1}`,
          description: `${file}:${i + 1}: possible hardcoded secret/credential`,
          fix: "Move to environment variable or secrets manager",
          persona: "security",
          file,
          line: i + 1,
        });
      }
    }
  });

  // CRITICAL: eval() or new Function()
  lines.forEach((line, i) => {
    if (/\beval\s*\(|new\s+Function\s*\(/.test(line) && !line.trim().startsWith("//")) {
      OUTPUT.critical.push({
        id: `sec-eval-${file.replace(/\//g, "-")}-${i + 1}`,
        description: `${file}:${i + 1}: eval() or new Function() — code injection risk`,
        fix: "Eliminate dynamic code execution",
        persona: "security",
        file,
        line: i + 1,
      });
    }
  });

  // CRITICAL: File upload without magic bytes validation
  if (/upload|multipart/i.test(code) && !/test/i.test(file)) {
    const hasFileTypeCheck = /file-type|magic.*bytes|fileSignature|verifyMime/i.test(code);
    const hasContentTypeCheck = /Content-Type|mimeType|mimetype/i.test(code);
    if (hasContentTypeCheck && !hasFileTypeCheck) {
      OUTPUT.critical.push({
        id: `sec-mime-no-magic-${file.replace(/\//g, "-")}`,
        description: `${file}: file upload validates Content-Type header only — attacker can bypass with fake MIME`,
        fix: "Use 'file-type' npm package to verify actual file signature bytes",
        persona: "security",
        file,
      });
    }
  }

  // IMPORTANT: SQL string concatenation
  lines.forEach((line, i) => {
    if (
      /`\s*(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/.test(line) ||
      /['"].*\b(WHERE|AND)\b.*['"]\s*\+/.test(line)
    ) {
      OUTPUT.important.push({
        id: `sec-sql-injection-${file.replace(/\//g, "-")}-${i + 1}`,
        description: `${file}:${i + 1}: SQL string interpolation — potential injection`,
        fix: "Use parameterized queries / prepared statements",
        persona: "security",
        file,
        line: i + 1,
      });
    }
  });

  // IMPORTANT: path.join with user input, no validator
  lines.forEach((line, i) => {
    if (/path\.(join|resolve)\([^)]*req\.(params|query|body)/.test(line)) {
      const context = lines.slice(Math.max(0, i - 8), i + 3).join("\n");
      if (!/PathTraversalValidator|validatePath|sanitize/i.test(context)) {
        OUTPUT.important.push({
          id: `sec-path-traversal-${file.replace(/\//g, "-")}-${i + 1}`,
          description: `${file}:${i + 1}: path.join/resolve with user input without traversal validation`,
          fix: "Apply PathTraversalValidator before using user-supplied path segments",
          persona: "security",
          file,
          line: i + 1,
        });
      }
    }
  });

  // IMPORTANT: JSON.parse cast without validation
  lines.forEach((line, i) => {
    if (/JSON\.parse\(.*\)\s+as\s+\w/.test(line) && !line.trim().startsWith("//")) {
      OUTPUT.important.push({
        id: `sec-unvalidated-cast-${file.replace(/\//g, "-")}-${i + 1}`,
        description: `${file}:${i + 1}: JSON.parse() result cast to typed interface without validation`,
        fix: "Validate with Zod schema before casting to avoid type confusion attacks",
        persona: "security",
        file,
        line: i + 1,
      });
    }
  });

  // NICE-TO-HAVE: WebSocket server without auth
  if (
    /WebSocketServer|new WS\.WebSocketServer|new WebSocket\.Server/.test(code) &&
    !file.endsWith(".test.ts")
  ) {
    const hasAuth = /token|authenticate|authorize|Bearer|jwt|apiKey/i.test(code);
    if (!hasAuth) {
      OUTPUT.niceToHave.push({
        id: `sec-ws-no-auth-${file.replace(/\//g, "-")}`,
        description: `${file}: WebSocket server accepts all connections without authentication check`,
        fix: "Add token validation on WebSocket upgrade (check query param or first message)",
        persona: "security",
        file,
      });
    }
  }
}

// Deduplicate all buckets
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
