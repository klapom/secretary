# Best Practices & Lessons Learned

**Purpose:** Kurze, prägnante Dokumentation von Patterns, die funktionieren (und solchen, die nicht funktionieren).

**Format:** Knapp halten! Maximal 3-5 Zeilen pro Item.

**Update:** Nach jedem Sprint mit neuen Learnings erweitern!

---

## 📚 Documentation Update Strategy

**Regel:** Feature implementiert? Dokumentation aktualisieren!

### Wann docs/ (System Docs) updaten?

| Change Type                    | Action                 | Beispiel                                 |
| ------------------------------ | ---------------------- | ---------------------------------------- |
| **Neues Feature**              | Neue doc erstellen     | `docs/concepts/persistent-queue.md`      |
| **Feature geändert**           | Bestehende doc updaten | `docs/security/credentials.md` erweitern |
| **Breaking Change**            | Migration guide        | `docs/migration/event-bus.md`            |
| **Bug Fix**                    | Meist nicht nötig      | Evtl. Troubleshooting erweitern          |
| **Refactor (kein API change)** | Nicht nötig            | Interne Änderung                         |
| **Neue API**                   | API docs               | `docs/gateway/api.md` erweitern          |

### Template für neue Feature Docs

```markdown
---
summary: "One-line description"
read_when:
  - Scenario when to read this
title: "Feature Name"
---

# Feature Name (YYYY-MM-DD)

Was ist das und warum gibt's das?

## Why

- Problem
- Use cases

## How it works

- Architektur
- Key concepts

## Configuration

[Code example]

## Troubleshooting

- Common issues
```

### Sprint End Checklist - Documentation

**Vor Sprint-Abschluss:**

1. ✅ Alle neuen Features listen
2. ✅ docs-secretary/ updaten (Sprint file, BEST_PRACTICE, ADRs)
3. ✅ docs/ updaten (neue/geänderte Features)
   - Neue Docs erstellen mit frontmatter (summary, read_when, title)
   - **docs/docs.json** Navigation aktualisieren (Mintlify-Struktur)
4. ✅ CHANGELOG.md erweitern

---

## 🔍 Codebase-spezifische Patterns (Quick-Scan 2026-02-16)

**Hinweis:** Diese Patterns wurden aus dem vorhandenen Code (3,009 TS-Dateien) extrahiert. Sprint-spezifische Patterns werden während der Arbeit ergänzt.

### WhatsApp/Baileys Integration (`src/web/inbound/`)

**Pattern: Debouncer für Rapid Messages**

- Was: Batching von schnell aufeinanderfolgenden Messages vom gleichen Sender
- Code: `createInboundDebouncer<T>` in `inbound-debounce.ts`
- Warum: Verhindert Message-Spam, kombiniert "message1\nmessage2\nmessage3" zu einer
- Implementation:
  ```typescript
  const debouncer = createInboundDebouncer<WebInboundMessage>({
    debounceMs: 1000,
    buildKey: (msg) => `${msg.accountId}:${msg.chatId}:${msg.sender}`,
    onFlush: async (entries) => {
      const combined = entries.map((e) => e.body).join("\n");
      await processMessage(combined);
    },
  });
  ```

**Pattern: Caching mit TTL**

- Was: Group metadata cache mit 5min TTL
- Code: `src/web/inbound/monitor.ts` Zeile 115-152
- Warum: Reduziert Baileys API calls, verbessert Performance
- Implementation: `Map<string, {data, expires}>` mit timestamp check

**Pattern: Deduplication**

- Was: `isRecentInboundMessage(key)` verhindert doppelte Verarbeitung
- Warum: Baileys kann Messages mehrfach liefern (notify + append events)
- Code: `src/web/inbound/dedupe.ts`

**🤔 Zu prüfen: Socket Closure Pattern**

- Issue #16918: Closures über Socket-Referenzen können stale werden
- Aktuell: Socket wird bei `monitorWebInbox` erstellt und in closures verwendet
- Best Practice: Socket Getter Pattern `socketManager.getSocket()` bei Nutzung

### Logging System (`src/logging/`)

**Pattern: Structured Logging mit TsLog**

- Was: `tslog` Library für strukturiertes JSON-Logging
- Code: `src/logging/logger.ts`
- Features:
  - Child loggers mit Context: `getChildLogger({ module: "web-inbound" })`
  - Log rotation (24h retention, auto-cleanup)
  - External transports pattern
  - Config hierarchy: Override → Config → Default

**Pattern: Never Block on Logging Failures**

- Was: Logging failures dürfen nie die App crashen
- Code: Try/catch in transports ohne re-throw (logger.ts Zeile 45-49)
- Warum: Logging ist observability, nicht kritische Funktionalität
- Implementation:
  ```typescript
  attachExternalTransport(logger, (logObj) => {
    try {
      transport(logObj);
    } catch {
      // never block on logging failures
    }
  });
  ```

**Pattern: setTimeout.unref()**

- Was: `timeout.unref?.()` verhindert dass Timer den Process am Leben halten
- Code: `inbound-debounce.ts` Zeile 82
- Warum: Node.js process kann cleanen beendet werden trotz pending timers

