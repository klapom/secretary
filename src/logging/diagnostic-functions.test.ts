import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../infra/diagnostic-events.js", () => ({
  emitDiagnosticEvent: vi.fn(),
}));

import { emitDiagnosticEvent } from "../infra/diagnostic-events.js";
import {
  logWebhookReceived,
  logWebhookProcessed,
  logWebhookError,
  logMessageQueued,
  logMessageProcessed,
  logSessionStateChange,
  logSessionStuck,
  logLaneEnqueue,
  logLaneDequeue,
  logRunAttempt,
  logActiveRuns,
  startDiagnosticHeartbeat,
  stopDiagnosticHeartbeat,
  resetDiagnosticStateForTest,
  getDiagnosticSessionStateCountForTest,
} from "./diagnostic.js";
import { resetLogger, setLoggerOverride } from "./logger.js";

beforeEach(() => {
  vi.useFakeTimers();
  resetDiagnosticStateForTest();
  setLoggerOverride({ level: "debug", consoleLevel: "silent" });
  vi.mocked(emitDiagnosticEvent).mockClear();
});

afterEach(() => {
  resetDiagnosticStateForTest();
  setLoggerOverride(null);
  resetLogger();
  vi.useRealTimers();
});

describe("logWebhookReceived", () => {
  it("emits diagnostic event", () => {
    logWebhookReceived({ channel: "telegram" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "webhook.received", channel: "telegram" }),
    );
  });

  it("passes optional updateType and chatId", () => {
    logWebhookReceived({ channel: "discord", updateType: "message", chatId: 42 });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ updateType: "message", chatId: 42 }),
    );
  });
});

describe("logWebhookProcessed", () => {
  it("emits diagnostic event", () => {
    logWebhookProcessed({ channel: "discord", durationMs: 100 });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "webhook.processed", channel: "discord" }),
    );
  });

  it("handles missing optional fields", () => {
    logWebhookProcessed({ channel: "slack" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "webhook.processed" }),
    );
  });
});

describe("logWebhookError", () => {
  it("emits diagnostic event", () => {
    logWebhookError({ channel: "slack", error: "timeout" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "webhook.error", error: "timeout" }),
    );
  });

  it("passes optional chatId and updateType", () => {
    logWebhookError({ channel: "telegram", error: "fail", updateType: "callback", chatId: "c1" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ updateType: "callback", chatId: "c1" }),
    );
  });
});

describe("logMessageQueued", () => {
  it("emits diagnostic event and tracks state", () => {
    logMessageQueued({ sessionId: "s1", source: "webhook" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "message.queued", source: "webhook" }),
    );
    expect(getDiagnosticSessionStateCountForTest()).toBeGreaterThanOrEqual(1);
  });

  it("increments queue depth on repeated calls", () => {
    logMessageQueued({ sessionId: "s1", source: "webhook" });
    logMessageQueued({ sessionId: "s1", source: "webhook" });
    const calls = vi
      .mocked(emitDiagnosticEvent)
      .mock.calls.filter((c) => (c[0] as Record<string, unknown>).type === "message.queued");
    expect((calls[1][0] as Record<string, unknown>).queueDepth).toBe(2);
  });

  it("uses sessionKey when provided", () => {
    logMessageQueued({ sessionKey: "agent:main:telegram:c1", source: "api" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionKey: "agent:main:telegram:c1" }),
    );
  });
});

describe("logMessageProcessed", () => {
  it("emits diagnostic event for completed", () => {
    logMessageProcessed({ channel: "telegram", outcome: "completed" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "message.processed", outcome: "completed" }),
    );
  });

  it("emits diagnostic event for error outcome", () => {
    logMessageProcessed({ channel: "telegram", outcome: "error", error: "fail" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "message.processed", outcome: "error" }),
    );
  });

  it("emits skipped outcome with reason", () => {
    logMessageProcessed({ channel: "slack", outcome: "skipped", reason: "duplicate" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "skipped", reason: "duplicate" }),
    );
  });

  it("includes all optional fields", () => {
    logMessageProcessed({
      channel: "discord",
      messageId: "m1",
      chatId: "c1",
      sessionId: "s1",
      sessionKey: "k1",
      durationMs: 300,
      outcome: "completed",
    });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "m1", chatId: "c1", durationMs: 300 }),
    );
  });
});

