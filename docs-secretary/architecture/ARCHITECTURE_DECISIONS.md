# Architecture Decision Records (ADR)

# OpenClaw Fork - Verbesserungsvorschläge mit Alternativen

**Datum:** 2026-02-15
**Status:** DISKUSSION

---

## Übersicht der Entscheidungspunkte

Dieser Dokument diskutiert für jeden identifizierten Verbesserungsbereich **drei Alternativen plus die Option, das Original beizubehalten**.

| #      | Entscheidungsbereich                    | Status   |
| ------ | --------------------------------------- | -------- |
| ADR-01 | Architektur: Monolith vs. Microservices | 🟡 Offen |
| ADR-02 | WhatsApp Race Condition Fix             | 🟡 Offen |
| ADR-03 | Sandbox Security Enhancement            | 🟡 Offen |
| ADR-04 | Database: SQLite vs. PostgreSQL         | 🟡 Offen |
| ADR-05 | Message Broker Integration              | 🟡 Offen |
| ADR-06 | Credential Leakage Prevention           | 🟡 Offen |
| ADR-07 | Command Obfuscation Detection           | 🟡 Offen |
| ADR-08 | Deployment Strategy                     | 🟡 Offen |
| ADR-09 | Observability Stack                     | 🟡 Offen |
| ADR-10 | Browser Tab Resource Management         | 🟡 Offen |

---

## ADR-01: Architektur - Monolith vs. Microservices

### Problem

OpenClaw ist aktuell ein monolithischer Prozess, in dem Gateway, Agent Runtime und Tool Execution zusammenlaufen. Dies führt zu:

- Schwieriger horizontaler Skalierung
- Single Point of Failure
- Tight Coupling zwischen Komponenten

### Alternative A: Full Microservices (wie in Spec vorgeschlagen)

**Beschreibung:**

- Separater Service für Gateway, Agent Runtime, Tool Executor
- Message Broker (NATS/RabbitMQ) für asynchrone Kommunikation
- Kubernetes-Deployment mit separaten Pods

**Vorteile:**

- ✅ Unabhängige Skalierung jeder Komponente
- ✅ Bessere Fehler-Isolation (Agent-Crash ≠ Gateway-Crash)
- ✅ Technologie-Freiheit pro Service
- ✅ Einfachere Lastverteilung

**Nachteile:**

- ❌ Deutlich höhere Komplexität
- ❌ Operationale Overhead (Monitoring, Debugging)
- ❌ Latenz durch Netzwerk-Hops
- ❌ Schwieriger für Single-User-Deployments

**Aufwand:** 🔴 Hoch (12-16 Wochen)

---

### Alternative B: Modularer Monolith mit klaren Boundaries

**Beschreibung:**

- Ein Prozess, aber strikte Modul-Grenzen (Hexagonal Architecture)
- Interne Event Bus statt externer Message Broker
- Vorbereitung für spätere Microservices (Strangler Fig Pattern)

**Vorteile:**

- ✅ Einfacher zu deployen und debuggen
- ✅ Keine Netzwerk-Latenz
- ✅ Geringerer Ressourcen-Verbrauch
- ✅ Klare Architektur ohne Distribution

**Nachteile:**

- ❌ Keine unabhängige Skalierung
- ❌ Shared Resource Limits
- ❌ Single Point of Failure bleibt

**Aufwand:** 🟡 Mittel (4-6 Wochen)

---

### Alternative C: Hybrid - Gateway + Agent als Services

**Beschreibung:**

- Gateway bleibt standalone (WebSocket-Handling)
- Agent Runtime als separater Service
- Tool Execution im Agent-Prozess (aber sandboxed)
- Lightweight Message Queue (z.B. Redis Streams)

**Vorteile:**

- ✅ Balance zwischen Einfachheit und Flexibilität
- ✅ Gateway kann horizontal skaliert werden
- ✅ Bessere Isolation als Monolith
- ✅ Moderater Complexity-Increase

**Nachteile:**

- ❌ Immer noch Kopplung (Agent ↔ Tools)
- ❌ Teilweise Vorteile von Microservices

**Aufwand:** 🟡 Mittel (6-8 Wochen)

---

### Alternative D: Original beibehalten (Monolith)

**Beschreibung:**

- Behalte aktuelle Architektur
- Fokus auf Code-Qualität und Refactoring innerhalb Monolith

