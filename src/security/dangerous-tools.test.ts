import { describe, expect, it } from "vitest";
import {
  DEFAULT_GATEWAY_HTTP_TOOL_DENY,
  DANGEROUS_ACP_TOOL_NAMES,
  DANGEROUS_ACP_TOOLS,
} from "./dangerous-tools.js";

describe("DEFAULT_GATEWAY_HTTP_TOOL_DENY", () => {
  it("contains expected high-risk tools", () => {
    expect(DEFAULT_GATEWAY_HTTP_TOOL_DENY).toContain("sessions_spawn");
    expect(DEFAULT_GATEWAY_HTTP_TOOL_DENY).toContain("sessions_send");
    expect(DEFAULT_GATEWAY_HTTP_TOOL_DENY).toContain("gateway");
    expect(DEFAULT_GATEWAY_HTTP_TOOL_DENY).toContain("whatsapp_login");
  });

  it("is a readonly tuple", () => {
    expect(Array.isArray(DEFAULT_GATEWAY_HTTP_TOOL_DENY)).toBe(true);
    expect(DEFAULT_GATEWAY_HTTP_TOOL_DENY.length).toBeGreaterThanOrEqual(4);
  });
});

describe("DANGEROUS_ACP_TOOLS", () => {
  it("is a Set with all DANGEROUS_ACP_TOOL_NAMES", () => {
    for (const name of DANGEROUS_ACP_TOOL_NAMES) {
      expect(DANGEROUS_ACP_TOOLS.has(name)).toBe(true);
    }
  });

  it("includes exec, spawn, shell, fs_write, apply_patch", () => {
    expect(DANGEROUS_ACP_TOOLS.has("exec")).toBe(true);
    expect(DANGEROUS_ACP_TOOLS.has("spawn")).toBe(true);
    expect(DANGEROUS_ACP_TOOLS.has("shell")).toBe(true);
    expect(DANGEROUS_ACP_TOOLS.has("fs_write")).toBe(true);
    expect(DANGEROUS_ACP_TOOLS.has("apply_patch")).toBe(true);
  });

  it("does not contain non-dangerous tools", () => {
    expect(DANGEROUS_ACP_TOOLS.has("read")).toBe(false);
    expect(DANGEROUS_ACP_TOOLS.has("search")).toBe(false);
  });
});
