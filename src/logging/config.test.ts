import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/paths.js", () => ({
  resolveConfigPath: () => "/mock/config.json5",
}));

import { readLoggingConfig } from "./config.js";

describe("readLoggingConfig", () => {
  it("returns undefined when config file does not exist", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(readLoggingConfig()).toBeUndefined();
  });

  it("returns logging section when present", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ logging: { level: "debug" } }));
    const result = readLoggingConfig();
    expect(result).toEqual({ level: "debug" });
  });

  it("returns undefined when logging is not an object", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ logging: "invalid" }));
    expect(readLoggingConfig()).toBeUndefined();
  });

  it("returns undefined when logging is an array", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ logging: [1, 2] }));
    expect(readLoggingConfig()).toBeUndefined();
  });

  it("returns undefined when logging is missing", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ other: true }));
    expect(readLoggingConfig()).toBeUndefined();
  });

  it("returns undefined on parse error", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("not valid json5 {{{{");
    expect(readLoggingConfig()).toBeUndefined();
  });
});
