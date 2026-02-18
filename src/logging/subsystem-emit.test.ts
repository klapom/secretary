import { afterEach, describe, expect, it, vi } from "vitest";
import { setConsoleSubsystemFilter } from "./console.js";
import { resetLogger, setLoggerOverride } from "./logger.js";
import { loggingState } from "./state.js";
import { createSubsystemLogger, stripRedundantSubsystemPrefixForConsole } from "./subsystem.js";

afterEach(() => {
  setConsoleSubsystemFilter(null);
  setLoggerOverride(null);
  resetLogger();
  loggingState.forceConsoleToStderr = false;
  loggingState.consoleTimestampPrefix = false;
  delete process.env.COLORTERM;
  delete process.env.TERM_PROGRAM;
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
});

describe("createSubsystemLogger emit to console", () => {
  it("emits info to console when consoleLevel allows", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info" });
    const log = createSubsystemLogger("test-sub");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("hello world");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("emits warn to console.warn", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "warn" });
    const log = createSubsystemLogger("test-sub");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    log.warn("warning msg");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("emits error to console.error", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "error" });
    const log = createSubsystemLogger("test-sub");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("error msg");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not emit to console when consoleLevel is silent", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "silent" });
    const log = createSubsystemLogger("test-sub");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("hello");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not emit to console when subsystem is filtered out", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info" });
    setConsoleSubsystemFilter(["gateway"]);
    const log = createSubsystemLogger("agent");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("hello");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("emits with meta containing consoleMessage override", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info" });
    const log = createSubsystemLogger("test-sub");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("file msg", { consoleMessage: "console msg", extra: 1 });
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("console msg");
    spy.mockRestore();
  });

  it("suppresses agent/embedded probe messages in non-verbose mode", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info" });
    const log = createSubsystemLogger("agent/embedded");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("sessionId=probe-123 test");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("raw method emits to console", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info" });
    const log = createSubsystemLogger("test-sub");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.raw("raw message");
    expect(spy).toHaveBeenCalledWith("raw message");
    spy.mockRestore();
  });

  it("raw suppresses agent/embedded probe messages", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info" });
    const log = createSubsystemLogger("agent/embedded");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.raw("runId=probe-abc test");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("raw does not emit when subsystem filtered out", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info" });
    setConsoleSubsystemFilter(["gateway"]);
    const log = createSubsystemLogger("agent");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.raw("test");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("emits error/fatal to stderr when forceConsoleToStderr", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "error" });
    loggingState.forceConsoleToStderr = true;
    const log = createSubsystemLogger("test-sub");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("bad");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("formats json style when configured", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info", consoleStyle: "json" });
    const log = createSubsystemLogger("test-sub");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("json message");
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.message).toBe("json message");
    expect(parsed.level).toBe("info");
    expect(parsed.subsystem).toBe("test-sub");
    spy.mockRestore();
  });

  it("formats compact style", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info", consoleStyle: "compact" });
    const log = createSubsystemLogger("test-sub");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("compact msg");
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("compact msg");
    spy.mockRestore();
  });

  it("formats pretty style with timestamp", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info", consoleStyle: "pretty" });
    const log = createSubsystemLogger("test-sub");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("pretty msg");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("formatSubsystemForConsole via emit", () => {
  it("drops gateway prefix from subsystem", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info", consoleStyle: "json" });
    const log = createSubsystemLogger("gateway/http");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("test-gw");
    expect(spy).toHaveBeenCalled();
    // In json style, subsystem is not formatted
    const last = spy.mock.calls[spy.mock.calls.length - 1][0] as string;
    const parsed = JSON.parse(last);
    expect(parsed.subsystem).toBe("gateway/http");
    spy.mockRestore();
  });

  it("shows formatted subsystem in compact style", () => {
    resetLogger();
    setLoggerOverride({ level: "silent", consoleLevel: "info", consoleStyle: "compact" });
    const log = createSubsystemLogger("gateway/http");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("unique-fmt-test-123");
    const calls = spy.mock.calls.filter((c) => String(c[0]).includes("unique-fmt-test-123"));
    expect(calls.length).toBeGreaterThan(0);
    const output = calls[0][0] as string;
    expect(output).toContain("[http]");
    spy.mockRestore();
  });

  it("limits segments to max 2 in compact", () => {
    resetLogger();
    setLoggerOverride({ level: "silent", consoleLevel: "info", consoleStyle: "compact" });
    const log = createSubsystemLogger("a/b/c/d");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("unique-seg-test-456");
    const calls = spy.mock.calls.filter((c) => String(c[0]).includes("unique-seg-test-456"));
    expect(calls.length).toBeGreaterThan(0);
    const output = calls[0][0] as string;
    expect(output).toContain("[c/d]");
    spy.mockRestore();
  });

  it("returns original when all parts are dropped", () => {
    resetLogger();
    setLoggerOverride({ level: "silent", consoleLevel: "info", consoleStyle: "compact" });
    const log = createSubsystemLogger("gateway");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("unique-orig-test-789");
    const calls = spy.mock.calls.filter((c) => String(c[0]).includes("unique-orig-test-789"));
    expect(calls.length).toBeGreaterThan(0);
    const output = calls[0][0] as string;
    expect(output).toContain("[gateway]");
    spy.mockRestore();
  });
});

describe("stripRedundantSubsystemPrefixForConsole edge cases", () => {
  it("handles bracket with extra spaces", () => {
    expect(stripRedundantSubsystemPrefixForConsole("[test]   msg", "test")).toBe("msg");
  });

  it("handles prefix followed by colon and spaces", () => {
    expect(stripRedundantSubsystemPrefixForConsole("test :  msg", "test")).toBe("msg");
  });

  it("returns message when prefix matches but next char is not : or space", () => {
    expect(stripRedundantSubsystemPrefixForConsole("testing", "test")).toBe("testing");
  });
});
