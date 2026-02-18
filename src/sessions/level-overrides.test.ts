import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions/types.js";
import { parseVerboseOverride, applyVerboseOverride } from "./level-overrides.js";

describe("parseVerboseOverride", () => {
  it("returns undefined value for undefined input", () => {
    expect(parseVerboseOverride(undefined)).toEqual({ ok: true, value: undefined });
  });

  it("returns null value for null input", () => {
    expect(parseVerboseOverride(null)).toEqual({ ok: true, value: null });
  });

  it("parses valid levels", () => {
    expect(parseVerboseOverride("on")).toEqual({ ok: true, value: "on" });
    expect(parseVerboseOverride("off")).toEqual({ ok: true, value: "off" });
    expect(parseVerboseOverride("full")).toEqual({ ok: true, value: "full" });
  });

  it("returns error for invalid string", () => {
    const result = parseVerboseOverride("invalid");
    expect(result.ok).toBe(false);
  });

  it("returns error for non-string type", () => {
    const result = parseVerboseOverride(123);
    expect(result.ok).toBe(false);
  });
});

describe("applyVerboseOverride", () => {
  it("does nothing for undefined", () => {
    const entry = { sessionId: "s", updatedAt: 0 } as SessionEntry;
    applyVerboseOverride(entry, undefined);
    expect(entry.verboseLevel).toBeUndefined();
  });

  it("deletes verboseLevel for null", () => {
    const entry = { sessionId: "s", updatedAt: 0, verboseLevel: "on" } as SessionEntry;
    applyVerboseOverride(entry, null);
    expect(entry.verboseLevel).toBeUndefined();
  });

  it("sets verboseLevel for valid level", () => {
    const entry = { sessionId: "s", updatedAt: 0 } as SessionEntry;
    applyVerboseOverride(entry, "full");
    expect(entry.verboseLevel).toBe("full");
  });
});
