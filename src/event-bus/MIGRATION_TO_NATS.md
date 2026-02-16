# Migration Path: EventEmitter → NATS

**Status:** Planning Document (Sprint 01)
**Target:** Microservices Architecture (Phase 2)
**Effort:** 2-3 weeks

---

## Overview

This document outlines the migration path from the current in-process EventEmitter-based event bus to NATS for microservices architecture.

**Why NATS?**
- Distributed pub/sub messaging
- High performance (millions of messages/sec)
- Built-in persistence (JetStream)
- Exactly-once semantics
- Language-agnostic (works across Node.js, Go, Python, etc.)
- Simple operations (single binary, minimal config)

---

## Current Architecture (Phase 1)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Gateway   │────▶│  EventBus   │────▶│   Agent     │
└─────────────┘     │(EventEmitter)│     │   Runtime   │
                    └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Message   │
                    │    Queue    │
                    └─────────────┘

- In-process: All modules in same Node.js process
- EventEmitter: Synchronous event delivery
- No persistence: Events lost on crash
- Single instance: No horizontal scaling
```

---

## Target Architecture (Phase 2)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Gateway   │────▶│    NATS     │────▶│   Agent     │
│  (Service)  │     │  JetStream  │     │  (Service)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Message   │
                    │    Queue    │
                    │  (Service)  │
                    └─────────────┘

- Microservices: Each module as separate service
- NATS: Distributed pub/sub with persistence
- Resilient: Events survive crashes (JetStream)
- Scalable: Multiple instances per service
```

---

## Migration Steps

### Step 1: Interface Abstraction (✅ Done in Sprint 01)

**Goal:** Abstract EventBus behind interface so implementation can be swapped.

**Current Code:**
```typescript
// src/event-bus/event-bus.ts
export class TypedEventBus {
  publish<K extends keyof SystemEventMap>(
    eventType: K,
    payload: SystemEventMap[K]
  ): void { ... }

  subscribe<K extends keyof SystemEventMap>(
    eventType: K,
    handler: EventHandler<K>
  ): Unsubscribe { ... }
}
```

**Why it works:**
- Interface is implementation-agnostic
- Can swap EventEmitter → NATS without changing consumers
- TypeScript generics work with any backend

---

### Step 2: Create NATS Adapter (Sprint 05-06)

**Goal:** Implement `TypedEventBus` interface using NATS.

**New File:** `src/event-bus/nats-event-bus.ts`

```typescript
import { connect, type NatsConnection, JSONCodec } from "nats";
import type { EventBusConfig, SystemEventMap, EventHandler } from "./types.js";

export class NatsEventBus implements Pick<TypedEventBus, 'publish' | 'subscribe'> {
  private connection: NatsConnection;
  private codec = JSONCodec();

  async connect(url: string): Promise<void> {
    this.connection = await connect({ servers: url });
  }

  publish<K extends keyof SystemEventMap>(
    eventType: K,
    payload: SystemEventMap[K]
  ): void {
    const subject = this.toNatsSubject(eventType);
    const event = {
      metadata: {
        eventId: crypto.randomUUID(),
        eventType,
        timestamp: Date.now(),
        source: this.config.source,
      },
      payload,
    };

    this.connection.publish(subject, this.codec.encode(event));
  }

  subscribe<K extends keyof SystemEventMap>(
    eventType: K,
    handler: EventHandler<K>
  ): Unsubscribe {
    const subject = this.toNatsSubject(eventType);
    const subscription = this.connection.subscribe(subject);

    (async () => {
      for await (const msg of subscription) {
        const event = this.codec.decode(msg.data);
        await handler(event);
      }
    })();

    return () => subscription.unsubscribe();
  }

  private toNatsSubject<K extends keyof SystemEventMap>(eventType: K): string {
    // Convert "inbound.message.received" → "secretary.inbound.message.received"
    return `secretary.${eventType}`;
  }
}
```

**Testing Strategy:**
1. Unit tests: Same test suite as EventEmitter version
2. Integration tests: With NATS testcontainer
3. Performance tests: Throughput, latency benchmarks

---

### Step 3: Feature Flag for NATS (Sprint 06)

**Goal:** Allow gradual rollout, fallback to EventEmitter if NATS unavailable.

**Config:** `config/event-bus.json`

```json
{
  "eventBus": {
    "type": "nats",  // or "in-process"
    "nats": {
      "url": "nats://localhost:4222",
      "jetstream": true,
      "maxReconnectAttempts": 10
    }
  }
}
```

**Factory Pattern:** `src/event-bus/factory.ts`

```typescript
export function createEventBus(config: EventBusConfig): TypedEventBus {
  if (config.type === "nats") {
    const natsEventBus = new NatsEventBus(config.nats);
    await natsEventBus.connect(config.nats.url);
    return natsEventBus;
  }

  // Fallback to in-process
  return new TypedEventBus({ source: config.source });
}
```

---

### Step 4: JetStream Persistence (Sprint 07)

**Goal:** Enable event persistence for crash recovery.

**JetStream Config:**

```typescript
const jsm = await connection.jetstreamManager();

await jsm.streams.add({
  name: "SECRETARY_EVENTS",
  subjects: ["secretary.>"],
  retention: RetentionPolicy.Workqueue,  // At-least-once delivery
  max_msgs: 1_000_000,
  max_age: 7 * 24 * 60 * 60 * 1000,  // 7 days
  storage: StorageType.File,  // Persistent storage
});
```

