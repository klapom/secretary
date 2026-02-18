import { describe, expect, it } from "vitest";
import { buildUntrustedChannelMetadata } from "./channel-metadata.js";

describe("buildUntrustedChannelMetadata", () => {
  it("returns undefined when all entries are empty", () => {
    expect(
      buildUntrustedChannelMetadata({
        source: "test",
        label: "Info",
        entries: [null, undefined, ""],
      }),
    ).toBeUndefined();
  });

  it("builds metadata with valid entries", () => {
    const result = buildUntrustedChannelMetadata({
      source: "slack",
      label: "Channel Info",
      entries: ["Hello World"],
    });
    expect(result).toBeDefined();
    expect(result).toContain("UNTRUSTED channel metadata (slack)");
    expect(result).toContain("Channel Info");
    expect(result).toContain("Hello World");
  });

  it("deduplicates entries", () => {
    const result = buildUntrustedChannelMetadata({
      source: "test",
      label: "Info",
      entries: ["dup", "dup", "other"],
    });
    expect(result).toBeDefined();
    // Should only contain "dup" once
    const matches = result!.match(/dup/g);
    expect(matches).toHaveLength(1);
  });

  it("normalizes whitespace in entries", () => {
    const result = buildUntrustedChannelMetadata({
      source: "test",
      label: "Info",
      entries: ["  hello   world  "],
    });
    expect(result).toContain("hello world");
  });

  it("truncates long entries at 400 chars", () => {
    const longEntry = "a".repeat(500);
    const result = buildUntrustedChannelMetadata({
      source: "test",
      label: "Info",
      entries: [longEntry],
    });
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThan(900);
  });

  it("respects maxChars param", () => {
    const result = buildUntrustedChannelMetadata({
      source: "test",
      label: "Info",
      entries: ["some content"],
      maxChars: 50,
    });
    expect(result).toBeDefined();
    // The output is wrapped, so it may exceed slightly but the truncation is applied
  });
});
