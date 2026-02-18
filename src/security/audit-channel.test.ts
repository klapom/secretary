import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { collectChannelSecurityFindings } from "./audit-channel.js";

vi.mock("../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: vi.fn(async () => []),
}));

vi.mock("../cli/command-format.js", () => ({
  formatCliCommand: (cmd: string) => cmd,
}));

vi.mock("../config/commands.js", () => ({
  resolveNativeCommandsEnabled: vi.fn(() => false),
  resolveNativeSkillsEnabled: vi.fn(() => false),
}));

vi.mock("../channels/plugins/helpers.js", () => ({
  resolveChannelDefaultAccountId: () => "default",
}));

const { readChannelAllowFromStore } = await import("../pairing/pairing-store.js");
const { resolveNativeCommandsEnabled } = await import("../config/commands.js");

type PluginSecurity = {
  resolveDmPolicy?: (params: unknown) => {
    policy: string;
    allowFrom?: Array<string | number> | null;
    policyPath?: string;
    allowFromPath: string;
    normalizeEntry?: (raw: string) => string;
  } | null;
  collectWarnings?: (params: unknown) => Promise<string[] | undefined>;
};

function makePlugin(overrides: {
  id: string;
  security?: PluginSecurity | null;
  config?: Record<string, unknown>;
}) {
  return {
    id: overrides.id,
    meta: { label: overrides.id.charAt(0).toUpperCase() + overrides.id.slice(1) },
    security: overrides.security ?? null,
    config: {
      listAccountIds: () => ["default"],
      resolveAccount: () => overrides.config ?? {},
      isEnabled: () => true,
      isConfigured: async () => true,
    },
  };
}

const baseCfg: OpenClawConfig = {};

