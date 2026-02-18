import { describe, expect, it } from "vitest";
import { redactSensitiveText, redactToolDetail, getDefaultRedactPatterns } from "./redact.js";

describe("redactToolDetail", () => {
  it("redacts sensitive text in tool detail", () => {
    const result = redactToolDetail("OPENAI_API_KEY=sk-1234567890abcdef");
    // Mode defaults to "tools", so should redact
    expect(result).toContain("…");
  });
});

describe("redactSensitiveText edge cases", () => {
  it("returns empty string as-is", () => {
    expect(redactSensitiveText("")).toBe("");
  });

  it("returns text when no patterns match", () => {
    expect(redactSensitiveText("hello world", { mode: "tools", patterns: [] })).toBe("hello world");
  });

  it("handles invalid regex patterns gracefully", () => {
    const result = redactSensitiveText("test", { mode: "tools", patterns: ["[invalid"] });
    expect(result).toBe("test");
  });

  it("handles custom pattern with /regex/ syntax", () => {
    const result = redactSensitiveText("key=abcdefghijklmnopqrstu", {
      mode: "tools",
      patterns: ["/key=([a-z]+)/g"],
    });
    expect(result).toContain("…");
  });

  it("masks ghp_ GitHub tokens", () => {
    const defaults = getDefaultRedactPatterns();
    const result = redactSensitiveText("ghp_abcdefghijklmnopqrstuvwx", {
      mode: "tools",
      patterns: defaults,
    });
    expect(result).toContain("…");
  });

  it("masks github_pat_ tokens", () => {
    const defaults = getDefaultRedactPatterns();
    const result = redactSensitiveText("github_pat_abcdefghijklmnopqrstuvwx", {
      mode: "tools",
      patterns: defaults,
    });
    expect(result).toContain("…");
  });

  it("masks xoxb Slack tokens", () => {
    const defaults = getDefaultRedactPatterns();
    const result = redactSensitiveText("xoxb-abc123def456-ghijk", {
      mode: "tools",
      patterns: defaults,
    });
    expect(result).toContain("…");
  });

  it("masks gsk_ Groq tokens", () => {
    const defaults = getDefaultRedactPatterns();
    const result = redactSensitiveText("gsk_abcdefghijklmnopqrst", {
      mode: "tools",
      patterns: defaults,
    });
    expect(result).toContain("…");
  });

  it("masks AIza Google API keys", () => {
    const defaults = getDefaultRedactPatterns();
    const result = redactSensitiveText("AIzaSyB1234567890abcdefghijk", {
      mode: "tools",
      patterns: defaults,
    });
    expect(result).toContain("…");
  });

  it("masks pplx- tokens", () => {
    const defaults = getDefaultRedactPatterns();
    const result = redactSensitiveText("pplx-abcdefghijklmnopqrst", {
      mode: "tools",
      patterns: defaults,
    });
    expect(result).toContain("…");
  });

  it("masks npm_ tokens", () => {
    const defaults = getDefaultRedactPatterns();
    const result = redactSensitiveText("npm_abcdefghijklmnopqrst", {
      mode: "tools",
      patterns: defaults,
    });
    expect(result).toContain("…");
  });

  it("masks PEM private key with single content line", () => {
    const input = "-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----";
    const result = redactSensitiveText(input, {
      mode: "tools",
      patterns: getDefaultRedactPatterns(),
    });
    expect(result).toContain("…redacted…");
  });
});
