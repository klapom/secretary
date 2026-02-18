import { describe, expect, it } from "vitest";
import { parseSessionLabel, SESSION_LABEL_MAX_LENGTH } from "./session-label.js";

describe("parseSessionLabel", () => {
  it("rejects non-string input", () => {
    expect(parseSessionLabel(123)).toEqual({ ok: false, error: "invalid label: must be a string" });
    expect(parseSessionLabel(null)).toEqual({
      ok: false,
      error: "invalid label: must be a string",
    });
  });

  it("rejects empty string", () => {
    expect(parseSessionLabel("")).toEqual({ ok: false, error: "invalid label: empty" });
    expect(parseSessionLabel("   ")).toEqual({ ok: false, error: "invalid label: empty" });
  });

  it("rejects too-long labels", () => {
    const long = "a".repeat(SESSION_LABEL_MAX_LENGTH + 1);
    const result = parseSessionLabel(long);
    expect(result.ok).toBe(false);
  });

  it("accepts valid labels and trims", () => {
    expect(parseSessionLabel("  hello  ")).toEqual({ ok: true, label: "hello" });
  });

  it("accepts max-length label", () => {
    const exact = "a".repeat(SESSION_LABEL_MAX_LENGTH);
    expect(parseSessionLabel(exact)).toEqual({ ok: true, label: exact });
  });
});
