import { afterEach, describe, expect, it, vi } from "vitest";
import { setConsoleSubsystemFilter } from "./console.js";
import { resetLogger, setLoggerOverride } from "./logger.js";
import {
  createSubsystemLogger,
  stripRedundantSubsystemPrefixForConsole,
  runtimeForLogger,
  createSubsystemRuntime,
} from "./subsystem.js";

afterEach(() => {
  setConsoleSubsystemFilter(null);
  setLoggerOverride(null);
  resetLogger();
});

describe("createSubsystemLogger().isEnabled", () => {
  it("returns true for any/file when only file logging would emit", () => {
    setLoggerOverride({ level: "debug", consoleLevel: "silent" });
    const log = createSubsystemLogger("agent/embedded");

    expect(log.isEnabled("debug")).toBe(true);
    expect(log.isEnabled("debug", "file")).toBe(true);
    expect(log.isEnabled("debug", "console")).toBe(false);
  });

  it("returns true for any/console when only console logging would emit", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "debug" });
    const log = createSubsystemLogger("agent/embedded");

    expect(log.isEnabled("debug")).toBe(true);
    expect(log.isEnabled("debug", "console")).toBe(true);
    expect(log.isEnabled("debug", "file")).toBe(false);
  });

  it("returns false when neither console nor file logging would emit", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "silent" });
    const log = createSubsystemLogger("agent/embedded");

    expect(log.isEnabled("debug")).toBe(false);
    expect(log.isEnabled("debug", "console")).toBe(false);
    expect(log.isEnabled("debug", "file")).toBe(false);
  });

  it("honors console subsystem filters for console target", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info" });
    setConsoleSubsystemFilter(["gateway"]);
    const log = createSubsystemLogger("agent/embedded");

    expect(log.isEnabled("info", "console")).toBe(false);
  });

  it("does not apply console subsystem filters to file target", () => {
    setLoggerOverride({ level: "info", consoleLevel: "silent" });
    setConsoleSubsystemFilter(["gateway"]);
    const log = createSubsystemLogger("agent/embedded");

    expect(log.isEnabled("info", "file")).toBe(true);
    expect(log.isEnabled("info")).toBe(true);
  });
});

describe("stripRedundantSubsystemPrefixForConsole", () => {
  it("returns message unchanged when no subsystem", () => {
    expect(stripRedundantSubsystemPrefixForConsole("hello", "")).toBe("hello");
  });

  it("strips bracket prefix matching subsystem", () => {
    expect(stripRedundantSubsystemPrefixForConsole("[discord] connected", "discord")).toBe(
      "connected",
    );
  });

  it("strips plain prefix matching subsystem", () => {
    expect(stripRedundantSubsystemPrefixForConsole("discord: connected", "discord")).toBe(
      "connected",
    );
  });

  it("preserves message when bracket tag differs", () => {
    expect(stripRedundantSubsystemPrefixForConsole("[slack] hello", "discord")).toBe(
      "[slack] hello",
    );
  });

  it("preserves message when prefix does not match", () => {
    expect(stripRedundantSubsystemPrefixForConsole("other message", "discord")).toBe(
      "other message",
    );
  });

  it("is case insensitive", () => {
    expect(stripRedundantSubsystemPrefixForConsole("[Discord] msg", "discord")).toBe("msg");
  });

  it("handles prefix followed by space", () => {
    expect(stripRedundantSubsystemPrefixForConsole("discord connected", "discord")).toBe(
      "connected",
    );
  });
});

describe("runtimeForLogger", () => {
  it("returns RuntimeEnv with log and error methods", () => {
    const logger = createSubsystemLogger("test");
    const runtime = runtimeForLogger(logger);
    expect(typeof runtime.log).toBe("function");
    expect(typeof runtime.error).toBe("function");
    expect(typeof runtime.exit).toBe("function");
  });

  it("uses custom exit function", () => {
    const logger = createSubsystemLogger("test");
    const exit = vi.fn();
    const runtime = runtimeForLogger(logger, exit);
    expect(runtime.exit).toBe(exit);
  });
});

describe("createSubsystemRuntime", () => {
  it("creates a runtime for a subsystem", () => {
    const runtime = createSubsystemRuntime("test-sub");
    expect(typeof runtime.log).toBe("function");
    expect(typeof runtime.error).toBe("function");
  });
});

describe("createSubsystemLogger", () => {
  it("child creates a child logger with combined subsystem", () => {
    setLoggerOverride({ level: "debug", consoleLevel: "silent" });
    const parent = createSubsystemLogger("gateway");
    const child = parent.child("http");
    expect(child.subsystem).toBe("gateway/http");
  });

  it("has all log level methods", () => {
    const log = createSubsystemLogger("test");
    expect(typeof log.trace).toBe("function");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.fatal).toBe("function");
    expect(typeof log.raw).toBe("function");
  });
});
