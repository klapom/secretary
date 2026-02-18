import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  collectAttackSurfaceSummaryFindings,
  collectSyncedFolderFindings,
  collectSecretsInConfigFindings,
  collectHooksHardeningFindings,
  collectGatewayHttpSessionKeyOverrideFindings,
  collectSandboxDockerNoopFindings,
  collectSandboxDangerousConfigFindings,
  collectNodeDenyCommandPatternFindings,
  collectMinimalProfileOverrideFindings,
  collectModelHygieneFindings,
  collectExposureMatrixFindings,
} from "./audit-extra.sync.js";
import { safeEqualSecret } from "./secret-equal.js";

describe("collectAttackSurfaceSummaryFindings", () => {
  it("distinguishes external webhooks from internal hooks when only internal hooks are enabled", () => {
    const cfg: OpenClawConfig = {
      hooks: { internal: { enabled: true } },
    };

    const [finding] = collectAttackSurfaceSummaryFindings(cfg);
    expect(finding.checkId).toBe("summary.attack_surface");
    expect(finding.detail).toContain("hooks.webhooks: disabled");
    expect(finding.detail).toContain("hooks.internal: enabled");
  });

  it("reports both hook systems as enabled when both are configured", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, internal: { enabled: true } },
    };

    const [finding] = collectAttackSurfaceSummaryFindings(cfg);
    expect(finding.detail).toContain("hooks.webhooks: enabled");
    expect(finding.detail).toContain("hooks.internal: enabled");
  });

  it("reports both hook systems as disabled when neither is configured", () => {
    const cfg: OpenClawConfig = {};

    const [finding] = collectAttackSurfaceSummaryFindings(cfg);
    expect(finding.detail).toContain("hooks.webhooks: disabled");
    expect(finding.detail).toContain("hooks.internal: disabled");
  });
});

describe("safeEqualSecret", () => {
  it("matches identical secrets", () => {
    expect(safeEqualSecret("secret-token", "secret-token")).toBe(true);
  });

  it("rejects mismatched secrets", () => {
    expect(safeEqualSecret("secret-token", "secret-tokEn")).toBe(false);
  });

  it("rejects different-length secrets", () => {
    expect(safeEqualSecret("short", "much-longer")).toBe(false);
  });

  it("rejects missing values", () => {
    expect(safeEqualSecret(undefined, "secret")).toBe(false);
    expect(safeEqualSecret("secret", undefined)).toBe(false);
    expect(safeEqualSecret(null, "secret")).toBe(false);
  });
});

describe("collectSyncedFolderFindings", () => {
  it("warns when stateDir is in iCloud", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/Users/me/Library/Mobile Documents/iCloud~com.openclaw/state",
      configPath: "/Users/me/.config/openclaw.json",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warn");
    expect(findings[0].checkId).toBe("fs.synced_dir");
  });

  it("warns when configPath is in Dropbox", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/home/user/.openclaw",
      configPath: "/home/user/Dropbox/openclaw.json",
    });
    expect(findings).toHaveLength(1);
  });

  it("returns empty for local paths", () => {
    const findings = collectSyncedFolderFindings({
      stateDir: "/home/user/.openclaw",
      configPath: "/home/user/.config/openclaw.json",
    });
    expect(findings).toEqual([]);
  });
});

describe("collectSecretsInConfigFindings", () => {
  it("warns about gateway password in config", () => {
    const cfg: OpenClawConfig = {
      gateway: { auth: { password: "hunter2" } },
    };
    const findings = collectSecretsInConfigFindings(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("config.secrets.gateway_password_in_config");
  });

  it("skips env-ref passwords", () => {
    const cfg: OpenClawConfig = {
      gateway: { auth: { password: "${GATEWAY_PASSWORD}" } },
    };
    const findings = collectSecretsInConfigFindings(cfg);
    expect(findings).toEqual([]);
  });

  it("warns about hooks token in config", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, token: "my-token-123" },
    };
    const findings = collectSecretsInConfigFindings(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("config.secrets.hooks_token_in_config");
  });

  it("returns empty when no secrets in config", () => {
    const findings = collectSecretsInConfigFindings({});
    expect(findings).toEqual([]);
  });
});

