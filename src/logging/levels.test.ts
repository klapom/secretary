import { describe, expect, it } from "vitest";
import { normalizeLogLevel, levelToMinLevel } from "./levels.js";

describe("normalizeLogLevel", () => {
  it("returns valid level", () => {
    expect(normalizeLogLevel("debug")).toBe("debug");
    expect(normalizeLogLevel("error")).toBe("error");
  });

  it("falls back to info", () => {
    expect(normalizeLogLevel(undefined)).toBe("info");
    expect(normalizeLogLevel("invalid")).toBe("info");
  });

  it("uses custom fallback", () => {
    expect(normalizeLogLevel("bad", "warn")).toBe("warn");
  });

  it("trims whitespace", () => {
    expect(normalizeLogLevel("  debug  ")).toBe("debug");
  });
});

describe("levelToMinLevel", () => {
  it("maps levels to numbers", () => {
    expect(levelToMinLevel("fatal")).toBe(0);
    expect(levelToMinLevel("error")).toBe(1);
    expect(levelToMinLevel("warn")).toBe(2);
    expect(levelToMinLevel("info")).toBe(3);
    expect(levelToMinLevel("debug")).toBe(4);
    expect(levelToMinLevel("trace")).toBe(5);
    expect(levelToMinLevel("silent")).toBe(Number.POSITIVE_INFINITY);
  });
});
