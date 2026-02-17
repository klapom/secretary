# Developer Quick Reference - Secretary

**Keep this in context at all times during development.**

---

## 🎯 Current Status

- **Project:** Secretary (ex-OpenClaw) - Personal AI Assistant
- **Phase:** Sprint 01 - Critical Fixes Part 1
- **Timeline:** Week 1-2 of 8-10 weeks
- **Focus:** Message Queue + Security + Event Bus

---

## 📚 Documentation Map

### Our Planning Docs (`docs-secretary/`)

Quick access to what we're building/changing:

- **[INDEX](docs-secretary/INDEX.md)** - Central planning index
- **[Sprint 01 Plan](docs-secretary/sprints/SPRINT_01.md)** ⭐ CURRENT SPRINT
- **[Roadmap V2](docs-secretary/planning/IMPLEMENTATION_ROADMAP_V2.md)** - 8-10 week plan
- **[Best Practices](docs-secretary/development/BEST_PRACTICE.md)** - Patterns & anti-patterns
- **[ADRs](docs-secretary/architecture/)** - Architecture decisions

### Original Secretary Docs (`docs/`)

How the existing system works (Mintlify documentation website):

- **[docs/index.md](docs/index.md)** - Main Secretary documentation
- **[docs/docs.json](docs/docs.json)** - Mintlify navigation structure (update when adding new docs!)
- **[Architecture](docs/concepts/architecture.md)** - Gateway architecture
- **[Models](docs/concepts/models.md)** - LLM providers & config
- **[Sessions](docs/concepts/sessions.md)** - Session management
- **[Queue](docs/concepts/queue.md)** - Message queue concepts
- **[Agent Loop](docs/concepts/agent-loop.md)** - How agent turns work
- **[Multi-Agent](docs/concepts/multi-agent.md)** - Subagents & routing
- **[Memory](docs/concepts/memory.md)** - Conversation memory
- **[WhatsApp](docs/whatsapp/)** - WhatsApp/Baileys integration
- **[Channels](docs/channels/)** - All 36 channel plugins
- **[Tools](docs/tools/)** - Built-in tools documentation
- **[Gateway API](docs/gateway/)** - Gateway protocol & API

---

## 🏗️ Codebase Structure

> **⚠️ CRITICAL für alle Agenten:** Erstelle NIEMALS neue Ordner im Top-Level-Verzeichnis (`/openclaw-source/`)!
> Alle neuen Dateien gehören in die unten definierten Verzeichnisse. Lies "File Placement Rules" weiter unten!

```
openclaw-source/                  ← TOP LEVEL (kein neues Verzeichnis hier anlegen!)
├── src/                          ← TypeScript-Quellcode (alles Neue gehört hierhin)
│   ├── avatar/                   # Avatar-System (Sprint 03)
│   │   ├── streaming/            #   WebRTC + Media Bridge
│   │   └── ui/                   #   Avatar-UI (HTML/JS)
│   ├── characters/               # Character Manager (Sprint 03)
│   ├── gateway/                  # Gateway server (HTTP/WS API)
│   ├── web/                      # WhatsApp/Baileys integration
│   ├── agents/                   # Agent runtime & tools
│   │   ├── tools/               #   20+ built-in tools
│   │   ├── sandbox/             #   Docker sandbox
│   │   └── tool-policy.ts       #   Tool security
│   ├── auto-reply/              # Message handling & dispatch
│   ├── channels/                # Channel abstraction layer
│   ├── config/                  # Configuration system
│   └── sessions/                # Session management
├── docker/                       ← Docker-Services (Python Microservices)
│   ├── xtts/                     #   XTTS TTS-Service (port 8082)
│   ├── distil-whisper/           #   Whisper STT-Service (port 8083)
│   ├── liveportrait/             #   LivePortrait-Service (port 8081)
│   └── docker-compose.dgx.yml   #   Compose-File (das einzige, das wir nutzen!)
├── docs/                         ← System-Dokumentation (Mintlify)
│   ├── avatar/                   #   Avatar-Docs (neu in Sprint 03)
│   └── concepts/                 #   Technische Konzepte
├── docs-secretary/               ← Planungsdokumentation
│   ├── sprints/                  #   Sprint-Pläne (SPRINT_03.md etc.)
│   ├── architecture/             #   ADRs
│   └── development/             #   BEST_PRACTICE.md
├── extensions/                   ← 36 Channel-Plugins
├── skills/                       ← 52 Pre-built Skills
└── test/                         ← Test-Dateien (wenn nicht neben der Quelle)
```

