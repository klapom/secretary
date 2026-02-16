# Event Bus Integration Example

**Purpose:** Show how to refactor existing Gateway → Agent communication to use Event Bus.

---

## Before: Direct Function Calls

**Current Pattern (Gateway → Agent):**

```typescript
// src/gateway/server-chat.ts (BEFORE)
import { dispatchInboundMessage } from "../auto-reply/dispatch.js";

async function handleInboundMessage(params: {
  sessionId: string;
  message: string;
}) {
  // Direct function call - tight coupling
  const result = await dispatchInboundMessage({
    ctx: {
      sessionId: params.sessionId,
      body: params.message,
      // ... other fields
    },
    cfg: loadConfig(),
    dispatcher: createReplyDispatcher({ /* ... */ }),
  });

  // Send response back to client
  sendResponse(result);
}
```

**Problems:**
- ❌ Tight coupling: Gateway depends on auto-reply module
- ❌ Hard to test: Must mock dispatchInboundMessage
- ❌ No observability: Can't see message flow
- ❌ No buffering: Messages lost if auto-reply is busy

---

## After: Event Bus Communication

**New Pattern (Gateway → Event Bus → Agent):**

### Step 1: Gateway publishes event

```typescript
// src/gateway/server-chat.ts (AFTER)
import { getGlobalEventBus } from "../event-bus/index.js";

async function handleInboundMessage(params: {
  sessionId: string;
  message: string;
}) {
  const messageId = crypto.randomUUID();
  const eventBus = getGlobalEventBus();

  // Publish inbound message event
  eventBus.publish("inbound.message.received", {
    messageId,
    sessionId: params.sessionId,
    channelId: "webchat",
    content: params.message,
    timestamp: Date.now(),
  });

  // Subscribe to agent response (one-time)
  const responsePromise = new Promise<string>((resolve) => {
    const unsubscribe = eventBus.subscribe("agent.response.generated", (event) => {
      if (event.payload.messageId === messageId) {
        resolve(event.payload.response);
        unsubscribe();
      }
    });

    // Timeout after 30s
    setTimeout(() => {
      unsubscribe();
      resolve("Timeout: No response from agent");
    }, 30_000);
  });

  const response = await responsePromise;
  sendResponse(response);
}
```

### Step 2: Auto-reply subscribes to events

```typescript
// src/auto-reply/event-handlers.ts (NEW FILE)
import { getGlobalEventBus } from "../event-bus/index.js";
import { dispatchInboundMessage } from "./dispatch.js";

export function registerAutoReplyHandlers() {
  const eventBus = getGlobalEventBus();

  // Subscribe to inbound messages
  eventBus.subscribe("inbound.message.received", async (event) => {
    const { messageId, sessionId, content } = event.payload;

    try {
      // Existing dispatch logic
      const result = await dispatchInboundMessage({
        ctx: {
          sessionId,
          body: content,
          // ... other fields
        },
        cfg: loadConfig(),
        dispatcher: createReplyDispatcher({ /* ... */ }),
      });

      // Publish response event
      eventBus.publish("agent.response.generated", {
        runId: result.runId,
        sessionId,
        messageId,
        response: result.reply,
        tokenCount: result.tokenCount,
      });

      // Publish completion event
      eventBus.publish("agent.run.completed", {
        runId: result.runId,
        sessionId,
        messageId,
        duration: Date.now() - event.metadata.timestamp,
      });
    } catch (error) {
      // Publish error event
      eventBus.publish("agent.run.failed", {
        runId: "unknown",
        sessionId,
        messageId,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - event.metadata.timestamp,
      });
    }
  });
}
```

### Step 3: Bootstrap event handlers

```typescript
// src/index.ts or src/gateway/boot.ts
import { registerAutoReplyHandlers } from "./auto-reply/event-handlers.js";

async function bootstrap() {
  // Initialize event bus
  const eventBus = new TypedEventBus({ source: "gateway", debug: true });
  setGlobalEventBus(eventBus);

  // Register all event handlers
  registerAutoReplyHandlers();

  // Start gateway server
  startGatewayServer();
}

bootstrap();
```

---

## Benefits of Event Bus Pattern

✅ **Loose Coupling:**
- Gateway doesn't import auto-reply module
- Modules can be developed/tested independently
- Easy to add new consumers (e.g., analytics, logging)

✅ **Observability:**
- All events logged automatically (if debug enabled)
- Easy to trace message flow: received → processing → completed
- Metrics: event counts, latency, error rates

✅ **Resilience:**
- Message queue can buffer events during high load
- Failed handlers don't crash other handlers
- Retry logic can be added at event level

✅ **Testability:**
- Mock event bus in tests
- Verify events published without mocking complex functions
- Replay events for debugging

---

## Integration with Message Queue

**Combined Pattern: Event Bus + Message Queue**