describe("collectHooksHardeningFindings", () => {
  it("returns empty when hooks disabled", () => {
    const findings = collectHooksHardeningFindings({});
    expect(findings).toEqual([]);
  });

  it("warns about short token", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, token: "short" },
    };
    const findings = collectHooksHardeningFindings(cfg);
    const short = findings.find((f) => f.checkId === "hooks.token_too_short");
    expect(short).toBeDefined();
  });

  it("warns about missing defaultSessionKey", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true },
    };
    const findings = collectHooksHardeningFindings(cfg);
    const missing = findings.find((f) => f.checkId === "hooks.default_session_key_unset");
    expect(missing).toBeDefined();
  });

  it("warns about allowRequestSessionKey", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, allowRequestSessionKey: true },
    };
    const findings = collectHooksHardeningFindings(cfg);
    const enabled = findings.find((f) => f.checkId === "hooks.request_session_key_enabled");
    expect(enabled).toBeDefined();
  });

  it("warns about missing prefix restrictions", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, allowRequestSessionKey: true, allowedSessionKeyPrefixes: [] },
    };
    const findings = collectHooksHardeningFindings(cfg);
    const missing = findings.find(
      (f) => f.checkId === "hooks.request_session_key_prefixes_missing",
    );
    expect(missing).toBeDefined();
  });

  it("warns about root hooks path", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, path: "/" },
    };
    const findings = collectHooksHardeningFindings(cfg);
    const root = findings.find((f) => f.checkId === "hooks.path_root");
    expect(root).toBeDefined();
    expect(root!.severity).toBe("critical");
  });

  it("warns about token reuse with gateway token", () => {
    const cfg: OpenClawConfig = {
      hooks: { enabled: true, token: "same-token-for-both-services" },
      gateway: { auth: { mode: "token", token: "same-token-for-both-services" } },
    };
    const findings = collectHooksHardeningFindings(cfg);
    const reuse = findings.find((f) => f.checkId === "hooks.token_reuse_gateway_token");
    expect(reuse).toBeDefined();
  });
});

describe("collectGatewayHttpSessionKeyOverrideFindings", () => {
  it("returns empty when no endpoints enabled", () => {
    const findings = collectGatewayHttpSessionKeyOverrideFindings({});
    expect(findings).toEqual([]);
  });

  it("reports when chatCompletions enabled", () => {
    const cfg: OpenClawConfig = {
      gateway: { http: { endpoints: { chatCompletions: { enabled: true } } } },
    };
    const findings = collectGatewayHttpSessionKeyOverrideFindings(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("/v1/chat/completions");
  });

  it("reports when responses enabled", () => {
    const cfg: OpenClawConfig = {
      gateway: { http: { endpoints: { responses: { enabled: true } } } },
    };
    const findings = collectGatewayHttpSessionKeyOverrideFindings(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("/v1/responses");
  });
});

describe("collectSandboxDockerNoopFindings", () => {
  it("warns about docker config with sandbox off", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          sandbox: {
            mode: "off",
            docker: { image: "node:20" },
          },
        },
      },
    };
    const findings = collectSandboxDockerNoopFindings(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("sandbox.docker_config_mode_off");
  });

  it("returns empty when sandbox enabled", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          sandbox: {
            mode: "all",
            docker: { image: "node:20" },
          },
        },
      },
    };
    const findings = collectSandboxDockerNoopFindings(cfg);
    expect(findings).toEqual([]);
  });
});

describe("collectSandboxDangerousConfigFindings", () => {
  it("reports host network mode", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          sandbox: {
            docker: { network: "host" },
          },
        },
      },
    };
    const findings = collectSandboxDangerousConfigFindings(cfg);
    const net = findings.find((f) => f.checkId === "sandbox.dangerous_network_mode");
    expect(net).toBeDefined();
    expect(net!.severity).toBe("critical");
  });

  it("reports unconfined seccomp", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          sandbox: {
            docker: { seccompProfile: "unconfined" },
          },
        },
      },
    };
    const findings = collectSandboxDangerousConfigFindings(cfg);
    const seccomp = findings.find((f) => f.checkId === "sandbox.dangerous_seccomp_profile");
    expect(seccomp).toBeDefined();
  });

  it("reports unconfined apparmor", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          sandbox: {
            docker: { apparmorProfile: "unconfined" },
          },
        },
      },
    };
    const findings = collectSandboxDangerousConfigFindings(cfg);
    const apparmor = findings.find((f) => f.checkId === "sandbox.dangerous_apparmor_profile");
    expect(apparmor).toBeDefined();
  });

  it("returns empty for safe config", () => {
    const findings = collectSandboxDangerousConfigFindings({});
    expect(findings).toEqual([]);
  });
});