**Vorteile:**

- ✅ Keine große Umstellung
- ✅ Bewährte Struktur
- ✅ Einfachstes Deployment

**Nachteile:**

- ❌ Skalierungs-Probleme bleiben
- ❌ Single Point of Failure
- ❌ Tight Coupling

**Aufwand:** 🟢 Niedrig (0 Wochen)

---

### 🗳️ Empfehlung zur Diskussion

**Priorisierung:**

1. **Alternative B** (Modularer Monolith) - Bestes Kosten/Nutzen-Verhältnis
2. Alternative C (Hybrid)
3. Alternative D (Original)
4. Alternative A (Full Microservices) - nur bei geplanter Multi-Tenant-Nutzung

**Fragen zur Klärung:**

- Wie viele parallele Benutzer sind geplant? (< 10 → Monolith, > 100 → Microservices)
- Ist horizontale Skalierung ein Hard Requirement?
- Gibt es Budget für Operations-Komplexität?

---

## ADR-02: WhatsApp Race Condition Fix

### Problem

**Kritisches Issue #16918**: Messages gehen verloren, wenn Socket während AI-Verarbeitung reconnected.

**Root Cause:**

```typescript
// PROBLEM: Socket-Referenz wird bei Handler-Erstellung gecaptured
async function onMessage(socket, msg) {
  const capturedSocket = socket; // ← Alt nach Reconnect!

  await processWithAI(msg); // 30+ Sekunden
  // Socket reconnected hier ↑

  await capturedSocket.send(reply); // ← Dead socket!
}
```

### Alternative A: Socket Getter Pattern (Original-Vorschlag)

**Beschreibung:**

```typescript
class SocketManager {
  private currentSocket: Socket;

  getSocket(): Socket {
    return this.currentSocket; // Immer aktuell
  }

  onReconnect(newSocket: Socket) {
    this.currentSocket = newSocket;
  }
}

async function onMessage(socketMgr: SocketManager, msg) {
  await processWithAI(msg);
  await socketMgr.getSocket().send(reply); // ✓ Aktueller Socket
}
```

**Vorteile:**

- ✅ Einfache Implementierung
- ✅ Minimale Code-Änderungen
- ✅ Direkt applicable

**Nachteile:**

- ❌ Race Condition bleibt möglich (Socket wechselt zwischen getSocket() und send())
- ❌ Kein Retry bei Mid-Flight-Disconnect

**Aufwand:** 🟢 Niedrig (2-3 Tage)

---

### Alternative B: Message Queue mit Persistence

**Beschreibung:**

```typescript
class OutboundQueue {
  async enqueue(message: OutboundMessage) {
    // Persistiere in DB
    await db.insert("outbound_queue", {
      messageId: message.id,
      channel: "whatsapp",
      payload: message,
      status: "pending",
      retries: 0,
    });
  }
}

// Separater Worker-Process
class QueueWorker {
  async process() {
    while (true) {
      const msg = await db.getNextPending("outbound_queue");

      try {
        const socket = await getHealthySocket();
        await socket.send(msg.payload);
        await db.markSuccess(msg.id);
      } catch (err) {
        await db.incrementRetry(msg.id);
      }
    }
  }
}
```

**Vorteile:**

- ✅ 100% Delivery Guarantee (bei genügend Retries)
- ✅ Überlebt komplette Prozess-Restarts
- ✅ Metrics über Queue-Depth

**Nachteile:**

- ❌ Höhere Latenz (DB Roundtrip)
- ❌ Mehr Komplexität
- ❌ Braucht Background Worker

**Aufwand:** 🟡 Mittel (1 Woche)

---

### Alternative C: Idempotent Retry mit Correlation IDs

**Beschreibung:**

