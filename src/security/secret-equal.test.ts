import { describe, expect, it } from "vitest";
import { safeEqualSecret } from "./secret-equal.js";

describe("safeEqualSecret", () => {
  it("returns true for matching strings", () => {
    expect(safeEqualSecret("abc123", "abc123")).toBe(true);
  });

  it("returns false for non-matching strings", () => {
    expect(safeEqualSecret("abc123", "xyz789")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(safeEqualSecret("short", "longer-string")).toBe(false);
  });

  it("returns false when provided is undefined", () => {
    expect(safeEqualSecret(undefined, "expected")).toBe(false);
  });

  it("returns false when expected is undefined", () => {
    expect(safeEqualSecret("provided", undefined)).toBe(false);
  });

  it("returns false when provided is null", () => {
    expect(safeEqualSecret(null, "expected")).toBe(false);
  });

  it("returns false when both are null", () => {
    expect(safeEqualSecret(null, null)).toBe(false);
  });

  it("returns false when both are undefined", () => {
    expect(safeEqualSecret(undefined, undefined)).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(safeEqualSecret("", "")).toBe(true);
  });
});