**Consumer Config:**

```typescript
const consumer = await jsm.consumers.add("SECRETARY_EVENTS", {
  durable_name: "gateway-service",
  ack_policy: AckPolicy.Explicit,
  max_deliver: 5,  // Retry up to 5 times
  deliver_policy: DeliverPolicy.New,  // Only new messages
});
```

**Benefits:**
- Events survive crashes
- Exactly-once semantics with ack
- Automatic retry on failure
- Replay capability for debugging

---

### Step 5: Service Decomposition (Sprint 08-10)

**Goal:** Split monolith into microservices.

**Services to Extract:**
1. **Gateway Service:** WebSocket/HTTP API
2. **Agent Service:** LLM orchestration
3. **Queue Service:** Message queue management
4. **Avatar Service:** Video generation

**Communication:**
- All services use NATS for pub/sub
- Shared event schema (SystemEventMap)
- Independent scaling per service

**Deployment:**
- Docker Compose (development)
- Kubernetes (production)
- NATS cluster (3+ nodes)

---

## Backwards Compatibility

**Dual-Mode Operation:**

During migration, support both EventEmitter and NATS:

```typescript
class HybridEventBus implements TypedEventBus {
  constructor(
    private localBus: TypedEventBus,
    private natsBus: NatsEventBus | null
  ) {}

  publish<K extends keyof SystemEventMap>(
    eventType: K,
    payload: SystemEventMap[K]
  ): void {
    // Publish to local bus (for in-process handlers)
    this.localBus.publish(eventType, payload);

    // Also publish to NATS (for remote services)
    if (this.natsBus) {
      this.natsBus.publish(eventType, payload);
    }
  }

  subscribe<K extends keyof SystemEventMap>(
    eventType: K,
    handler: EventHandler<K>
  ): Unsubscribe {
    const unsubLocal = this.localBus.subscribe(eventType, handler);
    const unsubNats = this.natsBus?.subscribe(eventType, handler);

    return () => {
      unsubLocal();
      unsubNats?.();
    };
  }
}
```

---

## Performance Considerations

**EventEmitter (Current):**
- Latency: <1ms (in-process)
- Throughput: 100k+ events/sec
- Memory: O(listeners)

**NATS (Target):**
- Latency: ~5-10ms (network overhead)
- Throughput: 1M+ messages/sec (NATS cluster)
- Memory: O(buffer size)

**Optimization:**
- Batch events when possible
- Use NATS core (not JetStream) for ephemeral events
- Enable JetStream only for critical events (message.queued, etc.)

---

## Rollback Plan

**If NATS migration fails:**

1. Revert to EventEmitter via config:
   ```json
   { "eventBus": { "type": "in-process" } }
   ```

2. No code changes needed (interface remains same)

3. Keep NATS adapter code for future retry

---

## Testing Strategy

**Phase 1 (Sprint 01):**
- ✅ Unit tests for EventEmitter implementation
- ✅ Type safety validation
- ✅ Error handling tests

**Phase 2 (Sprint 05-06):**
- Integration tests with NATS testcontainer
- Performance benchmarks (latency, throughput)
- Failover tests (NATS unavailable → fallback)

**Phase 3 (Sprint 07-08):**
- End-to-end tests with microservices
- Chaos testing (kill services, network partitions)
- Load testing (1M+ messages)

---

## Dependencies

**NPM Packages:**
```json
{
  "dependencies": {
    "nats": "^2.28.0"
  },
  "devDependencies": {
    "@testcontainers/nats": "^10.0.0"
  }
}
```

**Infrastructure:**
- NATS server (Docker or Kubernetes)
- JetStream enabled (for persistence)
- Monitoring (NATS metrics)

---

## Monitoring & Observability

**Metrics to Track:**
- Event publish rate (per event type)
- Event delivery latency (p50, p95, p99)
- Error rate (handler failures)
- NATS queue depth (JetStream)
- Consumer lag (time behind)

**Tools:**
- Prometheus + Grafana (metrics)
- Jaeger (distributed tracing)
- NATS monitoring endpoints

---

## Security Considerations

**NATS Authentication:**
- TLS for encryption in transit
- JWT-based authentication
- Subject-level ACLs (restrict who can publish/subscribe)

**Event Schema Validation:**
- Validate payloads against TypeScript types at runtime
- Reject malformed events
- Rate limiting per service

---

## Timeline

| Sprint | Task | Effort |
|--------|------|--------|
| 01 | ✅ EventEmitter implementation | 6-8h |
| 05-06 | NATS adapter + feature flag | 2 weeks |
| 07 | JetStream persistence | 1 week |
| 08-10 | Service decomposition | 3 weeks |

**Total:** ~6-7 weeks for full migration

---

## References

- [NATS Documentation](https://docs.nats.io/)
- [NATS JetStream Guide](https://docs.nats.io/nats-concepts/jetstream)
- [ADR-05: Event Bus Architecture](../docs-secretary/architecture/ADR_05_EVENT_BUS.md)

---

**Status:** Ready for Sprint 05 (NATS implementation)
**Last Updated:** 2026-02-16 (Sprint 01)
