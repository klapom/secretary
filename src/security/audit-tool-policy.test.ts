import { describe, expect, it } from "vitest";
import { pickSandboxToolPolicy } from "./audit-tool-policy.js";

describe("pickSandboxToolPolicy", () => {
  it("returns undefined when config is undefined", () => {
    expect(pickSandboxToolPolicy()).toBeUndefined();
  });

  it("returns undefined when no allow or deny specified", () => {
    expect(pickSandboxToolPolicy({})).toBeUndefined();
  });

  it("returns policy with allow array", () => {
    const result = pickSandboxToolPolicy({ allow: ["read", "write"] });
    expect(result).toEqual({ allow: ["read", "write"], deny: undefined });
  });

  it("returns policy with deny array", () => {
    const result = pickSandboxToolPolicy({ deny: ["exec"] });
    expect(result).toEqual({ allow: undefined, deny: ["exec"] });
  });

  it("unions allow and alsoAllow", () => {
    const result = pickSandboxToolPolicy({ allow: ["read"], alsoAllow: ["write"] });
    expect(result?.allow).toContain("read");
    expect(result?.allow).toContain("write");
  });

  it("adds wildcard when alsoAllow is set without allow", () => {
    const result = pickSandboxToolPolicy({ alsoAllow: ["custom-tool"] });
    expect(result?.allow).toContain("*");
    expect(result?.allow).toContain("custom-tool");
  });

  it("deduplicates entries in allow union", () => {
    const result = pickSandboxToolPolicy({ allow: ["read", "write"], alsoAllow: ["read"] });
    const readCount = result?.allow?.filter((e) => e === "read").length;
    expect(readCount).toBe(1);
  });

  it("returns undefined when allow is not an array and alsoAllow is empty array", () => {
    expect(pickSandboxToolPolicy({ alsoAllow: [] })).toBeUndefined();
  });

  it("returns policy with both allow and deny", () => {
    const result = pickSandboxToolPolicy({ allow: ["read"], deny: ["exec"] });
    expect(result).toEqual({ allow: ["read"], deny: ["exec"] });
  });
});
