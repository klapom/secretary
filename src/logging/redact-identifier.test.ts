import { describe, expect, it } from "vitest";
import { sha256HexPrefix, redactIdentifier } from "./redact-identifier.js";

describe("sha256HexPrefix", () => {
  it("returns hex string of specified length", () => {
    const result = sha256HexPrefix("test", 8);
    expect(result).toHaveLength(8);
    expect(/^[0-9a-f]+$/.test(result)).toBe(true);
  });

  it("defaults to length 12", () => {
    expect(sha256HexPrefix("test")).toHaveLength(12);
  });

  it("clamps to min 1", () => {
    expect(sha256HexPrefix("test", 0)).toHaveLength(1);
    expect(sha256HexPrefix("test", -5)).toHaveLength(1);
  });

  it("handles non-finite length", () => {
    expect(sha256HexPrefix("test", NaN)).toHaveLength(12);
  });
});

describe("redactIdentifier", () => {
  it("returns dash for empty", () => {
    expect(redactIdentifier(undefined)).toBe("-");
    expect(redactIdentifier("")).toBe("-");
    expect(redactIdentifier("  ")).toBe("-");
  });

  it("returns sha256 prefix", () => {
    const result = redactIdentifier("user@example.com");
    expect(result).toMatch(/^sha256:[0-9a-f]{12}$/);
  });

  it("supports custom length", () => {
    const result = redactIdentifier("test", { len: 6 });
    expect(result).toMatch(/^sha256:[0-9a-f]{6}$/);
  });
});
