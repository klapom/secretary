import { describe, expect, it } from "vitest";
import { parseLogLine } from "./parse-log-line.js";

describe("parseLogLine", () => {
  it("returns null for invalid JSON", () => {
    expect(parseLogLine("not json")).toBeNull();
  });

  it("parses structured log line", () => {
    const line = JSON.stringify({
      time: "2026-01-01T00:00:00.000Z",
      _meta: {
        logLevelName: "INFO",
        name: JSON.stringify({ subsystem: "gateway", module: "http" }),
      },
      0: "Request received",
    });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.time).toBe("2026-01-01T00:00:00.000Z");
    expect(result!.level).toBe("info");
    expect(result!.subsystem).toBe("gateway");
    expect(result!.module).toBe("http");
    expect(result!.message).toBe("Request received");
  });

  it("handles missing meta", () => {
    const line = JSON.stringify({ 0: "hello", 1: "world" });
    const result = parseLogLine(line);
    expect(result).not.toBeNull();
    expect(result!.message).toBe("hello world");
    expect(result!.level).toBeUndefined();
  });

  it("uses meta.date as fallback time", () => {
    const line = JSON.stringify({ _meta: { date: "2026-02-01" }, 0: "msg" });
    const result = parseLogLine(line);
    expect(result!.time).toBe("2026-02-01");
  });

  it("handles non-string message values", () => {
    const line = JSON.stringify({ 0: "text", 1: { key: "val" } });
    const result = parseLogLine(line);
    expect(result!.message).toContain("text");
    expect(result!.message).toContain("key");
  });

  it("handles invalid meta name JSON", () => {
    const line = JSON.stringify({ _meta: { name: "not-json" }, 0: "msg" });
    const result = parseLogLine(line);
    expect(result!.subsystem).toBeUndefined();
  });
});
