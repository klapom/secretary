import { describe, expect, test, beforeEach, vi } from "vitest";
import { TypedEventBus, getGlobalEventBus, resetGlobalEventBus } from "./event-bus.js";
import type { SystemEvent } from "./types.js";

describe("TypedEventBus", () => {
  let eventBus: TypedEventBus;

  beforeEach(() => {
    eventBus = new TypedEventBus({ source: "test" });
  });

  describe("publish and subscribe", () => {
    test("publishes and delivers event to subscriber", async () => {
      const received: SystemEvent<"inbound.message.received">[] = [];

      eventBus.subscribe("inbound.message.received", (event) => {
        received.push(event);
      });

      eventBus.publish("inbound.message.received", {
        messageId: "msg-1",
        sessionId: "session-1",
        channelId: "whatsapp",
        content: "Hello",
        timestamp: Date.now(),
      });

      // Allow async handlers to complete
      await new Promise((resolve) => setImmediate(resolve));

      expect(received).toHaveLength(1);
      expect(received[0]?.metadata.eventType).toBe("inbound.message.received");
      expect(received[0]?.payload.messageId).toBe("msg-1");
      expect(received[0]?.payload.content).toBe("Hello");
    });

    test("delivers event to multiple subscribers", async () => {
      const received1: SystemEvent<"agent.run.started">[] = [];
      const received2: SystemEvent<"agent.run.started">[] = [];

      eventBus.subscribe("agent.run.started", (event) => {
        received1.push(event);
      });

      eventBus.subscribe("agent.run.started", (event) => {
        received2.push(event);
      });

      eventBus.publish("agent.run.started", {
        runId: "run-1",
        sessionId: "session-1",
        messageId: "msg-1",
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
      expect(received1[0]?.metadata.eventId).toBe(received2[0]?.metadata.eventId);
    });

    test("type safety: correct payload type required", () => {
      eventBus.subscribe("queue.message.enqueued", (event) => {
        // TypeScript ensures correct type
        expect(event.payload.queueLength).toBeDefined();
        // @ts-expect-error - wrong property should fail type check
        expect(event.payload.wrongProperty).toBeUndefined();
      });

      eventBus.publish("queue.message.enqueued", {
        messageId: "msg-1",
        sessionId: "session-1",
        queueLength: 5,
      });
    });

    test("unsubscribe removes handler", async () => {
      const received: SystemEvent<"agent.run.completed">[] = [];

      const unsubscribe = eventBus.subscribe("agent.run.completed", (event) => {
        received.push(event);
      });

      eventBus.publish("agent.run.completed", {
        runId: "run-1",
        sessionId: "session-1",
        messageId: "msg-1",
        duration: 1000,
      });

      await new Promise((resolve) => setImmediate(resolve));
      expect(received).toHaveLength(1);

      // Unsubscribe
      unsubscribe();

      // Publish again
      eventBus.publish("agent.run.completed", {
        runId: "run-2",
        sessionId: "session-1",
        messageId: "msg-2",
        duration: 2000,
      });

      await new Promise((resolve) => setImmediate(resolve));
      expect(received).toHaveLength(1); // Still 1, not 2
    });
  });

  describe("once", () => {
    test("handler called only once", async () => {
      const received: SystemEvent<"agent.response.generated">[] = [];

      eventBus.once("agent.response.generated", (event) => {
        received.push(event);
      });

      // Publish twice
      eventBus.publish("agent.response.generated", {
        runId: "run-1",
        sessionId: "session-1",
        messageId: "msg-1",
        response: "Response 1",
      });

      eventBus.publish("agent.response.generated", {
        runId: "run-2",
        sessionId: "session-1",
        messageId: "msg-2",
        response: "Response 2",
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(received).toHaveLength(1);
      expect(received[0]?.payload.response).toBe("Response 1");
    });

    test("unsubscribe before event works", async () => {
      const received: SystemEvent<"agent.response.generated">[] = [];

      const unsubscribe = eventBus.once("agent.response.generated", (event) => {
        received.push(event);
      });

      // Unsubscribe immediately
      unsubscribe();

      eventBus.publish("agent.response.generated", {
        runId: "run-1",
        sessionId: "session-1",
        messageId: "msg-1",
        response: "Response 1",
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(received).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    test("handler errors are caught and logged", async () => {
      const errorHandler = vi.fn(() => {
        throw new Error("Handler failed");
      });

      eventBus.subscribe("queue.message.dequeued", errorHandler);

      // Should not throw
      expect(() => {
        eventBus.publish("queue.message.dequeued", {
          messageId: "msg-1",
          sessionId: "session-1",
          remainingCount: 0,
        });
      }).not.toThrow();

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorHandler).toHaveBeenCalled();

      // Check stats
      const stats = eventBus.getStats();
      expect(stats.totalErrors).toBeGreaterThan(0);
    });

    test("async handler errors are caught", async () => {
      const errorHandler = vi.fn(async () => {
        throw new Error("Async handler failed");
      });

      eventBus.subscribe("queue.message.retry", errorHandler);

      eventBus.publish("queue.message.retry", {
        messageId: "msg-1",
        sessionId: "session-1",
        retryCount: 1,
        nextRetryAt: Date.now() + 1000,
        error: new Error("Original error"),
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(errorHandler).toHaveBeenCalled();

      const stats = eventBus.getStats();
      expect(stats.totalErrors).toBeGreaterThan(0);
    });
  });

  describe("statistics", () => {
    test("tracks published events", () => {
      eventBus.publish("inbound.message.queued", {
        messageId: "msg-1",
        sessionId: "session-1",
        queuePosition: 0,
        queueLength: 1,
      });

      eventBus.publish("inbound.message.queued", {
        messageId: "msg-2",
        sessionId: "session-1",
        queuePosition: 1,
        queueLength: 2,
      });

      const stats = eventBus.getStats();
      expect(stats.totalEventsPublished).toBe(2);
      expect(stats.eventCounts["inbound.message.queued"]).toBe(2);
    });

    test("tracks delivered events", async () => {
      eventBus.subscribe("agent.run.started", () => {
        // Handler
      });

      eventBus.publish("agent.run.started", {
        runId: "run-1",
        sessionId: "session-1",
        messageId: "msg-1",
      });

      await new Promise((resolve) => setImmediate(resolve));

      const stats = eventBus.getStats();
      expect(stats.totalEventsDelivered).toBe(1);
    });

    test("tracks listener counts", () => {
      const unsub1 = eventBus.subscribe("agent.run.completed", () => {});
      const unsub2 = eventBus.subscribe("agent.run.completed", () => {});

      expect(eventBus.getListenerCount("agent.run.completed")).toBe(2);
      expect(eventBus.hasListeners("agent.run.completed")).toBe(true);

      unsub1();
      expect(eventBus.getListenerCount("agent.run.completed")).toBe(1);

      unsub2();
      expect(eventBus.getListenerCount("agent.run.completed")).toBe(0);
      expect(eventBus.hasListeners("agent.run.completed")).toBe(false);
    });

    test("clearStats resets counters", async () => {
      eventBus.subscribe("agent.run.failed", () => {});

      eventBus.publish("agent.run.failed", {
        runId: "run-1",
        sessionId: "session-1",
        messageId: "msg-1",
        error: new Error("Test error"),
        duration: 1000,
      });

      await new Promise((resolve) => setImmediate(resolve));

      let stats = eventBus.getStats();
      expect(stats.totalEventsPublished).toBeGreaterThan(0);
      expect(stats.totalEventsDelivered).toBeGreaterThan(0);

      eventBus.clearStats();

      stats = eventBus.getStats();
      expect(stats.totalEventsPublished).toBe(0);
      expect(stats.totalEventsDelivered).toBe(0);
      // Listener counts should remain
      expect(stats.listenerCounts["agent.run.failed"]).toBe(1);
    });
  });

  describe("unsubscribeAll", () => {
    test("removes all handlers for event type", async () => {
      const received1: SystemEvent<"queue.message.dead_letter">[] = [];
      const received2: SystemEvent<"queue.message.dead_letter">[] = [];

      eventBus.subscribe("queue.message.dead_letter", (event) => {
        received1.push(event);
      });

      eventBus.subscribe("queue.message.dead_letter", (event) => {
        received2.push(event);
      });

      expect(eventBus.getListenerCount("queue.message.dead_letter")).toBe(2);

      eventBus.unsubscribeAll("queue.message.dead_letter");

      expect(eventBus.getListenerCount("queue.message.dead_letter")).toBe(0);

      eventBus.publish("queue.message.dead_letter", {
        messageId: "msg-1",
        sessionId: "session-1",
        reason: "Max retries exceeded",
        finalError: new Error("Failed"),
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(received1).toHaveLength(0);
      expect(received2).toHaveLength(0);
    });
  });

  describe("shutdown", () => {
    test("removes all listeners", () => {
      eventBus.subscribe("agent.run.started", () => {});
      eventBus.subscribe("agent.run.completed", () => {});
      eventBus.subscribe("queue.message.enqueued", () => {});

      expect(eventBus.getListenerCount("agent.run.started")).toBeGreaterThan(0);

      eventBus.shutdown();

      expect(eventBus.getListenerCount("agent.run.started")).toBe(0);
      expect(eventBus.getListenerCount("agent.run.completed")).toBe(0);
      expect(eventBus.getListenerCount("queue.message.enqueued")).toBe(0);
    });
  });

  describe("metadata", () => {
    test("attaches metadata to events", async () => {
      let receivedEvent: SystemEvent<"system.health.check"> | null = null;

      eventBus.subscribe("system.health.check", (event) => {
        receivedEvent = event;
      });

      const beforePublish = Date.now();

      eventBus.publish("system.health.check", {
        component: "gateway",
        status: "healthy",
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent?.metadata.eventType).toBe("system.health.check");
      expect(receivedEvent?.metadata.source).toBe("test");
      expect(receivedEvent?.metadata.eventId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(receivedEvent?.metadata.timestamp).toBeGreaterThanOrEqual(beforePublish);
    });
  });
});

describe("Global EventBus", () => {
  beforeEach(() => {
    resetGlobalEventBus();
  });

  test("getGlobalEventBus returns singleton", () => {
    const bus1 = getGlobalEventBus();
    const bus2 = getGlobalEventBus();

    expect(bus1).toBe(bus2);
  });

  test("resetGlobalEventBus creates new instance", () => {
    const bus1 = getGlobalEventBus();

    bus1.subscribe("agent.run.started", () => {});
    expect(bus1.getListenerCount("agent.run.started")).toBe(1);

    resetGlobalEventBus();

    const bus2 = getGlobalEventBus();
    expect(bus2.getListenerCount("agent.run.started")).toBe(0);
    expect(bus1).not.toBe(bus2);
  });
});