```typescript
// src/message-queue/event-handlers.ts
import { getGlobalEventBus } from "../event-bus/index.js";
import { messageQueue } from "./message-queue.js";

export function registerQueueHandlers() {
  const eventBus = getGlobalEventBus();

  // Subscribe to inbound messages and enqueue them
  eventBus.subscribe("inbound.message.received", async (event) => {
    const { messageId, sessionId, content } = event.payload;

    // Enqueue message
    await messageQueue.enqueue({
      id: messageId,
      sessionId,
      content,
      priority: 0,
      createdAt: Date.now(),
    });

    // Publish queued event
    eventBus.publish("queue.message.enqueued", {
      messageId,
      sessionId,
      queueLength: await messageQueue.getLength(),
    });
  });

  // Process queue and publish to auto-reply
  startQueueProcessor();
}

async function startQueueProcessor() {
  const eventBus = getGlobalEventBus();

  while (true) {
    const message = await messageQueue.dequeue();
    if (!message) {
      await sleep(100);
      continue;
    }

    // Publish dequeued event (auto-reply will handle it)
    eventBus.publish("inbound.message.processing", {
      messageId: message.id,
      sessionId: message.sessionId,
      runId: crypto.randomUUID(),
    });

    // Auto-reply handler will take over from here
  }
}
```

**Flow:**
1. Gateway: `inbound.message.received` → Event Bus
2. Queue Handler: Receives event → Enqueues → Publishes `queue.message.enqueued`
3. Queue Processor: Dequeues → Publishes `inbound.message.processing`
4. Auto-Reply Handler: Receives event → Processes → Publishes `agent.response.generated`
5. Gateway: Receives response → Sends to client

**Benefits:**
- No module directly calls another module
- Easy to add new steps in the pipeline
- Each module can scale independently

---

## Testing Example

**Unit Test: Verify events published**

```typescript
// src/gateway/server-chat.test.ts
import { describe, test, expect, vi } from "vitest";
import { TypedEventBus } from "../event-bus/index.js";
import { handleInboundMessage } from "./server-chat.js";

describe("handleInboundMessage", () => {
  test("publishes inbound.message.received event", async () => {
    const eventBus = new TypedEventBus({ source: "test" });
    const publishSpy = vi.spyOn(eventBus, "publish");

    await handleInboundMessage({
      sessionId: "session-1",
      message: "Hello",
    });

    expect(publishSpy).toHaveBeenCalledWith(
      "inbound.message.received",
      expect.objectContaining({
        sessionId: "session-1",
        content: "Hello",
      })
    );
  });
});
```

**Integration Test: End-to-end flow**

```typescript
// src/integration/message-flow.test.ts
import { describe, test, expect } from "vitest";
import { TypedEventBus } from "../event-bus/index.js";
import { registerAutoReplyHandlers } from "../auto-reply/event-handlers.js";
import { registerQueueHandlers } from "../message-queue/event-handlers.js";

describe("Message Flow", () => {
  test("gateway → queue → agent → response", async () => {
    const eventBus = new TypedEventBus({ source: "test" });
    const events: string[] = [];

    // Track all events
    eventBus.subscribe("inbound.message.received", () => events.push("received"));
    eventBus.subscribe("queue.message.enqueued", () => events.push("queued"));
    eventBus.subscribe("agent.response.generated", () => events.push("response"));

    // Register handlers
    registerQueueHandlers();
    registerAutoReplyHandlers();

    // Publish inbound message
    eventBus.publish("inbound.message.received", {
      messageId: "msg-1",
      sessionId: "session-1",
      channelId: "webchat",
      content: "Hello",
      timestamp: Date.now(),
    });

    // Wait for async handlers
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(events).toEqual(["received", "queued", "response"]);
  });
});
```

---

## Migration Checklist

**For each module to decouple:**

- [ ] Identify direct function calls between modules
- [ ] Define event types in `SystemEventMap` (src/event-bus/types.ts)
- [ ] Create event handler file (e.g., `event-handlers.ts`)
- [ ] Refactor caller to publish events instead of calling functions
- [ ] Refactor callee to subscribe to events
- [ ] Add event handlers to bootstrap
- [ ] Write unit tests for event publishing
- [ ] Write integration tests for event flow
- [ ] Add debug logging for troubleshooting
- [ ] Update documentation

**Modules to Decouple (Sprint 01):**
1. ✅ Gateway → Auto-Reply (via inbound.message.received)
2. ✅ Gateway → Message Queue (via inbound.message.received)
3. ✅ Message Queue → Auto-Reply (via inbound.message.processing)

---

## Performance Considerations

**Event Bus Overhead:**
- EventEmitter: <1ms per event (negligible)
- Handler execution: Async, non-blocking
- Memory: O(listeners) per event type

**Optimization Tips:**
- Use `once()` for one-time responses (auto-unsubscribe)
- Avoid heavy computation in handlers (offload to workers)
- Batch events if publishing many at once
- Use event buffering during initialization

---

## Debugging

**Enable debug logging:**

```typescript
const eventBus = new TypedEventBus({
  source: "gateway",
  debug: true, // Logs all events
});
```

**Output:**
```
[EventBus] Event published: inbound.message.received { eventId: '...', payload: {...} }
[EventBus] Event delivered: inbound.message.received (1 handlers)
[EventBus] Event published: agent.response.generated { eventId: '...', payload: {...} }
```

**Get statistics:**

```typescript
const stats = eventBus.getStats();
console.log(`Total published: ${stats.totalEventsPublished}`);
console.log(`Total delivered: ${stats.totalEventsDelivered}`);
console.log(`Errors: ${stats.totalErrors}`);
console.log(`Event counts:`, stats.eventCounts);
```

---

**Next Steps:** See MIGRATION_TO_NATS.md for migrating to distributed event bus.
