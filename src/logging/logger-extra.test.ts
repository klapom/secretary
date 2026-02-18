import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getLogger,
  getChildLogger,
  toPinoLikeLogger,
  getResolvedLoggerSettings,
  setLoggerOverride,
  resetLogger,
  registerLogTransport,
} from "./logger.js";

const tmpDir = path.join(os.tmpdir(), `logger-test-${Date.now()}`);

afterEach(() => {
  resetLogger();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe("getLogger", () => {
  it("creates a logger and writes to file", () => {
    const logFile = path.join(tmpDir, "test.log");
    setLoggerOverride({ level: "info", file: logFile });
    const logger = getLogger();
    logger.info("hello test");
    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).toContain("hello test");
  });

  it("reuses cached logger on same settings", () => {
    const logFile = path.join(tmpDir, "cached.log");
    setLoggerOverride({ level: "info", file: logFile });
    const l1 = getLogger();
    const l2 = getLogger();
    expect(l1).toBe(l2);
  });

  it("rebuilds logger when settings change", () => {
    const logFile1 = path.join(tmpDir, "a.log");
    const logFile2 = path.join(tmpDir, "b.log");
    setLoggerOverride({ level: "info", file: logFile1 });
    const l1 = getLogger();
    setLoggerOverride({ level: "debug", file: logFile2 });
    resetLogger();
    setLoggerOverride({ level: "debug", file: logFile2 });
    const l2 = getLogger();
    expect(l1).not.toBe(l2);
  });
});

describe("getChildLogger", () => {
  it("creates child with bindings", () => {
    const logFile = path.join(tmpDir, "child.log");
    setLoggerOverride({ level: "info", file: logFile });
    const child = getChildLogger({ subsystem: "test" });
    child.info("child msg");
    expect(fs.existsSync(logFile)).toBe(true);
  });

  it("creates child with level override", () => {
    const logFile = path.join(tmpDir, "child-level.log");
    setLoggerOverride({ level: "info", file: logFile });
    const child = getChildLogger({ subsystem: "test" }, { level: "debug" });
    child.debug("debug msg");
    // Should not throw
  });

  it("creates child without bindings", () => {
    const logFile = path.join(tmpDir, "child-no-bind.log");
    setLoggerOverride({ level: "info", file: logFile });
    const child = getChildLogger();
    child.info("no bind msg");
  });
});

describe("toPinoLikeLogger", () => {
  it("returns a pino-like logger shape", () => {
    const logFile = path.join(tmpDir, "pino.log");
    setLoggerOverride({ level: "info", file: logFile });
    const base = getLogger();
    const pino = toPinoLikeLogger(base, "info");

    expect(pino.level).toBe("info");
    expect(typeof pino.child).toBe("function");
    expect(typeof pino.trace).toBe("function");
    expect(typeof pino.debug).toBe("function");
    expect(typeof pino.info).toBe("function");
    expect(typeof pino.warn).toBe("function");
    expect(typeof pino.error).toBe("function");
    expect(typeof pino.fatal).toBe("function");
  });

  it("child returns a pino-like logger", () => {
    const logFile = path.join(tmpDir, "pino-child.log");
    setLoggerOverride({ level: "info", file: logFile });
    const base = getLogger();
    const pino = toPinoLikeLogger(base, "info");
    const child = pino.child({ module: "test" });
    expect(typeof child.info).toBe("function");
    expect(child.level).toBe("info");
  });
});

describe("getResolvedLoggerSettings", () => {
  it("returns resolved settings", () => {
    setLoggerOverride({ level: "warn" });
    const settings = getResolvedLoggerSettings();
    expect(settings.level).toBe("warn");
    expect(typeof settings.file).toBe("string");
  });
});

describe("toPinoLikeLogger method calls", () => {
  it("calls all log level methods without throwing", () => {
    const logFile = path.join(tmpDir, "pino-methods.log");
    setLoggerOverride({ level: "trace", file: logFile });
    const base = getLogger();
    const pino = toPinoLikeLogger(base, "trace");
    expect(() => pino.trace("t")).not.toThrow();
    expect(() => pino.debug("d")).not.toThrow();
    expect(() => pino.info("i")).not.toThrow();
    expect(() => pino.warn("w")).not.toThrow();
    expect(() => pino.error("e")).not.toThrow();
    expect(() => pino.fatal("f")).not.toThrow();
  });

  it("child without bindings works", () => {
    const logFile = path.join(tmpDir, "pino-child-nobind.log");
    setLoggerOverride({ level: "info", file: logFile });
    const base = getLogger();
    const pino = toPinoLikeLogger(base, "info");
    const child = pino.child();
    expect(typeof child.info).toBe("function");
  });
});

describe("isFileLogLevelEnabled", () => {
  it("returns false for silent level", async () => {
    setLoggerOverride({ level: "silent" });
    const { isFileLogLevelEnabled } = await import("./logger.js");
    expect(isFileLogLevelEnabled("info")).toBe(false);
  });

  it("returns true when level is enabled", async () => {
    setLoggerOverride({ level: "debug" });
    const { isFileLogLevelEnabled } = await import("./logger.js");
    expect(isFileLogLevelEnabled("info")).toBe(true);
  });
});

describe("rolling log pruning", () => {
  it("prunes old rolling log files when building logger with rolling path", () => {
    // Create a rolling-style log file with old mtime
    const logDir = path.join(tmpDir, "rolling");
    fs.mkdirSync(logDir, { recursive: true });
    const oldFile = path.join(logDir, "openclaw-2020-01-01.log");
    fs.writeFileSync(oldFile, "old log");
    // Set mtime to 48h ago
    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, oldTime, oldTime);

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const rollingFile = path.join(logDir, `openclaw-${y}-${m}-${d}.log`);

    setLoggerOverride({ level: "info", file: rollingFile });
    getLogger(); // triggers buildLogger which calls pruneOldRollingLogs

    expect(fs.existsSync(oldFile)).toBe(false);
  });

  it("does not prune recent rolling log files", () => {
    const logDir = path.join(tmpDir, "rolling-keep");
    fs.mkdirSync(logDir, { recursive: true });
    const recentFile = path.join(logDir, "openclaw-2026-02-17.log");
    fs.writeFileSync(recentFile, "recent log");

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const rollingFile = path.join(logDir, `openclaw-${y}-${m}-${d}.log`);

    setLoggerOverride({ level: "info", file: rollingFile });
    getLogger();

    expect(fs.existsSync(recentFile)).toBe(true);
  });

  it("skips non-file entries during pruning", () => {
    const logDir = path.join(tmpDir, "rolling-dir");
    fs.mkdirSync(logDir, { recursive: true });
    // Create a subdirectory that matches the prefix pattern
    fs.mkdirSync(path.join(logDir, "openclaw-subdir"), { recursive: true });

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const rollingFile = path.join(logDir, `openclaw-${y}-${m}-${d}.log`);

    setLoggerOverride({ level: "info", file: rollingFile });
    expect(() => getLogger()).not.toThrow();
  });
});

describe("registerLogTransport", () => {
  it("registers a transport and returns unsubscribe function", () => {
    const logFile = path.join(tmpDir, "transport.log");
    setLoggerOverride({ level: "info", file: logFile });
    const records: unknown[] = [];
    const unsub = registerLogTransport((obj) => records.push(obj));
    const logger = getLogger();
    logger.info("transport test");
    unsub();
    expect(records.length).toBeGreaterThanOrEqual(1);
  });

  it("attaches to existing cached logger", () => {
    const logFile = path.join(tmpDir, "transport2.log");
    setLoggerOverride({ level: "info", file: logFile });
    getLogger(); // create cached logger first
    const records: unknown[] = [];
    const unsub = registerLogTransport((obj) => records.push(obj));
    const logger = getLogger();
    logger.info("existing logger transport");
    unsub();
    expect(records.length).toBeGreaterThanOrEqual(1);
  });

  it("transport errors do not propagate", () => {
    const logFile = path.join(tmpDir, "transport-err.log");
    setLoggerOverride({ level: "info", file: logFile });
    const unsub = registerLogTransport(() => {
      throw new Error("transport fail");
    });
    const logger = getLogger();
    expect(() => logger.info("should not throw")).not.toThrow();
    unsub();
  });
});
