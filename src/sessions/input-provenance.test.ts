import { describe, expect, it } from "vitest";
import {
  normalizeInputProvenance,
  applyInputProvenanceToUserMessage,
  isInterSessionInputProvenance,
  hasInterSessionUserProvenance,
} from "./input-provenance.js";

describe("normalizeInputProvenance", () => {
  it("returns undefined for falsy/non-object", () => {
    expect(normalizeInputProvenance(null)).toBeUndefined();
    expect(normalizeInputProvenance(undefined)).toBeUndefined();
    expect(normalizeInputProvenance("string")).toBeUndefined();
  });

  it("returns undefined for invalid kind", () => {
    expect(normalizeInputProvenance({ kind: "unknown" })).toBeUndefined();
    expect(normalizeInputProvenance({ kind: 123 })).toBeUndefined();
    expect(normalizeInputProvenance({})).toBeUndefined();
  });

  it("normalizes valid provenance", () => {
    expect(normalizeInputProvenance({ kind: "external_user" })).toEqual({
      kind: "external_user",
      sourceSessionKey: undefined,
      sourceChannel: undefined,
      sourceTool: undefined,
    });
  });

  it("includes optional string fields", () => {
    const result = normalizeInputProvenance({
      kind: "inter_session",
      sourceSessionKey: "  key1  ",
      sourceChannel: "discord",
      sourceTool: "  tool1  ",
    });
    expect(result).toEqual({
      kind: "inter_session",
      sourceSessionKey: "key1",
      sourceChannel: "discord",
      sourceTool: "tool1",
    });
  });

  it("ignores blank optional strings", () => {
    const result = normalizeInputProvenance({
      kind: "internal_system",
      sourceSessionKey: "  ",
      sourceChannel: "",
    });
    expect(result?.sourceSessionKey).toBeUndefined();
    expect(result?.sourceChannel).toBeUndefined();
  });

  it("ignores non-string optional fields", () => {
    const result = normalizeInputProvenance({
      kind: "external_user",
      sourceSessionKey: 123,
    });
    expect(result?.sourceSessionKey).toBeUndefined();
  });
});

describe("applyInputProvenanceToUserMessage", () => {
  it("returns message unchanged when no provenance", () => {
    const msg = { role: "user", content: "hi" } as never;
    expect(applyInputProvenanceToUserMessage(msg, undefined)).toBe(msg);
  });

  it("returns message unchanged for non-user role", () => {
    const msg = { role: "assistant", content: "hi" } as never;
    const prov = { kind: "external_user" as const };
    expect(applyInputProvenanceToUserMessage(msg, prov)).toBe(msg);
  });

  it("returns message unchanged if provenance already exists", () => {
    const msg = { role: "user", provenance: { kind: "internal_system" } } as never;
    const prov = { kind: "external_user" as const };
    expect(applyInputProvenanceToUserMessage(msg, prov)).toBe(msg);
  });

  it("applies provenance to user message", () => {
    const msg = { role: "user", content: "hi" } as never;
    const prov = { kind: "inter_session" as const, sourceChannel: "slack" };
    const result = applyInputProvenanceToUserMessage(msg, prov);
    expect(result).not.toBe(msg);
    expect((result as never).provenance).toBe(prov);
    expect((result as never).content).toBe("hi");
  });
});

describe("isInterSessionInputProvenance", () => {
  it("returns true for inter_session", () => {
    expect(isInterSessionInputProvenance({ kind: "inter_session" })).toBe(true);
  });

  it("returns false for other kinds", () => {
    expect(isInterSessionInputProvenance({ kind: "external_user" })).toBe(false);
    expect(isInterSessionInputProvenance(null)).toBe(false);
  });
});

describe("hasInterSessionUserProvenance", () => {
  it("returns true for user message with inter_session provenance", () => {
    expect(
      hasInterSessionUserProvenance({ role: "user", provenance: { kind: "inter_session" } }),
    ).toBe(true);
  });

  it("returns false for non-user role", () => {
    expect(
      hasInterSessionUserProvenance({ role: "assistant", provenance: { kind: "inter_session" } }),
    ).toBe(false);
  });

  it("returns false for undefined message", () => {
    expect(hasInterSessionUserProvenance(undefined)).toBe(false);
  });

  it("returns false for non-inter_session provenance", () => {
    expect(
      hasInterSessionUserProvenance({ role: "user", provenance: { kind: "external_user" } }),
    ).toBe(false);
  });
});
