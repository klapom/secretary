import { describe, expect, it } from "vitest";
import {
  formatConsoleTimestamp,
  shouldLogSubsystemToConsole,
  setConsoleSubsystemFilter,
  setConsoleTimestampPrefix,
  getConsoleSettings,
  routeLogsToStderr,
} from "./console.js";
import { loggingState } from "./state.js";

describe("formatConsoleTimestamp", () => {
  it("returns HH:MM:SS for pretty style", () => {
    const ts = formatConsoleTimestamp("pretty");
    expect(ts).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("returns ISO format for compact style", () => {
    const ts = formatConsoleTimestamp("compact");
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns ISO format for json style", () => {
    const ts = formatConsoleTimestamp("json");
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("shouldLogSubsystemToConsole", () => {
  it("returns true when no filter is set", () => {
    setConsoleSubsystemFilter(null);
    expect(shouldLogSubsystemToConsole("anything")).toBe(true);
  });

  it("filters by exact match", () => {
    setConsoleSubsystemFilter(["memory"]);
    expect(shouldLogSubsystemToConsole("memory")).toBe(true);
    expect(shouldLogSubsystemToConsole("infra")).toBe(false);
    setConsoleSubsystemFilter(null);
  });

  it("filters by prefix match", () => {
    setConsoleSubsystemFilter(["memory"]);
    expect(shouldLogSubsystemToConsole("memory/embeddings")).toBe(true);
    expect(shouldLogSubsystemToConsole("memorystuff")).toBe(false);
    setConsoleSubsystemFilter(null);
  });

  it("handles empty filter array", () => {
    setConsoleSubsystemFilter([]);
    expect(shouldLogSubsystemToConsole("anything")).toBe(true);
  });
});

describe("setConsoleTimestampPrefix", () => {
  it("sets the prefix state", () => {
    const orig = loggingState.consoleTimestampPrefix;
    setConsoleTimestampPrefix(true);
    expect(loggingState.consoleTimestampPrefix).toBe(true);
    setConsoleTimestampPrefix(false);
    expect(loggingState.consoleTimestampPrefix).toBe(false);
    loggingState.consoleTimestampPrefix = orig;
  });
});

describe("routeLogsToStderr", () => {
  it("sets forceConsoleToStderr", () => {
    const orig = loggingState.forceConsoleToStderr;
    routeLogsToStderr();
    expect(loggingState.forceConsoleToStderr).toBe(true);
    loggingState.forceConsoleToStderr = orig;
  });
});

describe("getConsoleSettings", () => {
  it("returns level and style", () => {
    const settings = getConsoleSettings();
    expect(typeof settings.level).toBe("string");
    expect(typeof settings.style).toBe("string");
  });
});
