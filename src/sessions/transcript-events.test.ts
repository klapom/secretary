import { describe, expect, it, vi } from "vitest";
import { onSessionTranscriptUpdate, emitSessionTranscriptUpdate } from "./transcript-events.js";

describe("transcript-events", () => {
  it("listener receives emitted updates", () => {
    const listener = vi.fn();
    const unsub = onSessionTranscriptUpdate(listener);
    emitSessionTranscriptUpdate("file1.json");
    expect(listener).toHaveBeenCalledWith({ sessionFile: "file1.json" });
    unsub();
  });

  it("unsubscribe stops future notifications", () => {
    const listener = vi.fn();
    const unsub = onSessionTranscriptUpdate(listener);
    unsub();
    emitSessionTranscriptUpdate("file2.json");
    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores empty session file", () => {
    const listener = vi.fn();
    const unsub = onSessionTranscriptUpdate(listener);
    emitSessionTranscriptUpdate("");
    emitSessionTranscriptUpdate("  ");
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it("trims session file", () => {
    const listener = vi.fn();
    const unsub = onSessionTranscriptUpdate(listener);
    emitSessionTranscriptUpdate("  file3.json  ");
    expect(listener).toHaveBeenCalledWith({ sessionFile: "file3.json" });
    unsub();
  });
});