```typescript
class MessageDelivery {
  private activeDeliveries = new Map<string, Promise>();

  async deliver(message: OutboundMessage, maxRetries = 5) {
    // Deduplizierung via Correlation ID
    const existingDelivery = this.activeDeliveries.get(message.correlationId);
    if (existingDelivery) return existingDelivery;

    const deliveryPromise = this.attemptDelivery(message, maxRetries);
    this.activeDeliveries.set(message.correlationId, deliveryPromise);

    try {
      return await deliveryPromise;
    } finally {
      this.activeDeliveries.delete(message.correlationId);
    }
  }

  private async attemptDelivery(message: OutboundMessage, retriesLeft: number): Promise<void> {
    for (let attempt = 0; attempt <= retriesLeft; attempt++) {
      try {
        const socket = await this.getHealthySocket();
        await socket.send(message);
        return; // Success
      } catch (err) {
        if (attempt === retriesLeft) throw err;
        await this.waitWithExponentialBackoff(attempt);
        // Socket wird beim nächsten getHealthySocket() neu geholt
      }
    }
  }

  private async getHealthySocket(): Promise<Socket> {
    const socket = socketManager.getSocket();
    if (!socket.isConnected()) {
      // Warte auf Reconnect (max 10s)
      await waitForReconnect(10000);
      return socketManager.getSocket();
    }
    return socket;
  }
}
```

**Vorteile:**

- ✅ Robuste Retry-Logik
- ✅ Wartet auf Reconnect statt blind zu retrien
- ✅ Deduplizierung verhindert Double-Sends

**Nachteile:**

- ❌ Nicht persistent (Crash = Verlust)
- ❌ Komplexer als Alternative A

**Aufwand:** 🟡 Mittel (4-5 Tage)

---

### Alternative D: Original beibehalten + Monitoring

**Beschreibung:**

- Issue als "Known Limitation" dokumentieren
- Monitoring für Lost Messages
- User-Feedback: "Bitte erneut senden"

**Vorteile:**

- ✅ Kein Entwicklungsaufwand
- ✅ Evtl. selten genug in Praxis

**Nachteile:**

- ❌ Schlechte User Experience
- ❌ Datenverlust bleibt

**Aufwand:** 🟢 Niedrig (0 Tage)

---

### 🗳️ Empfehlung zur Diskussion

**Priorisierung:**

1. **Alternative C** (Idempotent Retry) - Bester Kompromiss
2. Alternative B (Message Queue) - wenn Persistence kritisch
3. Alternative A (Socket Getter) - Quick Win
4. Alternative D (Original) - nicht empfehlenswert

**Fragen zur Klärung:**

- Wie häufig tritt das Problem in der Praxis auf?
- Ist 100% Delivery ein Hard Requirement?
- Ist <1s zusätzliche Latenz akzeptabel? (für Alternative B)

---

## ADR-03: Sandbox Security Enhancement

### Problem

**Multiple Security Issues:**

- SEC-04: Zugriff auf `~/.ssh`, `~/.aws`, etc. möglich
- SEC-03: Obfuscated Commands umgehen Allowlist
- Potenzielle Sandbox Escapes

### Alternative A: gVisor-basierte Micro-VMs

**Beschreibung:**

- Jede Tool-Execution läuft in gVisor-Container (runsc)
- Komplette Kernel-Isolation via User-Mode Kernel
- Seccomp-BPF + Capability Dropping

```yaml
# gVisor Config
runtime: runsc
platform: ptrace # oder kvm
network: none
filesystem:
  - type: bind
    source: /workspace
    target: /workspace
    readonly: false
  - type: tmpfs
    target: /tmp
    size: 1GB
deny-paths:
  - /home/*/.ssh
  - /home/*/.aws
  - /home/*/.config
  - /etc/passwd
```

**Vorteile:**

- ✅ Stärkste Isolation (Kernel-Level)
- ✅ Syscall-Filtering eingebaut
- ✅ Performance besser als Full VMs

**Nachteile:**

- ❌ Hohe Setup-Komplexität
- ❌ Nicht auf allen Systemen verfügbar (braucht Linux)
- ❌ Debugging schwieriger

**Aufwand:** 🔴 Hoch (2-3 Wochen)

---

### Alternative B: Hardened Docker Container

**Beschreibung:**

- Docker Container mit strengen Security Profilen
- AppArmor/SELinux Policies
- Read-Only Root Filesystem
- Dropped Capabilities

```typescript
const dockerConfig = {
  Image: "alpine:latest",
  HostConfig: {
    ReadonlyRootfs: true,
    NetworkMode: "none",
    CapDrop: ["ALL"],
    CapAdd: ["CHOWN", "DAC_OVERRIDE"], // Minimal
    SecurityOpt: ["no-new-privileges", "apparmor=docker-default"],
    Tmpfs: {
      "/tmp": "rw,noexec,nosuid,size=1g",
    },
    Binds: ["/workspace:/workspace:rw"],
    Ulimits: [
      { Name: "nofile", Soft: 1024, Hard: 1024 },
      { Name: "nproc", Soft: 100, Hard: 100 },
    ],
  },
};
```

