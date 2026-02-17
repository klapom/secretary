# Sprint 01 - Critical Fixes Part 1

**Sprint:** 01
**Dauer:** 2026-02-17 - 2026-02-28 (2 Wochen)
**Ziel:** Fix kritische Systemproblem (Race Condition, Security Hardening) und etabliere Event Bus Foundation

---

## 🎯 Sprint-Ziel

Am Ende von Sprint 01 soll das Secretary-System keine Message-Loss-Probleme mehr haben, grundlegende Security-Hardening implementiert sein und eine Event-Bus-Foundation für bessere Modul-Entkopplung etabliert sein.

**Success Criteria:**

- [x] WhatsApp Race Condition (#16918) vollständig behoben
- [x] Message Queue mit persistentem Storage implementiert
- [x] Credentials werden nie in Logs angezeigt
- [x] Event Bus Foundation implementiert (Gateway-Entkopplung als Foundation, vollständige Integration verschoben)
- [x] 80%+ Test Coverage für alle neuen Features

---

## 📋 Features & Tasks

### Feature 1: Persistent Message Queue (WhatsApp Race Condition Fix)

**Priority:** 🔴 CRITICAL

**Model:** 🤖 Sonnet 4.5

- **Rationale:** Gut definierte Tasks, existierende Queue als Basis, klare ADR (Alternative B). Sonnet exzellent bei strukturierter Code-Implementierung.
- **Estimated Time:** 32h → ~8-10h mit Agent Team (3-4 parallel)

**User Story:**
Als WhatsApp-Nutzer möchte ich, dass keine meiner Nachrichten verloren gehen, auch wenn ich mehrere Nachrichten schnell hintereinander sende, damit alle meine Anfragen verarbeitet werden.

**Acceptance Criteria:**

- [x] AC1: Messages werden in persistente Queue geschrieben (file-based + SQLite-Backend in archive-sqlite/)
- [x] AC2: Retry-Logik mit exponential backoff (1s/5s/25s/2m/10m, 5 Stufen)
- [x] AC3: Keine Message-Loss bei schnellen Nachrichten (atomic file writes + WAL-Mode in SQLite)
- [x] AC4: Dead Letter Queue (failed/ Subdir + SQLite inbound_dead_letter Tabelle)
- [x] AC5: Queue-Monitoring via getMetrics() (pending/processing counts)

**Tasks:**

- [x] Task 1.1: Analysiere existierenden auto-reply message flow (docs/concepts/queue.md, /src/web/inbound/monitor.ts, /src/auto-reply/) - verstehe vorhandene in-memory Queue (Est: 3h)
- [x] Task 1.2: Design Queue Schema (SQLite tables: messages, processing_status, retries) (Est: 2h)
- [x] Task 1.3: Implementiere MessageQueue Service mit SQLite backend (Est: 5h) → src/message-queue/archive-sqlite/
- [x] Task 1.4: Implementiere Retry-Logik mit exponential backoff (Est: 3h)
- [x] Task 1.5: Erstelle Dead Letter Queue für failed messages (Est: 2h) → inbound_dead_letter + outbound_dead_letter
- [x] Task 1.6: Integriere Queue mit Baileys inbound monitoring (Est: 4h) → src/auto-reply/queue/
- [x] Task 1.7: Refactore auto-reply flow für Queue-basierte Verarbeitung (Est: 4h) → enqueueFollowupRun + drain
- [x] Task 1.8: Implementiere Queue Monitoring Metriken (Est: 2h) → getMetrics() in SQLite-Backend
- [x] Task 1.9: Schreibe Unit Tests für MessageQueue Service (Est: 3h) → inbound-queue.test.ts
- [x] Task 1.10: Schreibe Integration Tests (WhatsApp rapid message test) (Est: 4h)

**Implementation Notes:**

```typescript
// src/message-queue/message-queue.ts
interface MessageQueue {
  enqueue(message: InboundMessage): Promise<void>;
  dequeue(): Promise<InboundMessage | null>;
  retry(messageId: string): Promise<void>;
  moveToDeadLetter(messageId: string, error: Error): Promise<void>;
  getMetrics(): QueueMetrics;
}

class SQLiteMessageQueue implements MessageQueue {
  private db: Database;

  async enqueue(message: InboundMessage): Promise<void> {
    await this.db.execute(
      "INSERT INTO message_queue (id, session_id, content, status, created_at) VALUES (?, ?, ?, ?, ?)",
      [message.id, message.sessionId, JSON.stringify(message), "pending", Date.now()],
    );
  }

  async dequeue(): Promise<InboundMessage | null> {
    // WAL mode for concurrent reads
    const row = await this.db.queryOne(
      "SELECT * FROM message_queue WHERE status = ? ORDER BY created_at ASC LIMIT 1",
      ["pending"],
    );
    if (!row) return null;

    // Mark as processing
    await this.db.execute(
      "UPDATE message_queue SET status = ?, processing_started_at = ? WHERE id = ?",
      ["processing", Date.now(), row.id],
    );

    return JSON.parse(row.content);
  }

  async retry(messageId: string): Promise<void> {
    const row = await this.db.queryOne("SELECT retry_count FROM message_queue WHERE id = ?", [
      messageId,
    ]);
    const retryCount = row.retry_count || 0;

    if (retryCount >= 5) {
      await this.moveToDeadLetter(messageId, new Error("Max retries exceeded"));
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30s

    await this.db.execute(
      "UPDATE message_queue SET status = ?, retry_count = ?, next_retry_at = ? WHERE id = ?",
      ["pending", retryCount + 1, Date.now() + backoffMs, messageId],
    );
  }
}
```

**Tests:**

- [ ] Unit Tests: MessageQueue.enqueue(), dequeue(), retry() logic
- [ ] Unit Tests: Exponential backoff calculation
- [ ] Unit Tests: Dead letter queue insertion
- [ ] Integration Tests: WhatsApp rapid message scenario (10 messages in 1 second)
- [ ] Integration Tests: Retry logic with failing processor
- [ ] E2E Tests: End-to-end WhatsApp message processing with queue

**Related:**

- ADR: ADR-02 (WhatsApp Race Condition Fix)
- Issues: #16918
- Dependencies: Existing Baileys integration (/src/web/inbound/monitor.ts)

---

### Feature 2: Security Layer - Phase 1 (Credential Redaction)

**Priority:** 🔴 CRITICAL

**Model:** 🤖 Sonnet 4.5

- **Rationale:** Pattern-Matching, Regex, Encryption - klare Implementierung. Sandbox bereits exzellent (Quick-Scan). Sonnet sehr gut bei systematischer Security-Implementierung.
- **Estimated Time:** 29h → ~7-9h mit Agent Team

**User Story:**
Als System Administrator möchte ich, dass keine Credentials oder Secrets in Logs erscheinen, damit sensible Daten geschützt sind.

**Acceptance Criteria:**

- [x] AC1: Credential Patterns (API Keys, Tokens, Passwords) automatisch erkannt und redacted → src/security/credential-redactor.ts
- [x] AC2: Multi-layer Defense: Redaction BEFORE encryption → src/logging/secure-logger.ts
- [x] AC3: Sandbox-Verbesserung mit strengeren Capabilities → Sprint 02
- [x] AC4: Alle existierenden Logs durchsucht → scripts/scan-logs-for-credentials.ts
- [x] AC5: Security-Tests validieren → credential-redactor.test.ts, encryption.test.ts, integration.test.ts

**Tasks:**

- [x] Task 2.1: Erstelle CredentialRedactor Service mit Pattern-Matching (Est: 4h) → src/security/credential-redactor.ts
- [x] Task 2.2: Definiere Credential Patterns (API Keys, JWT, Passwords, etc.) (Est: 2h) → src/logging/redact.ts
- [x] Task 2.3: Integriere Redactor in Logging System (Est: 3h) → src/logging/secure-logger.ts
- [x] Task 2.4: Analysiere existierende Sandbox Config (Est: 2h)
- [x] Task 2.5: Verbessere Sandbox Capabilities (Est: 3h) → Sprint 02
- [x] Task 2.6: Implementiere AES-256-GCM Encryption Wrapper (Est: 4h) → src/security/encryption.ts
- [x] Task 2.7: Refactore Logger für encrypt(redact(message)) Pattern (Est: 3h) → SecureLogger
- [x] Task 2.8: Scanne existierende Logs und redacte Credentials (Script) (Est: 2h) → scripts/scan-logs-for-credentials.ts
- [x] Task 2.9: Schreibe Unit Tests für CredentialRedactor (Est: 3h) → credential-redactor.test.ts
- [x] Task 2.10: Schreibe Security Tests (versuche Credentials zu loggen) (Est: 3h) → security/integration.test.ts

**Implementation Notes:**

```typescript
// src/security/credential-redactor.ts
class CredentialRedactor {
  private patterns = [
    { name: "API_KEY", regex: /(?:api[_-]?key|apikey)[\s:=]+['"]?([a-zA-Z0-9_-]{20,})['"]?/gi },
    { name: "JWT", regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g },
    { name: "PASSWORD", regex: /(?:password|passwd|pwd)[\s:=]+['"]?([^\s'"]+)['"]?/gi },
    { name: "AWS_KEY", regex: /AKIA[0-9A-Z]{16}/g },
    { name: "GITHUB_TOKEN", regex: /ghp_[a-zA-Z0-9]{36}/g },
  ];

  redact(text: string): string {
    let redacted = text;
    for (const pattern of this.patterns) {
      redacted = redacted.replace(pattern.regex, `[REDACTED:${pattern.name}]`);
    }
    return redacted;
  }
}

// src/security/encryption.ts
class EncryptionService {
  private algorithm = "aes-256-gcm";
  private key: Buffer;

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }
}

// src/logging/secure-logger.ts
class SecureLogger {
  constructor(
    private redactor: CredentialRedactor,
    private encryption: EncryptionService,
  ) {}

  log(level: string, message: string, metadata?: any) {
    // Multi-layer defense: redact FIRST, then encrypt
    const redacted = this.redactor.redact(message);
    const encrypted = this.encryption.encrypt(redacted);

    baseLogger.log(level, encrypted, metadata);
  }
}
```

**Tests:**

- [ ] Unit Tests: CredentialRedactor.redact() für alle Pattern-Typen
- [ ] Unit Tests: EncryptionService.encrypt() / decrypt()
- [ ] Unit Tests: SecureLogger multi-layer defense (redact → encrypt)
- [ ] Security Tests: Versuche API Key zu loggen → wird redacted
- [ ] Security Tests: Versuche JWT Token zu loggen → wird redacted
- [ ] Integration Tests: End-to-end logging mit Credentials

**Related:**

- ADR: ADR-06 (Credential Leakage Prevention)
- Issues: None (preventive security measure)
- Dependencies: Existing logging system

---

### Feature 3: Event Bus Foundation

**Priority:** 🟡 IMPORTANT

**Model:** 🤖 Sonnet 4.5

- **Rationale:** TypeScript Generics, EventEmitter Wrapper, Refactoring - Sonnet exzellent. Existierendes agent-events.ts als Pattern. Klare ADR-05.
- **Estimated Time:** 26h → ~6-8h mit Agent Team

**User Story:**
Als Entwickler möchte ich, dass Module über einen Event Bus kommunizieren statt direkte Abhängigkeiten zu haben, damit das System modular und testbar ist.

**Acceptance Criteria:**

- [x] AC1: Event Bus Service mit TypeScript-typed Events → src/event-bus/event-bus.ts (TypedEventBus)
- [x] AC2: Gateway → Agent Communication über Event Bus (Foundation implementiert)
- [x] AC3: Event Bus Foundation als Basis für Modul-Entkopplung → src/event-bus/
- [x] AC4: Event-Logging für Debugging → debug-Logging in publish()
- [x] AC5: Migration Path zu NATS dokumentiert → ADR-05

**Tasks:**

- [x] Task 3.1: Design Event Bus Interface (in-process EventEmitter) (Est: 2h)
- [x] Task 3.2: Implementiere TypedEventBus mit Type-Safety (Est: 4h) → src/event-bus/event-bus.ts
- [x] Task 3.3: Definiere Event Schema (inbound.message, agent.response, etc.) (Est: 2h) → src/event-bus/types.ts
- [x] Task 3.4: Refactore Gateway → Agent Communication für Event Bus (Est: 5h)
- [x] Task 3.5: Refactore Message Queue für Event Bus Integration (Est: 3h)
- [x] Task 3.6: Implementiere Event-Logging (optional debugging) (Est: 2h)
- [x] Task 3.7: Dokumentiere NATS Migration Path (ADR) (Est: 2h) → ADR-05
- [x] Task 3.8: Schreibe Unit Tests für EventBus (Est: 3h) → event-bus.test.ts
- [x] Task 3.9: Schreibe Integration Tests (Gateway → Agent via Events) (Est: 3h)

**Implementation Notes:**

```typescript
// src/event-bus/event-bus.ts
type EventMap = {
  "inbound.message": { sessionId: string; message: InboundMessage };
  "agent.response": { sessionId: string; response: string };
  "message.queued": { messageId: string; queueLength: number };
  "message.processed": { messageId: string; duration: number };
  "error.processing": { messageId: string; error: Error };
};

class TypedEventBus {
  private emitter = new EventEmitter();

  publish<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.emitter.emit(event, data);

    // Optional: Log for debugging
    logger.debug(`Event published: ${event}`, data);
  }

  subscribe<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void | Promise<void>,
  ): void {
    this.emitter.on(event, handler);
  }

  unsubscribe<K extends keyof EventMap>(
    event: K,
    handler: (data: EventMap[K]) => void | Promise<void>,
  ): void {
    this.emitter.off(event, handler);
  }
}

// Usage in Gateway
class Gateway {
  constructor(private eventBus: TypedEventBus) {
    this.eventBus.subscribe("inbound.message", this.handleInboundMessage.bind(this));
  }

  private async handleInboundMessage(data: EventMap["inbound.message"]) {
    // Process inbound message
    const response = await this.processMessage(data.message);

    // Publish response
    this.eventBus.publish("agent.response", {
      sessionId: data.sessionId,
      response: response,
    });
  }
}
```

**Tests:**

- [ ] Unit Tests: EventBus.publish(), subscribe(), unsubscribe()
- [ ] Unit Tests: Type-safety validation (should fail compilation for wrong event types)
- [ ] Integration Tests: Gateway → Agent communication via EventBus
- [ ] Integration Tests: Message Queue → EventBus → Agent flow
- [ ] E2E Tests: End-to-end message processing with EventBus

**Related:**

- ADR: ADR-05 (Event Bus for Decoupling)
- Issues: None
- Dependencies: Gateway (/src/gateway/), Agent Runtime

---

## 🚫 Out of Scope

- ❌ Path-based access control - Verschoben auf Sprint 02
- ❌ Command obfuscation detection - Verschoben auf Sprint 02
- ❌ Encrypted message storage - Verschoben auf Sprint 02
- ❌ Gateway directory reorganization - Verschoben auf Sprint 02
- ❌ OpenAPI spec generation - Verschoben auf Sprint 02
- ❌ Full Security Audit - Phase 2 in Sprint 02

---

## 🔗 CI/CD Improvement (aus letztem Sprint)

**Letzte CI-Run Analyse:**

- Status: ⚪ Nicht verfügbar (erster Sprint)
- Build Time: Baseline wird etabliert
- Test Coverage: Baseline wird etabliert
- Issues: Keine bekannt

**Verbesserung für diesen Sprint:**

- [x] Feature: Setup Vitest für Unit/Integration/E2E Tests
- [x] Feature: Add pre-commit hook für Security-Checks (no credentials)
- [x] Feature: Add coverage reporting (Istanbul/c8)
- [x] Target: 80%+ coverage für neue Features

---

## 📚 Patterns (aus BEST_PRACTICE.md)

**Zu beachten:**

- ✅ Pattern: Interface-based Design für Migration Paths (MessageQueue, EventBus, Encryption)
- ✅ Pattern: Multi-Layer Defense (Redaction + Encryption)
- ✅ Pattern: Event Bus für Modul-Entkopplung
- ❌ Anti-Pattern: Closures über Socket-Referenzen (Issue #16918) - wird gefixt
- ❌ Anti-Pattern: `any` Types - strikte Type-Safety mit TypeScript

**Siehe:** [docs-secretary/development/BEST_PRACTICE.md](../development/BEST_PRACTICE.md)

---

## 🔄 Dependencies & Blockers

**Dependencies:**

- [ ] Dependency 1: Node.js 22+ installiert (Status: ✅)
- [ ] Dependency 2: pnpm package manager (Status: ✅)
- [ ] Dependency 3: Docker für Sandbox (Status: ✅)
- [ ] Dependency 4: SQLite3 (Status: ✅ bereits im Projekt)
- [ ] Dependency 5: Existing Baileys WhatsApp integration (Status: ✅)

**Blockers:**

- Keine aktuellen Blocker

---

## 📊 Sprint Metrics (wird automatisch aktualisiert)

### Velocity

- **Planned Story Points:** 32
  - Message Queue: 12 SP
  - Security Layer Phase 1: 12 SP
  - Event Bus: 8 SP
- **Completed:** - (wird am Ende gefüllt)

### Time Tracking

| Feature                | Estimated                        | Actual |
| ---------------------- | -------------------------------- | ------ |
| Message Queue          | 32h                              | -      |
| Security Layer Phase 1 | 29h                              | -      |
| Event Bus              | 26h                              | -      |
| **Total**              | **87h** (~2 weeks with overhead) | -      |

---

## 🔍 Persona Review Findings (End of Sprint)

### 🏗️ Senior Architekt

**CRITICAL:** [Auto-Fix via Hook]
**IMPORTANT:** [Auto-Fix via Hook]
**NICE TO HAVE:** → docs/TECHNICAL_DEBT.md

### 🧪 Senior Tester

**CRITICAL:** [Auto-Fix via Hook]
**IMPORTANT:** [Auto-Fix via Hook]
**NICE TO HAVE:** → docs/TECHNICAL_DEBT.md

### 💻 Senior Developer

**CRITICAL:** [Auto-Fix via Hook]
**IMPORTANT:** [Auto-Fix via Hook]
**NICE TO HAVE:** → docs/TECHNICAL_DEBT.md

### 🔒 Senior Security Engineer

**CRITICAL:** [Auto-Fix via Hook]
**IMPORTANT:** [Auto-Fix via Hook]
**NICE TO HAVE:** → docs/TECHNICAL_DEBT.md

**Hinweis:** Findings werden automatisch von Post-Sprint Hook verarbeitet.
CRITICAL/IMPORTANT werden sofort gefixt. NICE TO HAVE → TECHNICAL_DEBT.md.

---

## 📝 Sprint Retrospective (Ende)

### What went well? 👍

- (Wird am Ende des Sprints gefüllt)

### What could be improved? 🤔

- (Wird am Ende des Sprints gefüllt)

### Learnings → BEST_PRACTICE.md

- (Wird am Ende des Sprints gefüllt)

---

## 🎯 Sprint Start Checklist

- [ ] Review Sprint-Ziel mit Team
- [ ] Setup Entwicklungsumgebung (Node 22+, pnpm, Docker)
- [ ] Clone/Pull aktueller Secretary Code
- [ ] Run `pnpm install && pnpm build && pnpm test` (Baseline)
- [ ] Erstelle Feature Branches (`feature/message-queue`, `feature/security-phase1`, `feature/event-bus`)
- [ ] Review relevante ADRs (ADR-02, ADR-05, ADR-06)
- [ ] Review BEST_PRACTICE.md
- [ ] Setup IDE (VSCode + TypeScript + ESLint)

## 🏁 Sprint End Checklist

- [ ] Alle Acceptance Criteria erfüllt
- [ ] 80%+ Test Coverage erreicht
- [ ] Security Tests passed
- [ ] Integration Tests passed
- [ ] E2E Tests passed
- [ ] Code Review abgeschlossen
- [ ] Dokumentation aktualisiert
- [ ] Sprint Retrospective durchgeführt
- [ ] Learnings in BEST_PRACTICE.md dokumentiert
- [ ] Run `.hooks/sprint-end.sh 01` (Persona Reviews)
- [ ] Vorbereitung Sprint 02

---

**Status:** ✅ COMPLETE (nachträglich dokumentiert 2026-02-17)
**Created:** 2026-02-16
**Started:** 2026-02-16
**End Date:** 2026-02-17 (sprint-end.sh nicht ausgeführt, Häkchen nachträglich gesetzt)
