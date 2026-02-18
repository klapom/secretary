import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixSecurityFootguns } from "./fix.js";

const isWindows = process.platform === "win32";

const expectPerms = (actual: number, expected: number) => {
  if (isWindows) {
    expect([expected, 0o666, 0o777]).toContain(actual);
    return;
  }
  expect(actual).toBe(expected);
};

describe("security fix", () => {
  let fixtureRoot = "";
  let fixtureCount = 0;

  const createStateDir = async (prefix: string) => {
    const dir = path.join(fixtureRoot, `${prefix}-${fixtureCount++}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  };

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-security-fix-suite-"));
  });

  afterAll(async () => {
    if (fixtureRoot) {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("tightens groupPolicy + filesystem perms", async () => {
    const stateDir = await createStateDir("tightens");
    await fs.chmod(stateDir, 0o755);

    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(
      configPath,
      `${JSON.stringify(
        {
          channels: {
            telegram: { groupPolicy: "open" },
            whatsapp: { groupPolicy: "open" },
            discord: { groupPolicy: "open" },
            signal: { groupPolicy: "open" },
            imessage: { groupPolicy: "open" },
          },
          logging: { redactSensitive: "off" },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );
    await fs.chmod(configPath, 0o644);

    const credsDir = path.join(stateDir, "credentials");
    await fs.mkdir(credsDir, { recursive: true });
    await fs.writeFile(
      path.join(credsDir, "whatsapp-allowFrom.json"),
      `${JSON.stringify({ version: 1, allowFrom: [" +15551234567 "] }, null, 2)}\n`,
      "utf-8",
    );

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    expect(res.ok).toBe(true);
    expect(res.configWritten).toBe(true);
    expect(res.changes).toEqual(
      expect.arrayContaining([
        "channels.telegram.groupPolicy=open -> allowlist",
        "channels.whatsapp.groupPolicy=open -> allowlist",
        "channels.discord.groupPolicy=open -> allowlist",
        "channels.signal.groupPolicy=open -> allowlist",
        "channels.imessage.groupPolicy=open -> allowlist",
        'logging.redactSensitive=off -> "tools"',
      ]),
    );

    const stateMode = (await fs.stat(stateDir)).mode & 0o777;
    expectPerms(stateMode, 0o700);

    const configMode = (await fs.stat(configPath)).mode & 0o777;
    expectPerms(configMode, 0o600);

    const parsed = JSON.parse(await fs.readFile(configPath, "utf-8")) as Record<string, unknown>;
    const channels = parsed.channels as Record<string, Record<string, unknown>>;
    expect(channels.telegram.groupPolicy).toBe("allowlist");
    expect(channels.whatsapp.groupPolicy).toBe("allowlist");
    expect(channels.discord.groupPolicy).toBe("allowlist");
    expect(channels.signal.groupPolicy).toBe("allowlist");
    expect(channels.imessage.groupPolicy).toBe("allowlist");

    expect(channels.whatsapp.groupAllowFrom).toEqual(["+15551234567"]);
  });

  it("applies allowlist per-account and seeds WhatsApp groupAllowFrom from store", async () => {
    const stateDir = await createStateDir("per-account");

    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(
      configPath,
      `${JSON.stringify(
        {
          channels: {
            whatsapp: {
              accounts: {
                a1: { groupPolicy: "open" },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const credsDir = path.join(stateDir, "credentials");
    await fs.mkdir(credsDir, { recursive: true });
    await fs.writeFile(
      path.join(credsDir, "whatsapp-allowFrom.json"),
      `${JSON.stringify({ version: 1, allowFrom: ["+15550001111"] }, null, 2)}\n`,
      "utf-8",
    );

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    expect(res.ok).toBe(true);

    const parsed = JSON.parse(await fs.readFile(configPath, "utf-8")) as Record<string, unknown>;
    const channels = parsed.channels as Record<string, Record<string, unknown>>;
    const whatsapp = channels.whatsapp;
    const accounts = whatsapp.accounts as Record<string, Record<string, unknown>>;

    expect(accounts.a1.groupPolicy).toBe("allowlist");
    expect(accounts.a1.groupAllowFrom).toEqual(["+15550001111"]);
  });

  it("does not seed WhatsApp groupAllowFrom if allowFrom is set", async () => {
    const stateDir = await createStateDir("no-seed");

    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(
      configPath,
      `${JSON.stringify(
        {
          channels: {
            whatsapp: { groupPolicy: "open", allowFrom: ["+15552223333"] },
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const credsDir = path.join(stateDir, "credentials");
    await fs.mkdir(credsDir, { recursive: true });
    await fs.writeFile(
      path.join(credsDir, "whatsapp-allowFrom.json"),
      `${JSON.stringify({ version: 1, allowFrom: ["+15550001111"] }, null, 2)}\n`,
      "utf-8",
    );

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    expect(res.ok).toBe(true);

    const parsed = JSON.parse(await fs.readFile(configPath, "utf-8")) as Record<string, unknown>;
    const channels = parsed.channels as Record<string, Record<string, unknown>>;
    expect(channels.whatsapp.groupPolicy).toBe("allowlist");
    expect(channels.whatsapp.groupAllowFrom).toBeUndefined();
  });

  it("returns ok=false for invalid config but still tightens perms", async () => {
    const stateDir = await createStateDir("invalid-config");
    await fs.chmod(stateDir, 0o755);

    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(configPath, "{ this is not json }\n", "utf-8");
    await fs.chmod(configPath, 0o644);

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    expect(res.ok).toBe(false);

    const stateMode = (await fs.stat(stateDir)).mode & 0o777;
    expectPerms(stateMode, 0o700);

    const configMode = (await fs.stat(configPath)).mode & 0o777;
    expectPerms(configMode, 0o600);
  });

  it("tightens perms for credentials + agent auth/sessions + include files", async () => {
    const stateDir = await createStateDir("includes");

    const includesDir = path.join(stateDir, "includes");
    await fs.mkdir(includesDir, { recursive: true });
    const includePath = path.join(includesDir, "extra.json5");
    await fs.writeFile(includePath, "{ logging: { redactSensitive: 'off' } }\n", "utf-8");
    await fs.chmod(includePath, 0o644);

    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(
      configPath,
      `{ "$include": "./includes/extra.json5", channels: { whatsapp: { groupPolicy: "open" } } }\n`,
      "utf-8",
    );
    await fs.chmod(configPath, 0o644);

    const credsDir = path.join(stateDir, "credentials");
    await fs.mkdir(credsDir, { recursive: true });
    const allowFromPath = path.join(credsDir, "whatsapp-allowFrom.json");
    await fs.writeFile(
      allowFromPath,
      `${JSON.stringify({ version: 1, allowFrom: ["+15550002222"] }, null, 2)}\n`,
      "utf-8",
    );
    await fs.chmod(allowFromPath, 0o644);

    const agentDir = path.join(stateDir, "agents", "main", "agent");
    await fs.mkdir(agentDir, { recursive: true });
    const authProfilesPath = path.join(agentDir, "auth-profiles.json");
    await fs.writeFile(authProfilesPath, "{}\n", "utf-8");
    await fs.chmod(authProfilesPath, 0o644);

    const sessionsDir = path.join(stateDir, "agents", "main", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
    const sessionsStorePath = path.join(sessionsDir, "sessions.json");
    await fs.writeFile(sessionsStorePath, "{}\n", "utf-8");
    await fs.chmod(sessionsStorePath, 0o644);

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    expect(res.ok).toBe(true);

    expectPerms((await fs.stat(credsDir)).mode & 0o777, 0o700);
    expectPerms((await fs.stat(allowFromPath)).mode & 0o777, 0o600);
    expectPerms((await fs.stat(authProfilesPath)).mode & 0o777, 0o600);
    expectPerms((await fs.stat(sessionsStorePath)).mode & 0o777, 0o600);
    expectPerms((await fs.stat(includePath)).mode & 0o777, 0o600);
  });

  it("handles symlinks gracefully (skips chmod)", async () => {
    const stateDir = await createStateDir("symlink");
    const realDir = await createStateDir("symlink-real");

    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(configPath, `${JSON.stringify({}, null, 2)}\n`, "utf-8");

    // Create a symlink as the stateDir path
    const symlinkState = path.join(fixtureRoot, `symlink-state-${fixtureCount++}`);
    await fs.symlink(realDir, symlinkState);

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: symlinkState,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir: symlinkState, configPath });
    // stateDir is a symlink -> chmod skipped with "symlink"
    const stateDirAction = res.actions.find((a) => a.path === symlinkState);
    expect(stateDirAction).toBeDefined();
    expect(stateDirAction!.ok).toBe(false);
    expect(stateDirAction!.skipped).toBe("symlink");
  });

  it("handles already-correct permissions (skips chmod)", async () => {
    const stateDir = await createStateDir("already-perms");
    await fs.chmod(stateDir, 0o700);

    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(configPath, `${JSON.stringify({}, null, 2)}\n`, "utf-8");
    await fs.chmod(configPath, 0o600);

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    const stateDirAction = res.actions.find((a) => a.path === stateDir);
    expect(stateDirAction).toBeDefined();
    expect(stateDirAction!.ok).toBe(false);
    expect(stateDirAction!.skipped).toBe("already");

    const configAction = res.actions.find((a) => a.path === configPath);
    expect(configAction).toBeDefined();
    expect(configAction!.ok).toBe(false);
    expect(configAction!.skipped).toBe("already");
  });

  it("handles missing stateDir (ENOENT)", async () => {
    const stateDir = path.join(fixtureRoot, `nonexistent-${fixtureCount++}`);
    const configPath = path.join(stateDir, "openclaw.json");

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    const stateDirAction = res.actions.find((a) => a.path === stateDir);
    expect(stateDirAction).toBeDefined();
    expect(stateDirAction!.ok).toBe(false);
    expect(stateDirAction!.skipped).toBe("missing");
  });

  it("skips chmod when stateDir is a file instead of directory", async () => {
    const stateDir = path.join(fixtureRoot, `file-as-dir-${fixtureCount++}`);
    await fs.writeFile(stateDir, "not a directory\n", "utf-8");

    const configDir = await createStateDir("config-for-file");
    const configPath = path.join(configDir, "openclaw.json");
    await fs.writeFile(configPath, `${JSON.stringify({}, null, 2)}\n`, "utf-8");

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    const stateDirAction = res.actions.find((a) => a.path === stateDir);
    expect(stateDirAction).toBeDefined();
    expect(stateDirAction!.ok).toBe(false);
    expect(stateDirAction!.skipped).toBe("not-a-directory");
  });

  it("skips chmod when configPath is a directory instead of file", async () => {
    const stateDir = await createStateDir("dir-as-config");
    const configPath = path.join(stateDir, "config-dir");
    await fs.mkdir(configPath, { recursive: true });

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    const configAction = res.actions.find((a) => a.path === configPath);
    expect(configAction).toBeDefined();
    expect(configAction!.ok).toBe(false);
    expect(configAction!.skipped).toBe("not-a-file");
  });

  it("does not write config when no changes needed", async () => {
    const stateDir = await createStateDir("no-changes");
    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(configPath, `${JSON.stringify({ logging: {} }, null, 2)}\n`, "utf-8");

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    expect(res.configWritten).toBe(false);
    expect(res.changes).toEqual([]);
  });

  it("handles missing config file gracefully", async () => {
    const stateDir = await createStateDir("no-config");
    const configPath = path.join(stateDir, "nonexistent-config.json");

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    // Config doesn't exist so snap.exists is false, but snap.valid may be true with empty config
    expect(res.configWritten).toBe(false);
  });

  it("runs icacls path on win32 platform", async () => {
    const stateDir = await createStateDir("win32");
    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(configPath, `${JSON.stringify({}, null, 2)}\n`, "utf-8");

    const execCalls: Array<{ command: string; args: string[] }> = [];
    const fakeExec = async (command: string, args: string[]) => {
      execCalls.push({ command, args });
    };

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
      USERNAME: "testuser",
    };

    const res = await fixSecurityFootguns({
      env,
      stateDir,
      configPath,
      platform: "win32",
      exec: fakeExec,
    });
    // Should have icacls actions
    const icaclsActions = res.actions.filter((a) => a.kind === "icacls");
    expect(icaclsActions.length).toBeGreaterThan(0);
  });

  it("handles channels without accounts section", async () => {
    const stateDir = await createStateDir("no-accounts");
    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(
      configPath,
      `${JSON.stringify(
        {
          channels: {
            slack: { groupPolicy: "open" },
            msteams: { groupPolicy: "open" },
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    expect(res.configWritten).toBe(true);
    expect(res.changes).toContain("channels.slack.groupPolicy=open -> allowlist");
    expect(res.changes).toContain("channels.msteams.groupPolicy=open -> allowlist");
  });

  it("handles agents list with agent dirs", async () => {
    const stateDir = await createStateDir("agents-list");
    const configPath = path.join(stateDir, "openclaw.json");
    await fs.writeFile(
      configPath,
      `${JSON.stringify({ agents: { list: [{ id: "helper-bot" }] } }, null, 2)}\n`,
      "utf-8",
    );

    // Create agent dirs
    const agentDir = path.join(stateDir, "agents", "helper-bot", "agent");
    await fs.mkdir(agentDir, { recursive: true });
    const sessionsDir = path.join(stateDir, "agents", "helper-bot", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };

    const res = await fixSecurityFootguns({ env, stateDir, configPath });
    expect(res.ok).toBe(true);
    // Should have actions for agent dirs
    const agentActions = res.actions.filter((a) => a.path.includes("helper-bot"));
    expect(agentActions.length).toBeGreaterThan(0);
  });

  it("handles icacls symlink skip on win32", async () => {
    await createStateDir("win32-symlink");
    const realDir = await createStateDir("win32-symlink-real");
    const symlinkState = path.join(fixtureRoot, `win32-sym-${fixtureCount++}`);
    await fs.symlink(realDir, symlinkState);

    const configDir = await createStateDir("win32-sym-config");
    const configPath = path.join(configDir, "openclaw.json");
    await fs.writeFile(configPath, `${JSON.stringify({}, null, 2)}\n`, "utf-8");

    const fakeExec = async () => {};
    const env = {
      ...process.env,
      OPENCLAW_STATE_DIR: symlinkState,
      OPENCLAW_CONFIG_PATH: configPath,
      USERNAME: "testuser",
    };

    const res = await fixSecurityFootguns({
      env,
      stateDir: symlinkState,
      configPath,
      platform: "win32",
      exec: fakeExec,
    });
    const stateDirAction = res.actions.find((a) => a.path === symlinkState);
    expect(stateDirAction).toBeDefined();
    expect(stateDirAction!.kind).toBe("icacls");
    expect(stateDirAction!.ok).toBe(false);
    expect(stateDirAction!.skipped).toBe("symlink");
  });
});