**Vorteile:**

- ✅ Docker weit verbreitet und verstanden
- ✅ Gute Isolation
- ✅ Einfacher zu debuggen als gVisor

**Nachteile:**

- ❌ Schwächer als gVisor (Container Escapes möglich)
- ❌ Braucht Docker Daemon
- ❌ Overhead durch Container-Start

**Aufwand:** 🟡 Mittel (1 Woche)

---

### Alternative C: Process Sandboxing + Path Allowlist

**Beschreibung:**

- Native Prozesse mit `chroot` oder `unshare`
- Filesystem-Layer mit allowlist/denylist
- Command Validation + Path Filtering

```typescript
class SandboxedExecutor {
  private readonly DENIED_PATHS = [
    /^\/home\/[^/]+\/\.ssh\//,
    /^\/home\/[^/]+\/\.aws\//,
    /^\/home\/[^/]+\/\.config\//,
    /^\/etc\/(passwd|shadow)/,
    /^\/proc\//,
    /^\/sys\//,
  ];

  async execute(command: string, args: string[]): Promise<Result> {
    // 1. Command Validation
    if (!this.isAllowedCommand(command)) {
      throw new SecurityError("Command not allowed");
    }

    // 2. Path Validation in Args
    for (const arg of args) {
      if (this.isDeniedPath(arg)) {
        throw new SecurityError(`Access to ${arg} denied`);
      }
    }

    // 3. Execute in restricted namespace
    const proc = spawn(command, args, {
      uid: 65534, // nobody
      gid: 65534,
      env: {}, // Empty env
      cwd: "/workspace",
      // Linux Namespaces
      unshare: ["pid", "net", "ipc", "uts"],
    });

    return await this.monitorExecution(proc);
  }

  private isDeniedPath(path: string): boolean {
    return this.DENIED_PATHS.some((pattern) => pattern.test(path));
  }
}
```

**Vorteile:**

- ✅ Kein Docker/gVisor benötigt
- ✅ Schneller Start (keine Container)
- ✅ Einfaches Debugging

**Nachteile:**

- ❌ Schwächste Isolation
- ❌ Path-Bypass möglich (Symlinks, `..`, etc.)
- ❌ Manuelles Management von Namespaces

**Aufwand:** 🟢 Niedrig (3-5 Tage)

---

### Alternative D: Original beibehalten + Warnings

**Beschreibung:**

- Aktuelles Sandbox-Modell beibehalten
- Erweiterte Logging/Warnings bei sensitiven Zuriffen
- User-Education: "Run only in trusted environments"

**Vorteile:**

- ✅ Keine Änderungen nötig
- ✅ Funktioniert wie bisher

**Nachteile:**

- ❌ Security-Risiken bleiben
- ❌ Nicht production-ready für Multi-User

**Aufwand:** 🟢 Niedrig (0 Tage)

---

### 🗳️ Empfehlung zur Diskussion

**Priorisierung:**

1. **Alternative B** (Hardened Docker) - Bester Kompromiss Security/Practicality
2. Alternative C (Process Sandboxing) - Quick Win
3. Alternative A (gVisor) - wenn maximale Security nötig
4. Alternative D (Original) - nur für Single-User Trusted Environments

**Fragen zur Klärung:**

- Wird der Bot in Multi-User-Umgebung laufen?
- Ist Docker eine akzeptable Dependency?
- Wie wichtig ist Tool-Start-Latenz? (<100ms → C, <1s → B, >1s ok → A)

---

## ADR-04: Database - SQLite vs. PostgreSQL

### Problem

Aktuell: SQLite mit gelegentlichen EBUSY-Errors und Connection Leaks.

### Alternative A: PostgreSQL mit Connection Pooling

**Beschreibung:**

- Migration zu PostgreSQL 16+
- Connection Pool (pgBouncer oder pg-pool)
- JSONB für flexible Schema-Teile