### 🚫 File Placement Rules — IMMER EINHALTEN

**Neuer TypeScript-Code:** → `src/[feature]/`
**Neuer Python-Service:** → `docker/[service-name]/`
**Neue Planungs-Doku:** → `docs-secretary/[sprints|architecture|development]/`
**Neue System-Doku:** → `docs/[avatar|concepts|...]/`
**Tests:** → Neben der Quelldatei (z.B. `src/avatar/streaming/foo.test.ts`) ODER `test/`
**Konfiguration:** → Existierende Config-Dateien ergänzen, keine neuen Top-Level-Configs

**❌ VERBOTEN:**

```
openclaw-source/MyNewFolder/     ← NIEMALS neuen Ordner im Top-Level!
openclaw-source/some-docs/       ← FALSCH
openclaw-source/liveportrait/    ← FALSCH (gehört nach docker/liveportrait/)
openclaw-source/avatar-ui/       ← FALSCH (gehört nach src/avatar/ui/)
```

---

## ⚡ Quick Commands

```bash
# Development
pnpm install            # Install dependencies
pnpm dev               # Start dev server
pnpm build             # Build for production
pnpm test              # Run all tests

# Gateway
secretary gateway --port 18789    # Start gateway
secretary onboard                 # Setup wizard

# Sprint workflow
./.hooks/sprint-start.sh 01 "Critical Fixes Part 1"
./.hooks/sprint-end.sh 01
```

---

## 🔴 Sprint 03 Quick Reference (CURRENT)

**Goal:** Avatar System — LivePortrait, WebRTC Streaming, Character Manager

**Status (2026-02-17):**

- ✅ XTTS Voice Synthesis — Docker port 8082, GPU, 0.5-0.7s latency
- ✅ Whisper STT — Docker port 8083, GPU, float16, Deutsch korrekt
- ✅ WebRTC TypeScript-Code — `src/avatar/streaming/` (nicht integriert)
- ✅ Character Manager Code — `src/characters/` (nicht in API integriert)
- 🔲 **LivePortrait** — BLOCKER: `docker/liveportrait/liveportrait_service.py` ist Stub

**Key Files Sprint 03:**

- `docker/liveportrait/liveportrait_service.py` — Python-Service (TODO implementieren)
- `docker/liveportrait/Dockerfile.arm64` — Docker Build für ARM64/DGX
- `src/avatar/streaming/` — WebRTC + Media Bridge (TypeScript)
- `src/avatar/streaming/webrtc-server.ts` — WebRTC Signaling
- `src/avatar/streaming/media-bridge.ts` — Media Streaming Bridge
- `src/characters/` — Character Manager (TypeScript)
- `docker/SETUP_A_STATUS.md` — Service-Status + API-Dokumentation

**Running Services:**

- `secretary-xtts` → http://localhost:8082
- `secretary-distil-whisper` → http://localhost:8083
- LivePortrait → http://localhost:8081 (NOCH NICHT GESTARTET)

**Compose Command:**

```bash
cd /home/admin/projects/secretary/openclaw-source/docker/
docker compose -f docker-compose.dgx.yml --profile avatar up -d
```

---

## 📖 Reading Strategy (for Agent Teams)

### How to Use System Docs (docs/)

**System docs have frontmatter - use it!**

```markdown
---
summary: "Quick description"
read_when:
  - Specific scenarios when to read this
title: "Topic"
---
```

**Reading Process:**

1. **Check frontmatter `read_when`** - Does it match my task?
2. **Read `summary`** - Is this what I need?
3. **Read full content** - Technical details, code examples
4. **Follow links** - Related docs for deeper understanding

**Example - docs/concepts/queue.md:**

```markdown
---
read_when:
  - Changing auto-reply execution or concurrency  ← MATCHES Message Queue task!
---
```

→ Read this when implementing Message Queue!

### Step-by-Step Reading Flow

**When starting ANY task:**

