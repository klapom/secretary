import { describe, expect, it, vi } from "vitest";
import { formatLocalIsoWithOffset } from "./timestamps.js";

describe("formatLocalIsoWithOffset", () => {
  it("formats a date with timezone offset", () => {
    const date = new Date("2026-02-18T12:30:45.123Z");
    const result = formatLocalIsoWithOffset(date);
    // Should contain ISO-like format with timezone
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  });

  it("pads single-digit values", () => {
    const date = new Date(2026, 0, 5, 3, 7, 9, 1); // Jan 5, 03:07:09.001
    const result = formatLocalIsoWithOffset(date);
    expect(result).toContain("2026-01-05");
    expect(result).toContain("03:07:09.001");
  });

  it("handles positive timezone offset (west of UTC)", () => {
    const date = new Date("2026-02-18T12:00:00Z");
    const spy = vi.spyOn(date, "getTimezoneOffset").mockReturnValue(300); // UTC-5
    const result = formatLocalIsoWithOffset(date);
    expect(result).toMatch(/-05:00$/);
    spy.mockRestore();
  });

  it("handles negative timezone offset (east of UTC)", () => {
    const date = new Date("2026-02-18T12:00:00Z");
    const spy = vi.spyOn(date, "getTimezoneOffset").mockReturnValue(-60); // UTC+1
    const result = formatLocalIsoWithOffset(date);
    expect(result).toMatch(/\+01:00$/);
    spy.mockRestore();
  });
});