```typescript
import { Pool } from "pg";

const pool = new Pool({
  host: "localhost",
  database: "openclaw",
  max: 20, // Connection Pool Size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

class SessionRepository {
  async saveMessage(sessionId: string, message: Message) {
    const client = await pool.connect();
    try {
      await client.query(
        "INSERT INTO messages (session_id, content, metadata) VALUES ($1, $2, $3)",
        [sessionId, message.content, JSON.stringify(message.metadata)],
      );
    } finally {
      client.release(); // Zurück zum Pool
    }
  }
}
```

**Vorteile:**

- ✅ Keine EBUSY-Errors
- ✅ Bessere Concurrent Access
- ✅ ACID-Garantien auch bei hoher Last
- ✅ Full-Text Search eingebaut

**Nachteile:**

- ❌ Braucht separaten Server
- ❌ Höhere Komplexität (Deployment, Backups)
- ❌ Mehr Ressourcen-Verbrauch

**Aufwand:** 🟡 Mittel (1-2 Wochen Migration)

---

### Alternative B: SQLite mit WAL-Mode + Better Connection Management

**Beschreibung:**

- Behalte SQLite, aber mit Optimierungen:
  - WAL (Write-Ahead Logging) Mode
  - Single Writer, Multiple Readers
  - Proper Connection Lifecycle Management

```typescript
import Database from "better-sqlite3";

class SQLiteManager {
  private db: Database.Database;
  private writeQueue: PQueue; // Serialize writes

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Enable WAL mode
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = -64000"); // 64MB cache

    // Single-thread writes
    this.writeQueue = new PQueue({ concurrency: 1 });
  }

  async write(fn: (db: Database.Database) => void) {
    return this.writeQueue.add(() => fn(this.db));
  }

  read(fn: (db: Database.Database) => any) {
    return fn(this.db); // Concurrent reads OK in WAL mode
  }

  close() {
    this.db.close();
  }
}
```

**Vorteile:**

- ✅ Einfaches Deployment (single file)
- ✅ Keine externe Dependency
- ✅ WAL löst viele Concurrency-Issues
- ✅ Geringer Memory-Footprint

**Nachteile:**

- ❌ Limits bei sehr hoher Concurrency
- ❌ Kein Network Access (nur lokal)
- ❌ Schwieriger zu replizieren

**Aufwand:** 🟢 Niedrig (3-5 Tage)

---

### Alternative C: Hybrid - SQLite + Redis

**Beschreibung:**

- SQLite für Persistence (Sessions, History)
- Redis für Hot Data (Active Sessions, Caches)

```typescript
class HybridStorage {
  constructor(
    private sqlite: SQLiteManager,
    private redis: Redis,
  ) {}

  async getActiveSession(sessionId: string): Promise<Session> {
    // Versuche Cache
    const cached = await this.redis.get(`session:${sessionId}`);
    if (cached) return JSON.parse(cached);

    // Fallback zu DB
    const session = this.sqlite.read((db) =>
      db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId),
    );

    // Cache für 1h
    await this.redis.setex(`session:${sessionId}`, 3600, JSON.stringify(session));

    return session;
  }

  async saveMessage(sessionId: string, message: Message) {
    // Persist zu SQLite
    await this.sqlite.write((db) => {
      db.prepare("INSERT INTO messages (session_id, content) VALUES (?, ?)").run(
        sessionId,
        JSON.stringify(message),
      );
    });

    // Invalidiere Cache
    await this.redis.del(`session:${sessionId}`);
  }
}
```

**Vorteile:**

- ✅ Best of Both Worlds
- ✅ Schnelle Reads (Redis)
- ✅ Durable Writes (SQLite)
- ✅ Skalierbar

**Nachteile:**

- ❌ Cache-Invalidierung komplex
- ❌ Zwei Systeme zu maintainen
- ❌ Potential für Inconsistencies

**Aufwand:** 🟡 Mittel (1 Woche)

---

### Alternative D: Original SQLite beibehalten

**Beschreibung:**

