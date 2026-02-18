import { describe, expect, it } from "vitest";
import { isPathInside, extensionUsesSkippedScannerPath } from "./scan-paths.js";

describe("isPathInside", () => {
  it("returns true when candidate is inside base", () => {
    expect(isPathInside("/home/user", "/home/user/file.txt")).toBe(true);
  });

  it("returns true when candidate equals base", () => {
    expect(isPathInside("/home/user", "/home/user")).toBe(true);
  });

  it("returns false when candidate is outside base", () => {
    expect(isPathInside("/home/user", "/home/other/file.txt")).toBe(false);
  });

  it("returns false for parent traversal", () => {
    expect(isPathInside("/home/user/docs", "/home/user")).toBe(false);
  });

  it("handles trailing slashes", () => {
    expect(isPathInside("/home/user/", "/home/user/sub")).toBe(true);
  });

  it("rejects path traversal with ..", () => {
    expect(isPathInside("/home/user", "/home/user/../other")).toBe(false);
  });
});

describe("extensionUsesSkippedScannerPath", () => {
  it("returns true for node_modules paths", () => {
    expect(extensionUsesSkippedScannerPath("extensions/foo/node_modules/bar")).toBe(true);
  });

  it("returns true for dotfile directories", () => {
    expect(extensionUsesSkippedScannerPath("extensions/.git/config")).toBe(true);
    expect(extensionUsesSkippedScannerPath("extensions/.env")).toBe(true);
  });

  it("returns false for normal paths", () => {
    expect(extensionUsesSkippedScannerPath("extensions/foo/src/index.ts")).toBe(false);
  });

  it("does not flag . or .. as dotfiles", () => {
    expect(extensionUsesSkippedScannerPath("./foo/bar")).toBe(false);
    expect(extensionUsesSkippedScannerPath("../foo/bar")).toBe(false);
  });

  it("handles backslash separators", () => {
    expect(extensionUsesSkippedScannerPath("extensions\\node_modules\\bar")).toBe(true);
  });
});
