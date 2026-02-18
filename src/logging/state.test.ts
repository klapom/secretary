import { describe, expect, it } from "vitest";
import { loggingState } from "./state.js";

describe("loggingState", () => {
  it("has expected default values", () => {
    expect(loggingState.consolePatched).toBe(false);
    expect(loggingState.forceConsoleToStderr).toBe(false);
    expect(loggingState.consoleTimestampPrefix).toBe(false);
    expect(loggingState.consoleSubsystemFilter).toBeNull();
    expect(loggingState.resolvingConsoleSettings).toBe(false);
    expect(loggingState.streamErrorHandlersInstalled).toBe(false);
  });

  it("cachedLogger is initially null", () => {
    expect(loggingState.cachedLogger).toBeNull();
  });

  it("rawConsole is initially null", () => {
    expect(loggingState.rawConsole).toBeNull();
  });
});