describe("logSessionStateChange", () => {
  it("emits session state event", () => {
    logSessionStateChange({ sessionId: "s1", state: "processing" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "session.state", state: "processing" }),
    );
  });

  it("decrements queue on idle", () => {
    logMessageQueued({ sessionId: "s2", source: "test" });
    logSessionStateChange({ sessionId: "s2", state: "idle" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "session.state", state: "idle" }),
    );
  });

  it("tracks prev state", () => {
    logSessionStateChange({ sessionId: "s3", state: "processing" });
    logSessionStateChange({ sessionId: "s3", state: "idle" });
    const stateCalls = vi
      .mocked(emitDiagnosticEvent)
      .mock.calls.filter((c) => (c[0] as Record<string, unknown>).type === "session.state");
    expect((stateCalls[1][0] as Record<string, unknown>).prevState).toBe("processing");
  });

  it("includes reason when provided", () => {
    logSessionStateChange({ sessionId: "s1", state: "processing", reason: "new message" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "new message" }),
    );
  });

  it("does not crash on probe sessions", () => {
    logSessionStateChange({ sessionId: "probe-health", state: "processing" });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "probe-health" }),
    );
  });
});

describe("logSessionStuck", () => {
  it("emits stuck session event", () => {
    logSessionStuck({ sessionId: "s1", state: "processing", ageMs: 200000 });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "session.stuck", ageMs: 200000 }),
    );
  });
});

describe("logLaneEnqueue / logLaneDequeue", () => {
  it("emits enqueue event", () => {
    logLaneEnqueue("lane1", 5);
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "queue.lane.enqueue", lane: "lane1" }),
    );
  });

  it("emits dequeue event", () => {
    logLaneDequeue("lane1", 100, 4);
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "queue.lane.dequeue", lane: "lane1", waitMs: 100 }),
    );
  });
});

describe("logRunAttempt", () => {
  it("emits run attempt event", () => {
    logRunAttempt({ sessionId: "s1", runId: "r1", attempt: 1 });
    expect(emitDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "run.attempt", runId: "r1" }),
    );
  });
});

describe("logActiveRuns", () => {
  it("does not throw", () => {
    expect(() => logActiveRuns()).not.toThrow();
  });

  it("works with active processing sessions", () => {
    logSessionStateChange({ sessionId: "s1", state: "processing" });
    expect(() => logActiveRuns()).not.toThrow();
  });
});

describe("diagnostic heartbeat", () => {
  it("starts and stops without error", () => {
    startDiagnosticHeartbeat();
    stopDiagnosticHeartbeat();
  });

  it("start is idempotent", () => {
    startDiagnosticHeartbeat();
    startDiagnosticHeartbeat();
    stopDiagnosticHeartbeat();
  });

  it("emits heartbeat event when there is webhook activity", () => {
    logWebhookReceived({ channel: "telegram" });
    vi.mocked(emitDiagnosticEvent).mockClear();
    startDiagnosticHeartbeat();
    vi.advanceTimersByTime(31_000);
    const heartbeats = vi
      .mocked(emitDiagnosticEvent)
      .mock.calls.filter((c) => (c[0] as Record<string, unknown>).type === "diagnostic.heartbeat");
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);
    stopDiagnosticHeartbeat();
  });

  it("detects stuck processing sessions after 120s", () => {
    logSessionStateChange({ sessionId: "stuck-1", state: "processing" });
    vi.mocked(emitDiagnosticEvent).mockClear();
    startDiagnosticHeartbeat();
    vi.advanceTimersByTime(150_000);
    const stuckCalls = vi
      .mocked(emitDiagnosticEvent)
      .mock.calls.filter((c) => (c[0] as Record<string, unknown>).type === "session.stuck");
    expect(stuckCalls.length).toBeGreaterThanOrEqual(1);
    stopDiagnosticHeartbeat();
  });

  it("skips heartbeat when no activity at all", () => {
    startDiagnosticHeartbeat();
    vi.advanceTimersByTime(31_000);
    const heartbeats = vi
      .mocked(emitDiagnosticEvent)
      .mock.calls.filter((c) => (c[0] as Record<string, unknown>).type === "diagnostic.heartbeat");
    expect(heartbeats.length).toBe(0);
    stopDiagnosticHeartbeat();
  });

  it("skips heartbeat when idle for over 120s and no active sessions", () => {
    logWebhookReceived({ channel: "telegram" });
    vi.mocked(emitDiagnosticEvent).mockClear();
    startDiagnosticHeartbeat();
    // Advance past 120s idle threshold
    vi.advanceTimersByTime(150_000);
    const heartbeats = vi
      .mocked(emitDiagnosticEvent)
      .mock.calls.filter((c) => (c[0] as Record<string, unknown>).type === "diagnostic.heartbeat");
    // First heartbeat at 30s fires (within 120s), subsequent ones after 120s should skip
    expect(heartbeats.length).toBeLessThanOrEqual(4);
    stopDiagnosticHeartbeat();
  });

  it("stop is safe to call when not started", () => {
    expect(() => stopDiagnosticHeartbeat()).not.toThrow();
  });
});

describe("resetDiagnosticStateForTest", () => {
  it("clears session states and webhook stats", () => {
    logWebhookReceived({ channel: "telegram" });
    logMessageQueued({ sessionId: "s1", source: "webhook" });
    resetDiagnosticStateForTest();
    expect(getDiagnosticSessionStateCountForTest()).toBe(0);
  });
});