- Aktuelles Setup beibehalten
- Connection Leak Bugs fixen (PR #16917)

**Vorteile:**

- ✅ Bewährt und funktioniert
- ✅ Einfach

**Nachteile:**

- ❌ EBUSY-Errors können wiederkehren
- ❌ Concurrency-Limits

**Aufwand:** 🟢 Niedrig (Bug-Fixes only)

---

### 🗳️ Empfehlung zur Diskussion

**Priorisierung:**

1. **Alternative B** (SQLite + WAL) - Low-Hanging Fruit
2. Alternative C (Hybrid) - wenn Skalierung wichtig
3. Alternative D (Original) - wenn "it ain't broke"
4. Alternative A (PostgreSQL) - nur bei Multi-Node Deployment

**Fragen zur Klärung:**

- Wie viele concurrent sessions sind geplant? (<50 → SQLite, >100 → Postgres)
- Ist Single-File-Deployment wichtig?
- Wird Replication/Multi-Node gebraucht?

---

## ADR-05: Message Broker Integration

### Problem

Aktuell: Direkte Kopplung zwischen Gateway und Agent Runtime.

### Alternative A: NATS JetStream

**Beschreibung:**

- Lightweight Message Broker
- Pub/Sub + Streaming
- At-Least-Once Delivery

```typescript
import { connect, JSONCodec } from "nats";

const nc = await connect({ servers: "localhost:4222" });
const jc = JSONCodec();

// Gateway: Publish
await nc.publish(
  "inbound.messages",
  jc.encode({
    sessionId: "session-123",
    message: "Hello",
  }),
);

// Agent: Subscribe
const sub = nc.subscribe("inbound.messages");
for await (const msg of sub) {
  const data = jc.decode(msg.data);
  await processMessage(data);
}
```

**Vorteile:**

- ✅ Sehr lightweight (<20MB RAM)
- ✅ Hoher Throughput
- ✅ Einfaches Pub/Sub

**Nachteile:**

- ❌ Zusätzliche Dependency
- ❌ Netzwerk-Latenz
- ❌ Komplexität bei Single-Node

**Aufwand:** 🟡 Mittel (1 Woche)

---

### Alternative B: Redis Streams

**Beschreibung:**

- Nutze Redis als Message Broker
- Consumer Groups
- Simpler als NATS

```typescript
import Redis from "ioredis";

const redis = new Redis();

// Gateway: Publish
await redis.xadd(
  "inbound:messages",
  "*", // Auto ID
  "sessionId",
  "session-123",
  "message",
  "Hello",
);

// Agent: Consume
while (true) {
  const messages = await redis.xreadgroup(
    "GROUP",
    "agent-group",
    "consumer-1",
    "BLOCK",
    1000,
    "STREAMS",
    "inbound:messages",
    ">",
  );

  for (const [stream, msgs] of messages) {
    for (const [id, fields] of msgs) {
      await processMessage(fields);
      await redis.xack("inbound:messages", "agent-group", id);
    }
  }
}
```

**Vorteile:**

- ✅ Redis evtl. schon vorhanden (Alternative C von ADR-04)
- ✅ Einfache API
- ✅ Persistence optional

**Nachteile:**

- ❌ Redis primär für Caching gedacht
- ❌ Nicht so robust wie dedizierte Message Broker

**Aufwand:** 🟢 Niedrig (3-4 Tage)

---

### Alternative C: In-Process Event Emitter

**Beschreibung:**

- Node.js EventEmitter oder Custom Event Bus
- Kein externer Broker
- Vorbereitung für späteren Broker

```typescript
import EventEmitter from "events";

class MessageBus extends EventEmitter {
  async publish(topic: string, message: any) {
    this.emit(topic, message);
  }

  subscribe(topic: string, handler: (msg: any) => Promise<void>) {
    this.on(topic, async (msg) => {
      try {
        await handler(msg);
      } catch (err) {
        this.emit("error", err);
      }
    });
  }
}

// Usage
const bus = new MessageBus();

// Gateway
bus.publish("inbound.messages", { sessionId: "123", text: "Hi" });

// Agent
bus.subscribe("inbound.messages", async (msg) => {
  await processMessage(msg);
});
```

**Vorteile:**

- ✅ Keine externe Dependency
- ✅ Sehr schnell (in-memory)
- ✅ Einfachstes Deployment
- ✅ Interface-kompatibel für spätere Migration

**Nachteile:**

- ❌ Keine Persistence (Crash = Datenverlust)
- ❌ Single-Process only
- ❌ Keine Delivery-Guarantees

**Aufwand:** 🟢 Niedrig (2-3 Tage)

---

### Alternative D: Original - Direkte Function Calls

**Beschreibung:**

- Behalte aktuelle Architektur
- Gateway ruft Agent-Functions direkt auf

**Vorteile:**

- ✅ Einfachste Lösung
- ✅ Keine Latenz

**Nachteile:**

- ❌ Tight Coupling
- ❌ Schwer zu testen

**Aufwand:** 🟢 Niedrig (0 Tage)

---

### 🗳️ Empfehlung zur Diskussion

**Priorisierung:**

1. **Alternative C** (In-Process Event Bus) - Refactoring ohne Big Bang
2. Alternative B (Redis Streams) - wenn Redis eh genutzt wird
3. Alternative D (Original) - KISS Principle
4. Alternative A (NATS) - nur bei geplanten Microservices

**Fragen zur Klärung:**

- Ist Multi-Process Deployment geplant?
- Ist Message Persistence kritisch?
- Soll Architektur für spätere Distribution vorbereitet sein?

---

## ADR-06: Credential Leakage Prevention

### Problem

**SEC-02**: API Keys und Secrets erscheinen in Session History und Logs.

### Alternative A: Comprehensive Redaction Engine

**Beschreibung:**

- Multi-Layer Redaction (pre-log, pre-storage, pre-export)
- Pattern-basiert + ML-Detection
- Allowlist für false-positives

```typescript
class CredentialRedactor {
  private readonly patterns: RedactionPattern[] = [
    { name: "OpenAI Key", regex: /sk-[a-zA-Z0-9]{48}/g, replacement: "[OPENAI_KEY_REDACTED]" },
    {
      name: "Anthropic Key",
      regex: /sk-ant-[a-zA-Z0-9\-_]{95}/g,
      replacement: "[ANTHROPIC_KEY_REDACTED]",
    },
    { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/g, replacement: "[AWS_KEY_REDACTED]" },
    {
      name: "Private Key",
      regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----[\s\S]+?-----END (RSA |EC )?PRIVATE KEY-----/g,
      replacement: "[PRIVATE_KEY_REDACTED]",
    },
    {
      name: "JWT",
      regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
      replacement: "[JWT_REDACTED]",
    },
    {
      name: "Generic Password",
      regex: /(password|passwd|pwd)["'\s:=]+[^\s"']{8,}/gi,
      replacement: "$1: [REDACTED]",
    },
  ];

  redact(text: string, context: RedactionContext): RedactedResult {
    let redacted = text;
    const findings: Finding[] = [];

    // Pattern-based
    for (const pattern of this.patterns) {
      const matches = text.matchAll(pattern.regex);
      for (const match of matches) {
        findings.push({
          type: pattern.name,
          position: match.index,
          length: match[0].length,
        });
        redacted = redacted.replace(pattern.regex, pattern.replacement);
      }
    }

    // ML-based (optional)
    if (context.useMLDetection) {
      const mlFindings = await this.mlDetector.detect(redacted);
      findings.push(...mlFindings);
      redacted = this.applyMLRedactions(redacted, mlFindings);
    }

    return { text: redacted, findings };
  }
}

// Hook in alle Output-Pfade
class SessionStorage {
  async saveMessage(message: Message) {
    const redacted = credentialRedactor.redact(message.content, {
      useMLDetection: false, // Zu teuer für jeden Save
    });

    await db.insert("messages", {
      ...message,
      content: redacted.text,
      redactionMetadata: redacted.findings,
    });
  }
}
```

**Vorteile:**

- ✅ Comprehensive Protection
- ✅ Mehrere Detection-Layers
- ✅ Audit Trail (was wurde redacted)

**Nachteile:**

- ❌ False Positives möglich
- ❌ Performance-Impact
- ❌ Komplex zu maintainen

**Aufwand:** 🟡 Mittel (1 Woche)

---

### Alternative B: Allowlist + Manual Tagging

**Beschreibung:**

- Tools markieren sensitive Outputs
- Storage respektiert Tags
- Simplified Patterns

```typescript
interface MessageContent {
  text: string;
  sensitivity: "public" | "internal" | "confidential";
  redactInHistory?: boolean;
}

class BashTool {
  async execute(command: string): Promise<ToolResult> {
    const output = await execCommand(command);

    // Auto-detect sensitive commands
    const isSensitive = /\b(export|echo.*KEY|cat.*\.env)\b/i.test(command);

    return {
      output,
      sensitivity: isSensitive ? "confidential" : "public",
      redactInHistory: isSensitive,
    };
  }
}

class SessionStorage {
  async saveMessage(message: MessageContent) {
    const content = message.redactInHistory ? "[SENSITIVE OUTPUT REDACTED]" : message.text;

    await db.insert("messages", { ...message, content });
  }
}
```

**Vorteile:**

- ✅ Explicit > Implicit
- ✅ Tools wissen am besten was sensitive ist
- ✅ Weniger False Positives

**Nachteile:**

- ❌ Braucht Tool-Cooperation
- ❌ Leaky wenn Tool nicht markiert
- ❌ Nicht für User-Input

**Aufwand:** 🟡 Mittel (4-5 Tage)

---

### Alternative C: Simple Regex + Storage Encryption

**Beschreibung:**

- Basic Regex für bekannte Patterns
- Verschlüssele gesamte Session-History at-rest
- Decrypt nur on-demand

```typescript
const SIMPLE_PATTERNS = [
  /sk-[a-zA-Z0-9]{48}/g,
  /sk-ant-[a-zA-Z0-9\-_]{95}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN.*PRIVATE KEY-----[\s\S]+?-----END.*PRIVATE KEY-----/g,
];

function simpleRedact(text: string): string {
  let redacted = text;
  for (const pattern of SIMPLE_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

// + Encryption
import { createCipher } from "crypto";

class EncryptedSessionStorage {
  async saveMessage(message: Message) {
    const redacted = simpleRedact(message.content);
    const encrypted = this.encrypt(redacted);
    await db.insert("messages", { ...message, content: encrypted });
  }

  private encrypt(text: string): string {
    const cipher = createCipher("aes-256-gcm", this.getEncryptionKey());
    return cipher.update(text, "utf8", "hex") + cipher.final("hex");
  }
}
```

**Vorteile:**

- ✅ Defense in Depth (Redaction + Encryption)
- ✅ Einfach zu implementieren
- ✅ Schützt vor DB-Dumps

**Nachteile:**

- ❌ Basic Patterns nur
- ❌ Decrypt-Key muss sicher gespeichert werden
- ❌ Performance-Overhead

**Aufwand:** 🟢 Niedrig (3-4 Tage)

---

### Alternative D: Original + Documentation

**Beschreibung:**

- Dokumentiere Risk
- User-Responsibility: "Nicht in Production"

**Vorteile:**

- ✅ Kein Aufwand

**Nachteile:**

- ❌ Inakzeptables Sicherheitsrisiko

**Aufwand:** 🟢 Niedrig (0 Tage)

---

### 🗳️ Empfehlung zur Diskussion

**Priorisierung:**

1. **Alternative C** (Simple Regex + Encryption) - Quick Win mit gutem ROI
2. Alternative A (Comprehensive) - wenn Compliance wichtig
3. Alternative B (Allowlist) - ergänzend zu A oder C
4. Alternative D (Original) - ❌ NICHT empfohlen

**Fragen zur Klärung:**

- Gibt es Compliance-Requirements (GDPR, SOC2)?
- Sollen User ihre History exportieren können?
- Ist ML-Detection Budget vorhanden?

---

## ADR-07 - ADR-10: Weitere Entscheidungen

### Zusammenfassung der restlichen ADRs

| ADR    | Thema                         | Top-Empfehlung                                          |
| ------ | ----------------------------- | ------------------------------------------------------- |
| ADR-07 | Command Obfuscation Detection | Alternative B: AST-based Parsing + Heuristics           |
| ADR-08 | Deployment Strategy           | Alternative C: Docker Compose mit k8s-Optionalität      |
| ADR-09 | Observability                 | Alternative B: Structured Logging + Optional Prometheus |
| ADR-10 | Browser Tab Management        | Alternative A: Tab Pool mit Limits                      |

**Sollen wir diese im Detail ausarbeiten, oder fokussieren wir uns auf die wichtigsten ADR-01 bis ADR-06?**

---

## Nächste Schritte

1. **Diskussion jedes ADR** - Pro/Contra aus deiner Sicht
2. **Entscheidung treffen** - Welche Alternative pro ADR?
3. **Dependencies identifizieren** - Welche Entscheidungen hängen zusammen?
4. **Priorisierung** - Was zuerst implementieren?
5. **Proof-of-Concept** - Kritische Entscheidungen validieren

**Welchen ADR möchtest du zuerst diskutieren?**
