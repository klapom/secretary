import { describe, expect, it } from "vitest";
import type { SessionEntry } from "../config/sessions/types.js";
import { applyModelOverrideToSessionEntry } from "./model-overrides.js";

describe("applyModelOverrideToSessionEntry", () => {
  it("sets provider and model override", () => {
    const entry = { sessionId: "s", updatedAt: 0 } as SessionEntry;
    const result = applyModelOverrideToSessionEntry({
      entry,
      selection: { provider: "openai", model: "gpt-4" },
    });
    expect(result.updated).toBe(true);
    expect(entry.providerOverride).toBe("openai");
    expect(entry.modelOverride).toBe("gpt-4");
    expect(entry.updatedAt).toBeGreaterThan(0);
  });

  it("returns updated=false when values unchanged", () => {
    const entry = {
      sessionId: "s",
      updatedAt: 0,
      providerOverride: "openai",
      modelOverride: "gpt-4",
    } as SessionEntry;
    const result = applyModelOverrideToSessionEntry({
      entry,
      selection: { provider: "openai", model: "gpt-4" },
    });
    expect(result.updated).toBe(false);
  });

  it("clears overrides when isDefault", () => {
    const entry = {
      sessionId: "s",
      updatedAt: 0,
      providerOverride: "openai",
      modelOverride: "gpt-4",
    } as SessionEntry;
    const result = applyModelOverrideToSessionEntry({
      entry,
      selection: { provider: "openai", model: "gpt-4", isDefault: true },
    });
    expect(result.updated).toBe(true);
    expect(entry.providerOverride).toBeUndefined();
    expect(entry.modelOverride).toBeUndefined();
  });

  it("isDefault no-op when no overrides exist", () => {
    const entry = { sessionId: "s", updatedAt: 0 } as SessionEntry;
    const result = applyModelOverrideToSessionEntry({
      entry,
      selection: { provider: "x", model: "y", isDefault: true },
    });
    expect(result.updated).toBe(false);
  });

  it("sets profileOverride when provided", () => {
    const entry = { sessionId: "s", updatedAt: 0 } as SessionEntry;
    applyModelOverrideToSessionEntry({
      entry,
      selection: { provider: "a", model: "b" },
      profileOverride: "profile1",
    });
    expect(entry.authProfileOverride).toBe("profile1");
    expect(entry.authProfileOverrideSource).toBe("user");
  });

  it("sets profileOverrideSource to auto when specified", () => {
    const entry = { sessionId: "s", updatedAt: 0 } as SessionEntry;
    applyModelOverrideToSessionEntry({
      entry,
      selection: { provider: "a", model: "b" },
      profileOverride: "p",
      profileOverrideSource: "auto",
    });
    expect(entry.authProfileOverrideSource).toBe("auto");
  });

  it("clears profileOverride when not provided", () => {
    const entry = {
      sessionId: "s",
      updatedAt: 0,
      authProfileOverride: "old",
      authProfileOverrideSource: "user",
      authProfileOverrideCompactionCount: 5,
    } as SessionEntry;
    applyModelOverrideToSessionEntry({
      entry,
      selection: { provider: "a", model: "b" },
    });
    expect(entry.authProfileOverride).toBeUndefined();
    expect(entry.authProfileOverrideSource).toBeUndefined();
    expect(entry.authProfileOverrideCompactionCount).toBeUndefined();
  });

  it("clears compaction count when profileOverride is set", () => {
    const entry = {
      sessionId: "s",
      updatedAt: 0,
      authProfileOverrideCompactionCount: 3,
    } as SessionEntry;
    applyModelOverrideToSessionEntry({
      entry,
      selection: { provider: "a", model: "b" },
      profileOverride: "newProfile",
    });
    expect(entry.authProfileOverrideCompactionCount).toBeUndefined();
  });
});
