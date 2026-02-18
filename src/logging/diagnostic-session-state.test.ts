import { describe, expect, it, afterEach } from "vitest";
import {
  getDiagnosticSessionState,
  resetDiagnosticSessionStateForTest,
  getDiagnosticSessionStateCountForTest,
  pruneDiagnosticSessionStates,
  diagnosticSessionStates,
} from "./diagnostic-session-state.js";

describe("diagnostic-session-state", () => {
  afterEach(() => {
    resetDiagnosticSessionStateForTest();
  });

  it("creates new state for unknown session", () => {
    const state = getDiagnosticSessionState({ sessionKey: "test-1" });
    expect(state.state).toBe("idle");
    expect(state.queueDepth).toBe(0);
    expect(state.sessionKey).toBe("test-1");
  });

  it("returns same state for same key", () => {
    const s1 = getDiagnosticSessionState({ sessionKey: "test-2" });
    const s2 = getDiagnosticSessionState({ sessionKey: "test-2" });
    expect(s1).toBe(s2);
  });

  it("resolves by sessionId when key not found", () => {
    const s1 = getDiagnosticSessionState({ sessionId: "sid-1", sessionKey: "key-1" });
    const s2 = getDiagnosticSessionState({ sessionId: "sid-1", sessionKey: "key-2" });
    expect(s2).toBe(s1);
  });

  it("uses 'unknown' when no key or id", () => {
    const state = getDiagnosticSessionState({});
    expect(getDiagnosticSessionStateCountForTest()).toBeGreaterThan(0);
    expect(state.state).toBe("idle");
  });

  it("prune removes old idle entries", () => {
    const state = getDiagnosticSessionState({ sessionKey: "old" });
    state.lastActivity = Date.now() - 60 * 60 * 1000;
    state.state = "idle";
    state.queueDepth = 0;
    pruneDiagnosticSessionStates(Date.now(), true);
    expect(diagnosticSessionStates.has("old")).toBe(false);
  });

  it("prune keeps active entries", () => {
    const state = getDiagnosticSessionState({ sessionKey: "active" });
    state.state = "processing";
    pruneDiagnosticSessionStates(Date.now(), true);
    expect(diagnosticSessionStates.has("active")).toBe(true);
  });

  it("reset clears all state", () => {
    getDiagnosticSessionState({ sessionKey: "a" });
    getDiagnosticSessionState({ sessionKey: "b" });
    resetDiagnosticSessionStateForTest();
    expect(getDiagnosticSessionStateCountForTest()).toBe(0);
  });
});