### Sandbox Security (`src/agents/sandbox/`)

**Pattern: Secure-by-Default Docker Config**

- Was: Sehr sichere Default-Werte für Sandbox
- Code: `src/agents/sandbox/config.ts` Zeile 72-96
- Defaults:
  ```typescript
  {
    readOnlyRoot: true,           // File system read-only
    network: "none",              // Keine Netzwerk-Zugriff
    capDrop: ["ALL"],             // Alle Linux capabilities gedropped
    tmpfs: ["/tmp", "/var/tmp"],  // Nur tmpfs writeable
    security-opt: "no-new-privileges"  // Immer gesetzt
  }
  ```
- ✅ **EXZELLENT:** Diese Defaults sind bereits sehr sicher!

**Pattern: Hierarchische Sandbox Config**

- Was: Agent-spezifische Overrides über Global Config
- Warum: Browser-Sandbox braucht `network: "bridge"`, aber Tools brauchen `network: "none"`
- Code: `resolveSandboxDockerConfig()` merged agentDocker + globalDocker

### Error Handling

**Pattern: Config Resolution mit Fallbacks**

- Was: Hierarchische Config: Override → ByChannel → Base → Default
- Code: Überall (inbound-debounce, logger, sandbox)
- Implementation:
  ```typescript
  const value = override ?? byChannel ?? base ?? DEFAULT;
  ```

**Pattern: Input Validation vor Processing**

- Was: `Math.max(0, Math.trunc(value))` für numeric inputs
- Warum: Verhindert negative Werte und floats wo integers erwartet
- Code: `inbound-debounce.ts` Zeile 4-9, 49

**Pattern: Optional Chaining überall**

- Was: `?.` operator statt defensive checks
- Beispiel: `params.onError?.(err)` statt `if (params.onError) params.onError(err)`
- Warum: Cleaner, TypeScript-idiomatisch

### Testing

**Pattern: Test Mode Detection**

- Was: `process.env.VITEST === "true"` für test-spezifisches Verhalten
- Code: `src/logging/logger.ts` Zeile 67
- Beispiel: Default log level "silent" in tests

**Pattern: ESLint Disables mit Begründung**

- Was: `// eslint-disable-next-line rule-name -- reason`
- Beispiele im Code:
  - `no-await-in-loop -- sequential processing intended`
  - `no-implied-eval -- required for browser-context eval`
- ✅ **GUT:** Alle Disables haben klare Begründung

---

## ✅ Erfolgreiche Patterns

### Architecture

**Pattern: Interface-based Design für Migration Paths**

- Sprint: 01
- Was: Alle austauschbaren Komponenten (DB, Event Bus, Sandbox) hinter Interfaces
- Warum: Ermöglicht späteren Austausch (SQLite→Postgres, Docker→gVisor) ohne Rewrites
- Code: `interface Database { query(), execute() }` → `class SQLiteDB implements Database`

**Pattern: Event Bus für Modul-Entkopplung**

- Sprint: 02
- Was: Kommunikation zwischen Modulen via Event Bus statt direkte Calls
- Warum: Module isoliert testbar, keine zirkulären Dependencies
- Code: `eventBus.publish('inbound.message', msg)` statt `agent.processMessage(msg)`

---

### Security

**Pattern: Multi-Layer Defense (Redaction + Encryption)**

- Sprint: 05
- Was: Credentials ERST redacten, DANN verschlüsseln
- Warum: Falls Encryption-Key kompromittiert, sind Secrets trotzdem redacted
- Code: `encrypt(redact(text))` nicht `redact(encrypt(text))`

**Pattern: Kill Switch als Singleton mit Persistent State**

- Sprint: 02
- Was: Kill Switch State überlebt Restarts (File-based)
- Warum: System bleibt shut down auch nach Crash/Restart bis manuell cleared
- Code: `killSwitch.loadPersistedState()` in Constructor

---

### Testing

**Pattern: Testcontainers für Integration Tests**

- Sprint: XX
- Was: PostgreSQL/Redis als Docker Container in Tests
- Warum: Realistische Tests ohne Mocks, automatisches Cleanup
- Code: `const postgres = await new PostgreSQLContainer().start()`

**Pattern: Parallel Test Execution**

- Sprint: XX
- Was: Unit Tests parallel, Integration Tests sequentiell
- Warum: Schneller CI/CD (Unit: 10s statt 60s)
- Config: `jest --maxWorkers=4` für Unit, `--runInBand` für Integration

---

### Performance

**Pattern: Message Queue mit Background Worker**

- Sprint: 02
- Was: Outbound Messages in Queue → Worker sendet async
- Warum: Keine Blocking I/O, Retry-Logic entkoppelt
- Impact: Latenz -40% (von 2s auf 1.2s)

---

### Code Quality

**Pattern: Single Responsibility per Module**

- Sprint: XX
- Was: `message-queue.ts` macht NUR Queue, nicht auch Validation
- Warum: Einfacher zu testen, zu verstehen, zu ändern
- Bad: `processAndSendMessage()` → Good: `process()` + `send()`

---

## ❌ Anti-Patterns & Irrwege

