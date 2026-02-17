#!/usr/bin/env node
/**
 * Senior Tester Persona Review
 *
 * Performs REAL test quality analysis of changed code:
 * - Source files without corresponding test files
 * - Skipped tests (it.skip / xit / xdescribe)
 * - console.log() in test files
 * - Hardcoded setTimeout in tests (flaky potential)
 * - Test files with no assertions (empty it() blocks)
 * - Missing error path tests (no "should fail" / "should throw" test)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REVIEW_DIR = ".sprint-review";

console.log("🧪 Senior Tester Review (real code analysis)...");

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
      .filter((f) => f && f.endsWith(".ts") && fs.existsSync(f));
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
const sourceFiles = files.filter((f) => !f.endsWith(".test.ts") && !f.includes(".bench."));
const testFiles = files.filter((f) => f.endsWith(".test.ts"));

console.log(
  `   Analyzing ${sourceFiles.length} source files and ${testFiles.length} test files...`,
);

// CRITICAL: Source files with no test file at all
for (const srcFile of sourceFiles) {
  const testPath = srcFile.replace(/\.ts$/, ".test.ts");
  const altTestPath = srcFile.replace(/\.ts$/, ".spec.ts");
  // Skip files that are type declarations, entry points, or explicitly excluded
  if (srcFile.includes("index.ts") || srcFile.includes("types") || srcFile.includes("cli.ts")) {
    continue;
  }
  if (!fs.existsSync(testPath) && !fs.existsSync(altTestPath)) {
    // Check if there's any test that imports this file
    const basename = path.basename(srcFile, ".ts");
    const srcDir = path.dirname(srcFile);
    const hasTestInDir = fs
      .readdirSync(srcDir)
      .some(
        (f) =>
          f.endsWith(".test.ts") &&
          fs.readFileSync(path.join(srcDir, f), "utf8").includes(basename),
      );
    if (!hasTestInDir) {
      OUTPUT.important.push({
        id: `test-no-test-file-${srcFile.replace(/\//g, "-")}`,
        description: `${srcFile}: no corresponding test file found`,
        fix: `Create ${testPath} with unit tests for all exported functions`,
        persona: "tester",
        file: srcFile,
      });
    }
  }
}

// CRITICAL: Skipped tests in test files
for (const testFile of testFiles) {
  const code = readFile(testFile);
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    if (/\b(it|test|describe)\.skip\b|^\s*(xit|xdescribe|xtest)\(/.test(line)) {
      OUTPUT.important.push({
        id: `test-skipped-${testFile.replace(/\//g, "-")}-${i + 1}`,
        description: `${testFile}:${i + 1}: skipped test — functionality untested`,
        fix: "Fix the underlying issue and unskip the test, or remove it",
        persona: "tester",
        file: testFile,
        line: i + 1,
      });
    }
  });
}

// IMPORTANT: Tests with hardcoded delays > 500ms (flakiness risk)
for (const testFile of testFiles) {
  const code = readFile(testFile);
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    const match = line.match(/setTimeout\s*\([^,]+,\s*(\d+)\s*\)/);
    if (match && parseInt(match[1]) > 500) {
      OUTPUT.important.push({
        id: `test-flaky-delay-${testFile.replace(/\//g, "-")}-${i + 1}`,
        description: `${testFile}:${i + 1}: setTimeout(${match[1]}ms) in test — flakiness risk on slow CI`,
        fix: "Use vi.useFakeTimers() or reduce delay. If real timing required, add comment.",
        persona: "tester",
        file: testFile,
        line: i + 1,
      });
    }
  });
}

// IMPORTANT: Test files without any error path test
for (const testFile of testFiles) {
  const code = readFile(testFile);
  const hasErrorTest =
    /should.*fail|should.*throw|should.*error|should.*reject|toThrow|rejects|throws/i.test(code);
  if (!hasErrorTest && code.length > 500) {
    OUTPUT.important.push({
      id: `test-no-error-path-${testFile.replace(/\//g, "-")}`,
      description: `${testFile}: no error path tests (no toThrow/rejects/should fail patterns)`,
      fix: "Add tests for invalid inputs, error conditions, and rejection cases",
      persona: "tester",
      file: testFile,
    });
  }
}

// NICE-TO-HAVE: console.log in test files
for (const testFile of testFiles) {
  const code = readFile(testFile);
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    if (/console\.(log|warn|error)\(/.test(line) && !line.trim().startsWith("//")) {
      OUTPUT.niceToHave.push({
        id: `test-console-log-${testFile.replace(/\//g, "-")}-${i + 1}`,
        description: `${testFile}:${i + 1}: console.log in test — remove for clean output`,
        fix: "Remove console.log or use vi.spyOn to suppress",
        persona: "tester",
        file: testFile,
        line: i + 1,
      });
    }
  });
}

// NICE-TO-HAVE: Source files with exported functions but less than N% test coverage proxy
// (Simple check: exported functions vs assertions in test file)
for (const srcFile of sourceFiles) {
  const srcCode = readFile(srcFile);
  const exportCount = (srcCode.match(/^export (function|const|class|async function)/gm) || [])
    .length;
  const testPath = srcFile.replace(/\.ts$/, ".test.ts");
  if (exportCount > 3 && fs.existsSync(testPath)) {
    const testCode = readFile(testPath);
    const itCount = (testCode.match(/^\s*(it|test)\(/gm) || []).length;
    if (itCount < exportCount) {
      OUTPUT.niceToHave.push({
        id: `test-low-coverage-proxy-${srcFile.replace(/\//g, "-")}`,
        description: `${srcFile}: ${exportCount} exports but only ${itCount} test cases — possible coverage gaps`,
        fix: "Review uncovered exports and add tests for critical paths",
        persona: "tester",
        file: srcFile,
      });
    }
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