describe("collectChannelSecurityFindings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readChannelAllowFromStore).mockResolvedValue([]);
  });

  it("returns empty for no plugins", async () => {
    const findings = await collectChannelSecurityFindings({ cfg: baseCfg, plugins: [] });
    expect(findings).toEqual([]);
  });

  it("skips plugin without security", async () => {
    const plugin = makePlugin({ id: "test", security: null });
    const findings = await collectChannelSecurityFindings({ cfg: baseCfg, plugins: [plugin] });
    expect(findings).toEqual([]);
  });

  it("reports open DM policy as critical", async () => {
    const plugin = makePlugin({
      id: "telegram",
      security: {
        resolveDmPolicy: () => ({
          policy: "open",
          allowFrom: null,
          allowFromPath: "channels.telegram.dm.",
        }),
      },
    });
    const findings = await collectChannelSecurityFindings({ cfg: baseCfg, plugins: [plugin] });
    const open = findings.find((f) => f.checkId === "channels.telegram.dm.open");
    expect(open).toBeDefined();
    expect(open!.severity).toBe("critical");
    // Also check inconsistency warning (no wildcard)
    const inconsistent = findings.find((f) => f.checkId === "channels.telegram.dm.open_invalid");
    expect(inconsistent).toBeDefined();
  });

  it("open DM policy with wildcard does not produce inconsistency warning", async () => {
    const plugin = makePlugin({
      id: "telegram",
      security: {
        resolveDmPolicy: () => ({
          policy: "open",
          allowFrom: ["*"],
          allowFromPath: "channels.telegram.dm.",
        }),
      },
    });
    const findings = await collectChannelSecurityFindings({ cfg: baseCfg, plugins: [plugin] });
    const inconsistent = findings.find((f) => f.checkId === "channels.telegram.dm.open_invalid");
    expect(inconsistent).toBeUndefined();
  });

  it("reports disabled DM policy as info", async () => {
    const plugin = makePlugin({
      id: "slack",
      security: {
        resolveDmPolicy: () => ({
          policy: "disabled",
          allowFrom: null,
          allowFromPath: "channels.slack.dm.",
        }),
      },
    });
    const findings = await collectChannelSecurityFindings({ cfg: baseCfg, plugins: [plugin] });
    const disabled = findings.find((f) => f.checkId === "channels.slack.dm.disabled");
    expect(disabled).toBeDefined();
    expect(disabled!.severity).toBe("info");
  });

  it("warns when dmScope=main with multiple DM senders", async () => {
    vi.mocked(readChannelAllowFromStore).mockResolvedValue(["user1", "user2"]);
    const plugin = makePlugin({
      id: "signal",
      security: {
        resolveDmPolicy: () => ({
          policy: "allowlist",
          allowFrom: ["user1", "user2"],
          allowFromPath: "channels.signal.dm.",
        }),
      },
    });
    const cfg = { ...baseCfg, session: { dmScope: "main" as const } };
    const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
    const multiUser = findings.find((f) => f.checkId === "channels.signal.dm.scope_main_multiuser");
    expect(multiUser).toBeDefined();
    expect(multiUser!.severity).toBe("warn");
  });

  it("classifies security warnings from plugin", async () => {
    const plugin = makePlugin({
      id: "custom",
      security: {
        collectWarnings: async () => [
          "DMs: open for all",
          "locked and secured",
          "some normal warning",
          "",
        ],
      },
    });
    const findings = await collectChannelSecurityFindings({ cfg: baseCfg, plugins: [plugin] });
    expect(findings).toHaveLength(3); // empty string skipped
    const severities = findings.map((f) => f.severity);
    expect(severities).toContain("critical");
    expect(severities).toContain("info");
    expect(severities).toContain("warn");
  });

  it("skips disabled plugin", async () => {
    const plugin = {
      id: "disabled-plugin",
      meta: { label: "Disabled" },
      security: {
        resolveDmPolicy: () => ({
          policy: "open",
          allowFrom: null,
          allowFromPath: "channels.disabled.",
        }),
      },
      config: {
        listAccountIds: () => ["default"],
        resolveAccount: () => ({}),
        isEnabled: () => false,
        isConfigured: async () => true,
      },
    };
    const findings = await collectChannelSecurityFindings({ cfg: baseCfg, plugins: [plugin] });
    expect(findings).toEqual([]);
  });

  it("skips unconfigured plugin", async () => {
    const plugin = {
      id: "unconfigured",
      meta: { label: "Unconfigured" },
      security: {
        resolveDmPolicy: () => ({
          policy: "open",
          allowFrom: null,
          allowFromPath: "channels.unconfigured.",
        }),
      },
      config: {
        listAccountIds: () => ["default"],
        resolveAccount: () => ({}),
        isEnabled: () => true,
        isConfigured: async () => false,
      },
    };
    const findings = await collectChannelSecurityFindings({ cfg: baseCfg, plugins: [plugin] });
    expect(findings).toEqual([]);
  });

  describe("discord slash commands", () => {
    it("reports unrestricted slash commands when useAccessGroups=false", async () => {
      vi.mocked(resolveNativeCommandsEnabled).mockReturnValue(true);
      const plugin = makePlugin({
        id: "discord",
        security: {},
        config: {
          config: {
            commands: { native: true },
            guilds: { "123": {} },
          },
        },
      });
      const cfg = { ...baseCfg, commands: { useAccessGroups: false } };
      const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
      const unrestricted = findings.find(
        (f) => f.checkId === "channels.discord.commands.native.unrestricted",
      );
      expect(unrestricted).toBeDefined();
      expect(unrestricted!.severity).toBe("critical");
    });

    it("reports no allowlists when useAccessGroups=true but no allowlists configured", async () => {
      vi.mocked(resolveNativeCommandsEnabled).mockReturnValue(true);
      const plugin = makePlugin({
        id: "discord",
        security: {},
        config: {
          config: {
            commands: { native: true },
            guilds: { "123": {} },
          },
        },
      });
      const cfg = { ...baseCfg, commands: { useAccessGroups: true } };
      const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
      const noAllowlists = findings.find(
        (f) => f.checkId === "channels.discord.commands.native.no_allowlists",
      );
      expect(noAllowlists).toBeDefined();
      expect(noAllowlists!.severity).toBe("warn");
    });
  });

  describe("slack slash commands", () => {
    it("reports bypass when useAccessGroups=false", async () => {
      vi.mocked(resolveNativeCommandsEnabled).mockReturnValue(true);
      const plugin = makePlugin({
        id: "slack",
        security: {},
        config: {
          config: {
            commands: { native: true },
          },
        },
      });
      const cfg = { ...baseCfg, commands: { useAccessGroups: false } };
      const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
      const bypass = findings.find(
        (f) => f.checkId === "channels.slack.commands.slash.useAccessGroups_off",
      );
      expect(bypass).toBeDefined();
      expect(bypass!.severity).toBe("critical");
    });

    it("reports no allowlists when useAccessGroups=true but no allowlists", async () => {
      vi.mocked(resolveNativeCommandsEnabled).mockReturnValue(true);
      const plugin = makePlugin({
        id: "slack",
        security: {},
        config: {
          config: {
            commands: { native: true },
          },
        },
      });
      const cfg = { ...baseCfg, commands: { useAccessGroups: true } };
      const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
      const noAllowlists = findings.find(
        (f) => f.checkId === "channels.slack.commands.slash.no_allowlists",
      );
      expect(noAllowlists).toBeDefined();
      expect(noAllowlists!.severity).toBe("warn");
    });
  });

  describe("telegram group commands", () => {
    it("reports missing sender allowlist", async () => {
      const plugin = makePlugin({
        id: "telegram",
        security: {},
        config: {
          config: {
            groupPolicy: "open",
            groups: { "123": {} },
          },
        },
      });
      const cfg = {
        ...baseCfg,
        commands: { text: true },
        channels: { defaults: { groupPolicy: "open" } },
      } as unknown as OpenClawConfig;
      const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
      const missing = findings.find(
        (f) => f.checkId === "channels.telegram.groups.allowFrom.missing",
      );
      expect(missing).toBeDefined();
      expect(missing!.severity).toBe("critical");
    });

    it("reports wildcard in group allowlist", async () => {
      vi.mocked(readChannelAllowFromStore).mockResolvedValue(["*"]);
      const plugin = makePlugin({
        id: "telegram",
        security: {},
        config: {
          config: {
            groupPolicy: "open",
            groups: { "123": {} },
          },
        },
      });
      const cfg = {
        ...baseCfg,
        commands: { text: true },
        channels: { defaults: { groupPolicy: "open" } },
      } as unknown as OpenClawConfig;
      const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
      const wildcard = findings.find(
        (f) => f.checkId === "channels.telegram.groups.allowFrom.wildcard",
      );
      expect(wildcard).toBeDefined();
      expect(wildcard!.severity).toBe("critical");
    });

    it("reports non-numeric allowFrom entries", async () => {
      vi.mocked(readChannelAllowFromStore).mockResolvedValue(["@username"]);
      const plugin = makePlugin({
        id: "telegram",
        security: {},
        config: {
          config: {
            groupPolicy: "open",
            groups: { "123": {} },
            groupAllowFrom: ["@another"],
          },
        },
      });
      const cfg = {
        ...baseCfg,
        commands: { text: true },
        channels: { defaults: { groupPolicy: "open" } },
      } as unknown as OpenClawConfig;
      const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
      const invalid = findings.find(
        (f) => f.checkId === "channels.telegram.allowFrom.invalid_entries",
      );
      expect(invalid).toBeDefined();
      expect(invalid!.severity).toBe("warn");
    });

    it("skips when text commands disabled", async () => {
      const plugin = makePlugin({
        id: "telegram",
        security: {},
        config: {
          config: {
            groupPolicy: "open",
            groups: { "123": {} },
          },
        },
      });
      const cfg = {
        ...baseCfg,
        commands: { text: false },
        channels: { defaults: { groupPolicy: "open" } },
      } as unknown as OpenClawConfig;
      const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
      const telegramFindings = findings.filter((f) => f.checkId.includes("telegram.groups"));
      expect(telegramFindings).toHaveLength(0);
    });

    it("checks per-group allowFrom overrides", async () => {
      const plugin = makePlugin({
        id: "telegram",
        security: {},
        config: {
          config: {
            groupPolicy: "open",
            groups: {
              "123": { allowFrom: ["12345"] },
            },
          },
        },
      });
      const cfg = {
        ...baseCfg,
        commands: { text: true },
        channels: { defaults: { groupPolicy: "open" } },
      } as unknown as OpenClawConfig;
      const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
      // Should not report missing allowlist since per-group override exists
      const missing = findings.find(
        (f) => f.checkId === "channels.telegram.groups.allowFrom.missing",
      );
      expect(missing).toBeUndefined();
    });

    it("checks per-group topic allowFrom overrides", async () => {
      const plugin = makePlugin({
        id: "telegram",
        security: {},
        config: {
          config: {
            groupPolicy: "open",
            groups: {
              "123": {
                topics: {
                  "1": { allowFrom: ["12345"] },
                },
              },
            },
          },
        },
      });
      const cfg = {
        ...baseCfg,
        commands: { text: true },
        channels: { defaults: { groupPolicy: "open" } },
      } as unknown as OpenClawConfig;
      const findings = await collectChannelSecurityFindings({ cfg, plugins: [plugin] });
      const missing = findings.find(
        (f) => f.checkId === "channels.telegram.groups.allowFrom.missing",
      );
      expect(missing).toBeUndefined();
    });
  });
});