describe("collectExposureMatrixFindings", () => {
  it("returns empty when no open groups", () => {
    const findings = collectExposureMatrixFindings({});
    expect(findings).toEqual([]);
  });

  it("reports open groups with elevated tools", () => {
    const cfg: OpenClawConfig = {
      channels: { telegram: { groupPolicy: "open" } } as unknown as OpenClawConfig["channels"],
      tools: { elevated: { enabled: true } },
    };
    const findings = collectExposureMatrixFindings(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
  });
});

describe("collectModelHygieneFindings", () => {
  it("warns about legacy models", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: { model: { primary: "openai/gpt-3.5-turbo" } },
      },
    };
    const findings = collectModelHygieneFindings(cfg);
    const legacy = findings.find((f) => f.checkId === "models.legacy");
    expect(legacy).toBeDefined();
    expect(legacy!.severity).toBe("warn");
  });

  it("warns about weak tier models (haiku)", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: { model: { primary: "anthropic/claude-3-haiku-20240307" } },
      },
    };
    const findings = collectModelHygieneFindings(cfg);
    const weak = findings.find((f) => f.checkId === "models.weak_tier");
    expect(weak).toBeDefined();
  });

  it("returns empty for modern models", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: { model: { primary: "anthropic/claude-sonnet-4-5-20250514" } },
      },
    };
    const findings = collectModelHygieneFindings(cfg);
    expect(findings).toEqual([]);
  });

  it("returns empty when no models configured", () => {
    const findings = collectModelHygieneFindings({});
    expect(findings).toEqual([]);
  });
});

describe("collectMinimalProfileOverrideFindings", () => {
  it("returns empty when not minimal profile", () => {
    const findings = collectMinimalProfileOverrideFindings({});
    expect(findings).toEqual([]);
  });

  it("warns when agent overrides minimal profile", () => {
    const cfg: OpenClawConfig = {
      tools: { profile: "minimal" },
      agents: {
        list: [{ id: "helper", tools: { profile: "coding" } }],
      },
    };
    const findings = collectMinimalProfileOverrideFindings(cfg);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("tools.profile_minimal_overridden");
  });

  it("returns empty when all agents use minimal", () => {
    const cfg: OpenClawConfig = {
      tools: { profile: "minimal" },
      agents: {
        list: [{ id: "helper", tools: { profile: "minimal" } }],
      },
    };
    const findings = collectMinimalProfileOverrideFindings(cfg);
    expect(findings).toEqual([]);
  });
});

describe("collectNodeDenyCommandPatternFindings", () => {
  it("returns empty when no denyCommands", () => {
    const findings = collectNodeDenyCommandPatternFindings({});
    expect(findings).toEqual([]);
  });

  it("returns empty when denyCommands is empty array", () => {
    const cfg: OpenClawConfig = {
      gateway: { nodes: { denyCommands: [] } },
    };
    const findings = collectNodeDenyCommandPatternFindings(cfg);
    expect(findings).toEqual([]);
  });

  it("warns about pattern-like entries in denyCommands", () => {
    const cfg: OpenClawConfig = {
      gateway: { nodes: { denyCommands: ["rm*", "/delete.*"] } },
    };
    const findings = collectNodeDenyCommandPatternFindings(cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].checkId).toBe("gateway.nodes.deny_commands_ineffective");
  });

  it("warns about unknown exact command names", () => {
    const cfg: OpenClawConfig = {
      gateway: { nodes: { denyCommands: ["nonexistent_command_xyz"] } },
    };
    const findings = collectNodeDenyCommandPatternFindings(cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].detail).toContain("Unknown command names");
  });
});