1. **Planning docs first** (what we're building):

   ```
   Read: docs-secretary/sprints/SPRINT_01.md → Feature description
   Read: docs-secretary/architecture/ADR_*.md → Why this approach?
   ```

2. **System docs second** (how it currently works):

   ```
   Read: docs/concepts/[topic].md → Existing implementation

   Use frontmatter to find right doc:
   - grep "read_when" docs/**/*.md
   - Or check DEVELOPER_QUICK_REFERENCE.md links
   ```

3. **Code third** (actual implementation):
   ```
   Glob: "**/*queue*" or "**/*monitor*"
   Read: Relevant source files
   Grep: Specific patterns
   ```

**Example - Message Queue Task:**

1. ✅ **Planning**: Sprint Plan → Feature 1: Persistent Message Queue
2. ✅ **Planning**: ADR-02 → Alternative B (SQLite-backed queue, retry logic)
3. ✅ **System**: docs/concepts/queue.md → "Changing auto-reply execution" = Match!
4. ✅ **System**: docs/concepts/architecture.md → Gateway structure
5. ✅ **System**: docs/concepts/agent-loop.md → "Queueing + concurrency" section
6. ✅ **Code**: Read `/src/web/inbound/monitor.ts` (WhatsApp monitoring)
7. ✅ **Code**: Read `/src/auto-reply/` (message handling)
8. ✅ **Implement**: Based on full understanding

### Quick Doc Finder

**Use grep to find relevant docs by frontmatter:**

```bash
# Find docs about queue
grep -r "queue" docs/**/*.md | grep -E "summary:|read_when:"

# Find docs about sessions
grep -r "session" docs/**/*.md | grep -E "summary:|read_when:"

# Find docs about security
grep -r "security\|auth" docs/**/*.md | grep -E "summary:|read_when:"
```

### System Docs Cheat Sheet

**Most Important for Sprint 01:**

| Doc                                                 | Read When             | Key Info                                                  |
| --------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| [queue.md](../docs/concepts/queue.md)               | Message Queue task    | Lane-aware FIFO, modes (steer/followup/collect), debounce |
| [architecture.md](../docs/concepts/architecture.md) | Understanding Gateway | WebSocket API, components, flows                          |
| [agent-loop.md](../docs/concepts/agent-loop.md)     | Agent runtime changes | Lifecycle, queueing, hook points                          |
| [sessions.md](../docs/concepts/sessions.md)         | Session management    | Session keys, storage, lock handling                      |
| [models.md](../docs/concepts/models.md)             | LLM integration       | Provider config, fallbacks                                |
| [memory.md](../docs/concepts/memory.md)             | Conversation history  | Compaction, context windows                               |

**For Security (Sprint 01):**

| Doc                                 | Read When          | Key Info                     |
| ----------------------------------- | ------------------ | ---------------------------- |
| [docs/security/](../docs/security/) | Security hardening | Existing security measures   |
| [tool-policy](../docs/tools/)       | Tool security      | Allowlist/denylist for tools |

**For WhatsApp (Sprint 01):**

| Doc                                 | Read When            | Key Info                                     |
| ----------------------------------- | -------------------- | -------------------------------------------- |
| [docs/whatsapp/](../docs/whatsapp/) | WhatsApp integration | Baileys setup, QR login, session persistence |

---

## 🎯 What Exists vs What We Build

### ✅ EXISTS (leverage this):

- WhatsApp/Baileys integration
- 36 channel plugins
- 20+ agent tools
- Gateway architecture
- Session management
- Docker sandbox
- Testing infrastructure

### 🔧 REFACTOR (Sprint 01-02):

- Message Queue (fix race condition #16918)
- Security Layer (credential redaction, encryption)
- Event Bus (decouple Gateway)
- Code organization (3,009 files)

### ➕ ADD (Sprint 03-06):

- Avatar System (LivePortrait + XTTS)
- Kill Switch (emergency shutdown)
- MCP Integration (Model Context Protocol)

---

## 🚨 Critical Links During Development

| Need                   | Link                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| What am I building?    | `docs-secretary/sprints/SPRINT_01.md`                                    |
| Why this architecture? | `docs-secretary/architecture/FINAL_ARCHITECTURE_DECISIONS.md`            |
| How does Gateway work? | `docs/concepts/architecture.md`                                          |
| How does queue work?   | `docs/concepts/queue.md`                                                 |
| How do agents work?    | `docs/concepts/agent-loop.md`                                            |
| WhatsApp integration?  | `docs/whatsapp/`                                                         |
| Best practices?        | `docs-secretary/development/BEST_PRACTICE.md`                            |
| Test strategy?         | `docs-secretary/planning/IMPLEMENTATION_ROADMAP_V2.md` (Testing section) |

---

## 💡 Development Principles

**From Best Practices:**

- ✅ Interface-based design (enable migrations)
- ✅ Event-driven architecture (loose coupling)
- ✅ Multi-layer security (defense in depth)
- ✅ Test-driven development (80%+ coverage)
- ❌ No closures over socket references
- ❌ No `any` types without justification
- ❌ No secrets in env vars (use encrypted storage)

**From ADRs:**

- Start with SQLite, migrate to Postgres later (ADR-03)
- Start with Docker, migrate to gVisor later (ADR-04)
- Start with EventEmitter, migrate to NATS later (ADR-05)
- Interface-based design enables all migrations

---

## 📋 For Sprint Planning Agents

**Wenn du ein Sprint planst, befolge diese Schritte zur Effizienz:**

### 1. Dokumentation ZUERST lesen (verhindert Duplikate!)

**IMMER in dieser Reihenfolge:**

```
1. ✅ Read: DEVELOPER_QUICK_REFERENCE.md (dieses File - bereits im Kontext)
2. ✅ Read: docs-secretary/planning/IMPLEMENTATION_ROADMAP_V2.md (Sprint-Ziele)
3. ✅ Read: docs-secretary/development/BEST_PRACTICE.md (Patterns & Anti-Patterns)
4. ✅ Grep: Suche in docs/ nach relevanten Topics (nutze frontmatter!)
   - Beispiel: grep "queue\|message" docs/**/*.md | grep "read_when"
5. ✅ Read: Nur die docs/ Files, deren `read_when` zum Sprint passt
6. ✅ **Quick-Scan: Extrahiere Patterns aus relevantem Code (30min)**
   - Siehe "Quick-Scan Prozess" unten
7. ✅ Glob/Grep: Suche nach existierendem Code für Features
8. ✅ Read: Relevante Quellcode-Dateien
```

### 1a. Quick-Scan Prozess (30min, ~5k Token)

**WICHTIG:** Bevor du einen Sprint planst, scanne die betroffenen Code-Bereiche nach Patterns!

**Ziel:** Verstehe vorhandene Patterns und bügele nicht blind drüber.

**Vorgehen:**

```bash
# Step 1: Bekannte Issues finden (2min)
grep -r "TODO\|FIXME\|HACK" src --include="*.ts" | head -20
grep -r "eslint-disable" src --include="*.ts" | head -20

# Step 2: Relevante Module identifizieren (1min)
# Für Sprint 01 z.B.:
# - src/web/inbound/monitor.ts (WhatsApp - Feature 1)
# - src/auto-reply/inbound-debounce.ts (Message Queue - Feature 1)
# - src/logging/ (Security - Feature 2)
# - src/agents/sandbox/ (Security - Feature 2)
# - src/infra/agent-events.ts (Event Bus - Feature 3)

# Step 3: Zentrale Files lesen (20min)
Read: Die 5-10 wichtigsten Files für den Sprint
  → Fokus: Patterns extrahieren, nicht alles verstehen

# Step 4: Patterns dokumentieren (7min)
Edit: docs-secretary/development/BEST_PRACTICE.md
  → Ergänze Abschnitt "Sprint XX - Codebase Patterns"
  → Format: Pattern Name, Was, Warum, Code-Zeilen
  → Markiere "🤔 Zu prüfen" wenn unsicher
```

**Beispiel-Output:**

```markdown
## Sprint 01 - Codebase Patterns

**Pattern: Debouncer für Rapid Messages**

- Was: Batching von Messages via createInboundDebouncer<T>
- Code: src/auto-reply/inbound-debounce.ts
- Warum: Verhindert Message-Spam

**🤔 Zu prüfen: Socket Closure Pattern**

- Issue #16918: Closures über Socket-Referenzen
- Aktuell: Socket in closure, könnte stale werden
- Best Practice: Socket Getter Pattern?
```

**Wann NICHT Quick-Scannen:**

- ❌ Komplett neue Features ohne vorhandenen Code
- ❌ Erster Sprint eines Projekts (noch nichts da)
- ❌ Nur Bug-Fixes ohne neue Features

### 2. Frontmatter Effizient Nutzen

**docs/ Files haben frontmatter - NUTZE ES!**

```markdown
---
summary: "Quick one-liner"           ← Lies das ZUERST
read_when:                           ← Matcht das dein Feature?
  - Scenario when relevant
title: "Topic"
---
```

**Workflow:**

- ❌ **NICHT:** Alle docs/ Files blind lesen (zu viel Token!)
- ✅ **STATTDESSEN:** Grep nach Keywords → Check frontmatter → Nur relevante lesen

### 3. Was bereits existiert vs. Was zu bauen ist

**KRITISCH:** Prüfe IMMER ob Feature bereits existiert!

```bash
# Feature "Message Queue" planen?
1. grep -r "queue\|message" docs/**/*.md  # Check Doku
2. find src -name "*queue*"               # Check Code
3. Read docs/concepts/queue.md            # Verstehe Existierendes
4. Plane: "Ergänze persistente Schicht"   # Nicht: "Baue von scratch"
```

### 4. Sprint Plan Template

**Nutze SPRINT_TEMPLATE_V2.md:**

```
Read: docs-secretary/planning/SPRINT_TEMPLATE_V2.md
Write: docs-secretary/sprints/SPRINT_0X.md (mit ausgefüllten Werten)
```

**Wichtige Felder:**

- **Related:** Verlinke ADRs, Issues, Dependencies
- **Implementation Notes:** Code-Beispiele mit existierenden Patterns
- **Tests:** Unit, Integration, E2E spezifizieren

### 5. Token-Sparen: Zusammenfassen statt Kopieren

**Schlechtes Beispiel (verschwendet Token):**

```
"Ich habe docs/concepts/queue.md gelesen. Es sagt:
[200 Zeilen quote]
Daher plane ich..."
```

**Gutes Beispiel (effizient):**

```
"✅ docs/concepts/queue.md: In-memory lane-aware FIFO existiert
→ Sprint Plant: Persistente SQLite-Schicht ergänzen (nicht ersetzen)"
```

---

## 🔄 Workflow for Agent Teams

### How Claude Code Reads System Docs

**I (Claude) handle docs/ files like this:**

1. **Read the file** with Read tool:

   ```typescript
   Read({ file_path: "docs/concepts/queue.md" });
   ```

2. **Parse frontmatter**:
   - Extract `read_when` - Does it match current task?
   - Extract `summary` - Quick understanding
   - Extract `title` - Confirm topic

3. **Read content**:
   - Markdown sections (## headers)
   - Code examples (`json, `typescript)
   - Configuration examples
   - Mermaid diagrams (I can understand these)
   - Links to other docs (I can follow these)

4. **Extract key information**:
   - Technical concepts
   - API patterns
   - Configuration options
   - Best practices
   - Common pitfalls

5. **Apply to task**:
   - Understand existing implementation
   - Identify what to change/extend
   - Follow patterns from docs
   - Reference specific sections in implementation

**Example - Reading queue.md for Message Queue task:**

```
1. Read: docs/concepts/queue.md
2. Frontmatter: "read_when: Changing auto-reply execution" ✅ Match!
3. Key sections:
   - "How it works" → Lane-aware FIFO queue
   - "Queue modes" → steer/followup/collect
   - "Queue options" → debounceMs, cap, drop
   - "Scope and guarantees" → Per-session lanes
4. Extract patterns:
   - SQLite NOT mentioned → Existing queue is in-memory
   - Per-session serialization → We need to preserve this
   - Lane system → We integrate with existing lanes
5. Implementation insight:
   - Add persistent layer BELOW existing queue
   - Keep lane-aware FIFO design
   - Add retry logic for failed enqueues
```

### When Spawning Teammates

**Each teammate automatically gets:**

1. This DEVELOPER_QUICK_REFERENCE.md in context
2. Access to both docs/ and docs-secretary/
3. Read tool to load specific docs on-demand
4. Same understanding of frontmatter patterns

**Communication pattern:**

```
Agent: "I need to understand how WhatsApp monitoring works"
→ Check DEVELOPER_QUICK_REFERENCE.md links
→ Read: docs/whatsapp/baileys.md (check frontmatter first!)
→ Read: src/web/inbound/monitor.ts (actual code)
→ Extract: QR login, session persistence patterns
→ SendMessage to team: "WhatsApp uses Baileys with multi-file auth..."

Agent: "Why did we choose Alternative B for Message Queue?"
→ Read: docs-secretary/architecture/ARCHITECTURE_DECISIONS.md
→ Find: ADR-02, Alternative B details
→ Understand: SQLite-backed, retry logic, migration path
→ Implement: According to ADR rationale
→ SendMessage: "Implementing SQLite queue per ADR-02 Alt B..."
```

### Best Practices for Reading Docs

**DO:**

- ✅ Always check frontmatter `read_when` first
- ✅ Read `summary` before full content (saves context)
- ✅ Follow links to related docs
- ✅ Extract code examples to understand patterns
- ✅ Reference specific sections in your implementation
- ✅ Share key findings with team

**DON'T:**

- ❌ Read entire docs/ folder into context (too much!)
- ❌ Skip frontmatter (it tells you if doc is relevant)
- ❌ Ignore code examples (they show actual usage)
- ❌ Implement without understanding existing system
- ❌ Duplicate existing functionality (understand first!)

---

## 📏 Success Metrics & Definition of Done

### Sprint 01 Success Criteria:

- ✅ No message loss under rapid message scenarios
- ✅ Race condition #16918 resolved
- ✅ 0 credentials in logs (redacted)
- ✅ Event bus decouples ≥3 modules
- ✅ 80%+ test coverage (unit + integration)
- ✅ All critical tests passing
- ✅ **Documentation updated** (see below)

### Definition of Done (Every Feature):

**Code:**

- ✅ Feature implemented
- ✅ Tests written (unit + integration)
- ✅ Code reviewed
- ✅ Best practices followed

**Documentation:**

- ✅ **Planning docs updated** (`docs-secretary/`)
  - Sprint file updated with progress
  - ADR updated if architecture changed
  - BEST_PRACTICE.md updated if new patterns

- ✅ **System docs updated** (`docs/`)
  - **IF new feature:** Create new doc in `docs/concepts/[feature].md`
  - **IF changed feature:** Update existing `docs/concepts/[feature].md`
  - **IF breaking change:** Add migration guide
  - **IF new API:** Update `docs/gateway/` or relevant section

**When to Update System Docs:**

| Change Type                  | Update Required                   | Example                                                                           |
| ---------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| **New Feature**              | Create new doc + update docs.json | Message Queue → `docs/concepts/persistent-queue.md` + add to docs.json navigation |
| **Enhanced Feature**         | Update existing                   | Security → Update `docs/security/credentials.md`                                  |
| **Breaking Change**          | Migration guide                   | Event Bus → `docs/migration/event-bus.md` + add to docs.json                      |
| **Bug Fix**                  | Usually not needed                | Race condition fix → Maybe update troubleshooting                                 |
| **Refactor (no API change)** | Usually not needed                | Code cleanup → No doc change                                                      |
| **New API**                  | API docs                          | Gateway endpoint → Update `docs/gateway/api.md`                                   |

**Important:** docs/ uses Mintlify. When adding new docs, update `docs/docs.json` navigation structure!

**Project (8-10 weeks):**

- ✅ Production-ready personal AI assistant
- ✅ Avatar system working (LivePortrait + XTTS)
- ✅ Kill switch functional
- ✅ MCP integration complete
- ✅ 85%+ total test coverage

---

## 🆘 When Stuck

1. **Check Sprint Plan:** Does it answer my question?
2. **Check ADRs:** Why was this decision made?
3. **Check System Docs:** How does the existing system work?
4. **Read Code:** What's actually implemented?
5. **Ask Team:** SendMessage to other agents
6. **Ask Lead:** If still unclear

---

**Last Updated:** 2026-02-16 (Sprint 01 Start)
**Maintained By:** Development team + Agent teams
**Keep in Context:** Always load this first!