### Was NICHT tun

**Anti-Pattern: Closures über Socket-Referenzen**

- Sprint: 02
- Problem: `const socket = getCurrentSocket(); setTimeout(() => socket.send())` → Stale reference
- Fix: Socket Getter Pattern: `socketManager.getSocket()` bei Nutzung
- Issue: #16918 (WhatsApp Race Condition)

**Anti-Pattern: `any` Types für "schnelle" Implementierung**

- Sprint: XX
- Problem: Type Safety verloren, Bugs erst zur Runtime
- Fix: Zeit nehmen für richtige Typen, später schwerer nachzurüsten
- Rule: `no-explicit-any` in ESLint aktivieren

**Anti-Pattern: Secrets in Environment Variables ohne Encryption**

- Sprint: XX
- Problem: `.env` Files im Repo, Secrets in Logs
- Fix: Secrets Manager + Encryption at Rest
- Tool: `dotenv` + `node-vault` oder `@aws-sdk/client-secrets-manager`

**Anti-Pattern: Fehlende Error Boundaries bei Async Operations**

- Sprint: XX
- Problem: Unhandled Promise Rejections → Prozess crasht
- Fix: `try/catch` bei allen async ops + Global Error Handler
- Code: `process.on('unhandledRejection', (err) => logger.error(err))`

**Anti-Pattern: Docker Container als Root User**

- Sprint: 03
- Problem: Security Risk, Privilege Escalation möglich
- Fix: `USER node` in Dockerfile, nie `USER root`
- Check: `docker exec container whoami` → sollte nicht `root` sein

---

## 🔄 Refactoring Opportunities

### Wenn Zeit ist (Technical Debt)

**Opportunity: Consistent Error Handling**

- Sprint: XX
- Was: Aktuell verschiedene Error-Formate pro Modul
- Sollte: Einheitliche Error-Klassen (`AppError`, `ValidationError`, etc.)
- Aufwand: 1-2 Tage
- Priority: Medium

---

## 🛠️ Tool-spezifische Tipps

### TypeScript

**Tip: Nutze `unknown` statt `any`**

```typescript
// ❌ BAD
function process(data: any) {}

// ✅ GOOD
function process(data: unknown) {
  if (typeof data === "string") {
    // Type narrowing
  }
}
```

**Tip: Branded Types für IDs**

```typescript
// Verhindert Mix-up von Session-IDs und User-IDs
type SessionId = string & { readonly brand: unique symbol };
type UserId = string & { readonly brand: unique symbol };

function getSession(id: SessionId) {}
getSession("abc" as SessionId); // OK
getSession(userId); // Type Error ✅
```

---

### Docker

**Tip: Multi-Stage Builds für kleinere Images**

```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --production
CMD ["node", "dist/index.js"]
```

Result: Image size -60% (von 1.2GB auf 480MB)

---

### Testing

**Tip: Test-Helpers für Wiederverwendbarkeit**

```typescript
// tests/helpers/fixtures.ts
export const createTestMessage = (overrides?: Partial<Message>) => ({
  id: "test-msg-123",
  sessionId: "test-session",
  content: "Hello",
  ...overrides,
});

// In Tests:
const msg = createTestMessage({ content: "Custom" });
```

---

## 📊 Metrics & Benchmarks

### Performance Baselines (Sprint XX)

| Operation              | Baseline | Target | Actual  |
| ---------------------- | -------- | ------ | ------- |
| Message Processing     | -        | <2s    | 1.2s ✅ |
| LLM API Call           | -        | <3s    | 2.5s ✅ |
| Database Write (WAL)   | -        | <10ms  | 5ms ✅  |
| Docker Container Start | -        | <2s    | 1.8s ✅ |

**Tool:** `hyperfine` für Benchmarking

---

## 🔐 Security Checklist (vor jedem Merge)

- [ ] Keine Secrets im Code
- [ ] Input Validation für alle externen Daten
- [ ] SQL Injection Prevention (Prepared Statements)
- [ ] XSS Prevention (Sanitize HTML)
- [ ] CSRF Protection (für Web APIs)
- [ ] Rate Limiting implementiert
- [ ] Error Messages geben keine internen Details preis
- [ ] Dependencies aktuell (`npm audit`)

---

## 📚 Hilfreiche Ressourcen

**TypeScript:**

- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [Effective TypeScript](https://effectivetypescript.com/)

**Testing:**

- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Playwright Docs](https://playwright.dev/)

**Docker:**

- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)

**Node.js:**

- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

## 🎓 Lessons per Sprint

### Sprint 01

- ✅ WAL Mode für SQLite verhindert EBUSY-Errors
- ❌ Erste Version hatte Race Condition im Event Bus (fixed)

### Sprint 02

- ✅ Kill Switch Persistent State funktioniert perfekt
- ❌ Vergessen `.env` in `.gitignore` (fixed before commit)

### Sprint 03

- ✅ Docker Sandbox mit `--cap-drop=ALL` ist sehr sicher
- ⚠️ GPU Passthrough braucht spezielle Config (`--gpus all`)

---

**Last Updated:** Sprint XX
**Nächstes Review:** Sprint XX+1
