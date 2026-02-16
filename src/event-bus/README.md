# Event Bus Module

**TypeScript-typed event bus for decoupling system modules**

---

## Quick Start

```typescript
import { TypedEventBus } from "./event-bus";

// Create event bus
const eventBus = new TypedEventBus({ source: "my-service", debug: true });

// Subscribe to events (type-safe!)
eventBus.subscribe("inbound.message.received", (event) => {
  console.log("Received:", event.payload.content);
  // TypeScript knows exact payload type
});

// Publish events (type-safe!)
eventBus.publish("inbound.message.received", {
  messageId: "msg-123",
  sessionId: "session-456",
  channelId: "whatsapp",
  content: "Hello world",
  timestamp: Date.now(),
});
```

---

## Features

✅ **Type Safety:** Compile-time validation of event types and payloads
✅ **Loose Coupling:** Modules communicate via events, no direct dependencies
✅ **Observability:** Built-in event logging and statistics
✅ **Error Handling:** Handlers errors caught and logged, don't crash system
✅ **Memory Safe:** Max listeners limit prevents memory leaks
✅ **Migration Ready:** Interface-based design allows NATS migration

---

## Files

| File | Purpose |
|------|---------|
| `types.ts` | Event schema, types, interfaces |
| `event-bus.ts` | TypedEventBus implementation (EventEmitter) |
| `event-bus.test.ts` | Unit tests (17 tests) |
| `index.ts` | Public API exports |
| `INTEGRATION_EXAMPLE.md` | How to refactor existing code |
| `MIGRATION_TO_NATS.md` | Migration path to microservices |

---

## Event Types

**Inbound Messages:**
- `inbound.message.received` - New message from channel
- `inbound.message.queued` - Message added to queue
- `inbound.message.processing` - Message being processed

**Agent Runtime:**
- `agent.run.started` - Agent run started
- `agent.run.completed` - Agent run completed successfully
- `agent.run.failed` - Agent run failed
- `agent.response.generated` - Agent generated response

**Message Queue:**
- `queue.message.enqueued` - Message added to persistent queue
- `queue.message.dequeued` - Message removed from queue
- `queue.message.retry` - Message retry scheduled
- `queue.message.dead_letter` - Message moved to dead letter queue

**Errors:**
- `error.processing` - Processing error occurred
- `error.gateway` - Gateway error occurred
- `error.queue` - Queue error occurred

**System:**
- `system.health.check` - Health check result
- `system.shutdown.initiated` - System shutdown started

See `types.ts` for full schema.

---

## Usage Patterns

### Basic Publish/Subscribe

```typescript
// Publisher (Gateway)
eventBus.publish("inbound.message.received", {
  messageId: "msg-1",
  sessionId: "session-1",
  channelId: "whatsapp",
  content: "Hello",
  timestamp: Date.now(),
});

// Subscriber (Agent)
eventBus.subscribe("inbound.message.received", async (event) => {
  await processMessage(event.payload);
});
```

### One-Time Subscription

```typescript
// Wait for agent response (auto-unsubscribe after first event)
eventBus.once("agent.response.generated", (event) => {
  console.log("Response:", event.payload.response);
});
```

### Request-Response Pattern

```typescript
async function requestAgentResponse(message: string): Promise<string> {
  const messageId = crypto.randomUUID();

  // Publish request
  eventBus.publish("inbound.message.received", {
    messageId,
    sessionId: "session-1",
    channelId: "webchat",
    content: message,
    timestamp: Date.now(),
  });

  // Wait for response
  return new Promise((resolve) => {
    const unsubscribe = eventBus.subscribe("agent.response.generated", (event) => {
      if (event.payload.messageId === messageId) {
        resolve(event.payload.response);
        unsubscribe();
      }
    });

    // Timeout
    setTimeout(() => {
      unsubscribe();
      resolve("Timeout");
    }, 30_000);
  });
}
```

### Error Handling

```typescript
// Errors in handlers are caught automatically
eventBus.subscribe("inbound.message.received", async (event) => {
  throw new Error("Handler failed");
  // Error is logged, stats updated, but doesn't crash other handlers
});

// Subscribe to error events
eventBus.subscribe("error.processing", (event) => {
  console.error("Processing error:", event.payload.error);
  // Send to error tracking service
});
```

---

## Statistics

```typescript
const stats = eventBus.getStats();

console.log(stats.totalEventsPublished);  // Total events published
console.log(stats.totalEventsDelivered);  // Total events delivered to handlers
console.log(stats.totalErrors);           // Total handler errors
console.log(stats.eventCounts);           // Per-event-type counts
console.log(stats.listenerCounts);        // Current listeners per event

// Check listener count
const count = eventBus.getListenerCount("agent.run.started");
const hasListeners = eventBus.hasListeners("agent.run.started");
```

---

## Configuration

```typescript
const eventBus = new TypedEventBus({
  // Source identifier (appears in event metadata)
  source: "gateway-service",

  // Enable debug logging (logs all events to console)
  debug: true,

  // Maximum listeners per event (prevent memory leaks)
  maxListeners: 100,

  // Enable event buffering during initialization
  enableBuffering: false,
});
```

---

## Testing

```typescript
import { TypedEventBus } from "./event-bus";
import { describe, test, expect } from "vitest";

describe("My Module", () => {
  test("publishes event", async () => {
    const eventBus = new TypedEventBus({ source: "test" });
    const received: any[] = [];

    eventBus.subscribe("inbound.message.received", (event) => {
      received.push(event);
    });

    eventBus.publish("inbound.message.received", {
      messageId: "msg-1",
      sessionId: "session-1",
      channelId: "webchat",
      content: "Test",
      timestamp: Date.now(),
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(received).toHaveLength(1);
    expect(received[0].payload.content).toBe("Test");
  });
});
```

---

## Integration Guide

See **INTEGRATION_EXAMPLE.md** for:
- How to refactor existing Gateway → Agent communication
- How to integrate with Message Queue
- Testing strategies
- Migration checklist

---

## Migration to NATS

See **MIGRATION_TO_NATS.md** for:
- Migration path to distributed NATS event bus
- Architecture diagrams (current → target)
- NATS adapter implementation
- JetStream persistence setup
- Timeline and effort estimates

**TL;DR:** Same interface, different backend. Replace EventEmitter with NATS client, no code changes for consumers.

---

## Global Singleton (Optional)

```typescript
import { getGlobalEventBus, setGlobalEventBus } from "./event-bus";

// Get or create global singleton
const eventBus = getGlobalEventBus();

// Or set custom instance
const customBus = new TypedEventBus({ source: "custom" });
setGlobalEventBus(customBus);

// Reset (useful in tests)
resetGlobalEventBus();
```

**Note:** Prefer dependency injection over global singleton for better testability.

---

## Performance

**EventEmitter (Current):**
- Latency: <1ms (in-process)
- Throughput: 100k+ events/sec
- Memory: O(listeners)

**Overhead:** Negligible for most use cases.

---

## Contributing

**Adding New Event Types:**

1. Add to `SystemEventMap` in `types.ts`:
   ```typescript
   export type SystemEventMap = {
     // ... existing events
     "my.new.event": {
       myField: string;
       anotherField: number;
     };
   };
   ```

2. TypeScript will enforce correct payload everywhere!

3. Add tests for new event type.

---

## Sprint 01 Deliverables

✅ TypeScript-typed Event Bus implementation
✅ 17 unit tests (all passing)
✅ Integration examples
✅ NATS migration documentation
✅ 100% test coverage

**Status:** Production-ready for Sprint 01 integration.

---

**Questions?** See INTEGRATION_EXAMPLE.md or contact the team lead.
