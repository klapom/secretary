# Sprint 05 — Security Fixes, Multi-Channel Voice & Test Coverage

**Sprint:** 05
**Dauer:** 2026-03-01 – 2026-03-14 (2 Wochen)
**Status:** 📋 Planned
**Focus:** Persona-Review-Findings abarbeiten + Sprint-04-Leftovers + Test Coverage auf 80%

---

## 🎯 Sprint-Ziel

Am Ende dieses Sprints sind alle kritischen Sicherheitsfunde aus den Persona-Reviews behoben,
Multi-Channel-Voice (WhatsApp/Telegram) läuft, die WebRTC-Tests sind grün und die Test-Coverage
überschreitet 80%.

**Success Criteria:**

- [ ] Alle 5 CRITICAL-Security-Findings aus Persona-Review behoben (MIME, JSON.parse, WS-Auth)
- [ ] Voice Messages für WhatsApp + Telegram funktionieren
- [ ] WebRTC Signaling Tests: 4 skipped → grün
- [ ] Test Coverage: 71% → 80%+
- [ ] Kein Modul unter 65% (außer Type Definitions)
- [ ] CI grün

---

## 📋 Phase 1: Security Critical Fixes (aus Persona-Review)

> **Herkunft:** `.sprint-review/critical.json` (33 Items) + Technical Debt Register
> Critical/Important hätten per auto-fix.cjs gefixt werden sollen — teilweise nicht ausgeführt.

### 1.1 WebSocket ohne Authentication (5 Stellen)

**Priority:** 🔴 CRITICAL
**Persona:** Security Engineer
**Aufwand:** 3-4h

Betroffene Dateien:

- `src/avatar/streaming/webrtc-server.ts`
- `src/gateway/server/server-close.ts`
- `src/gateway/server/server-runtime-state.ts`
- `src/gateway/server/server-ws-runtime.ts`
- `src/gateway/server/ws-connection.ts`

**Fix:** Token-Validierung beim WebSocket-Upgrade (query param oder erstes Message-Paket).

- [ ] Token-Validierung für alle 5 WebSocket-Server implementieren
- [ ] Tests: gültige Token → connected, ungültiger Token → 401 close

### 1.2 Unguarded JSON.parse() in Production Code

**Priority:** 🔴 CRITICAL
**Persona:** Architect
**Aufwand:** 2-3h

Betroffene Production-Dateien (Test-Files ausgeschlossen):

- `src/avatar/streaming/webrtc-server.ts:183`
- `src/node-host/invoke.ts:820`
- `src/gateway/server-methods/chat.ts:136`
- `ui/avatar-chat/src/hooks/useWebRTC.ts:103`

**Fix:** Alle JSON.parse() in try/catch einwickeln, sinnvoller Error-Handler.

- [ ] JSON.parse mit try/catch in allen 4 Production-Stellen
- [ ] Tests: malformed JSON → kein Crash

### 1.3 MIME-Typ Bypass bei File-Uploads (4 Stellen)

**Priority:** 🔴 CRITICAL
**Persona:** Security Engineer
**Aufwand:** 3-4h

Betroffene Dateien:

- `src/avatar/orchestrator.ts`
- `src/characters/db.ts`
- `src/config/types.characters.ts`
- `src/gateway/api/characters-http.ts`

**Fix:** Magic-Byte-Validierung via `file-type` Package zusätzlich zu Content-Type.

- [ ] `file-type` Package installieren
- [ ] Magic-Byte-Check in alle 4 Upload-Endpoints
- [ ] Tests: gefälschter Content-Type mit falschen Bytes → rejected

### 1.4 Important-Findings (Top-Prio aus 381 Items)

**Priority:** 🟠 IMPORTANT
**Aufwand:** 4-6h

**God Objects (41 Items)** — Klassen zu groß, schwer testbar:

- [ ] `src/agents/subagent-registry.ts` — identifizieren + aufteilen
- [ ] `src/gateway/server/server.impl.ts` — identifizieren + aufteilen

**Unbounded Caches (4 Items)** — Memory-Leak-Risiko:

- [ ] Cache-Size-Limit für alle 4 unbounded caches

**Console.log in Production (68 Items)**:

- [ ] Top-20 console.log durch Logger ersetzen (src/agents/, src/gateway/)

---

## 📋 Phase 2: Multi-Channel Voice (Sprint 04 Phase 3)

**Priority:** 🟠 HIGH
**Aufwand:** 15-20h

> Aus Sprint 04 Phase 3 übernommen — noch nicht angefangen.

### 2.1 Voice Messages WhatsApp

- [ ] Voice message handler für WhatsApp implementieren
- [ ] TTS-Audio → WhatsApp voice note format (Opus/OGG)
- [ ] Eingehende WhatsApp-Audiodatei → STT → Agent → TTS → Antwort

### 2.2 Voice Messages Telegram

- [ ] Voice message handler für Telegram implementieren
- [ ] TTS-Audio → Telegram voice message
- [ ] Eingehende Telegram-Audiodatei → STT → Agent → TTS → Antwort

### 2.3 Avatar Response Routing

- [ ] Avatar-Antworten über Web-UI routen
- [ ] Conversation sync (Web ↔ WhatsApp ↔ Telegram)
- [ ] Voice commands erkennen und weiterleiten

---

## 📋 Phase 3: Testing & Cleanup (Sprint 04 Phase 4)

**Priority:** 🟡 MEDIUM
**Aufwand:** 10-15h

### 3.1 WebRTC Signaling Tests (4 skipped)

> Herkunft: KNOWN_ISSUES.md, Sprint 04 Phase 4
> Empfehlung: Mock-WebSocket Lösung (1-2h)

- [ ] WebSocket in `webrtc-server.test.ts` via `vi.mock()` mocken
- [ ] 4 skipped Tests aktivieren: reject-full-server, receive-offer, send-answer, ICE-candidates
- [ ] Alle 48/48 WebRTC-Tests grün

### 3.2 Gateway API Key Test-Flakiness

- [ ] Root-Cause identifizieren
- [ ] Flaky Test stabilisieren oder isolieren

### 3.3 Avatar Integration Tests

> Benötigen laufende Docker-Services (LivePortrait, XTTS, Whisper)

- [ ] Integration Test: LivePortrait render pipeline (end-to-end)
- [ ] Integration Test: TTS + STT pipeline
- [ ] E2E Test: Voice interaction flow (Browser → STT → Agent → TTS → Avatar)
- [ ] WebRTC E2E Latenz <200ms messen (echter Browser-Test)

### 3.4 CI: Python Microservices

- [ ] Avatar-Services in CI-Pipeline aufnehmen (health-check)
- [ ] Performance-Benchmark in CI (LivePortrait Latenz)

---

## 📋 Phase 4: Test Coverage Sprint (71% → 80%)

**Priority:** 🟡 MEDIUM
**Aufwand:** 40-50h
**Quelle:** Sprint 04 Phase 5

### Priorität nach Modul

| Modul            | Aktuell | Ziel | Aufwand | Prio        |
| ---------------- | ------- | ---- | ------- | ----------- |
| `src/infra/tls`  | 9.52%   | 50%+ | 5-7h    | 🔴 CRITICAL |
| `src/tts`        | 47.42%  | 75%+ | 6-8h    | 🟠 HIGH     |
| `src/plugin-sdk` | 23.22%  | 60%+ | 8-10h   | 🟡 MEDIUM   |
| `src/shared`     | 62.83%  | 80%+ | 4-6h    | 🟡 MEDIUM   |
| `src/media`      | 64.15%  | 75%+ | 3-4h    | 🟢 LOW      |
| `src/infra`      | 69.84%  | 80%+ | 4-5h    | 🟢 LOW      |
| `src/logging`    | 67.18%  | 75%+ | 2-3h    | 🟢 LOW      |
| `src/config`     | 67.22%  | 75%+ | 2-3h    | 🟢 LOW      |
| `src/sessions`   | 69.58%  | 80%+ | 3-4h    | 🟢 LOW      |
| `src/memory`     | 70.95%  | 80%+ | 2-3h    | 🟢 LOW      |

**Woche 1 (Priority order):**

- [ ] TLS (5-7h) — Security-kritisch
- [ ] TTS (6-8h) — Avatar-Feature-Enabler
- [ ] Plugin-SDK Start (4-5h) — config-paths + webhook-path

**Woche 2:**

- [ ] Plugin-SDK Rest (4-5h)
- [ ] Shared (4-6h)
- [ ] Remaining modules (8-12h)

**Success Criteria:**

- [ ] Overall: 71% → 80% minimum (Ziel: 85%)
- [ ] TLS: 9.52% → 50%+
- [ ] TTS: 47.42% → 75%+
- [ ] Plugin-SDK: 23.22% → 60%+
- [ ] Kein Modul unter 65%
- [ ] Alle neuen Tests grün (CI green)

---

## 📋 Phase 5: Dokumentation & Nachlauf Sprint 03

**Priority:** 🟢 LOW
**Aufwand:** 4-6h

- [ ] `BEST_PRACTICE.md` — Avatar-Learnings ergänzen
- [ ] `docs/avatar/tts.md` erstellen
- [ ] `docs/avatar/stt.md` erstellen
- [ ] `docs/avatar/character-manager.md` erstellen
- [ ] `docs/avatar/webrtc.md` erstellen
- [ ] CI/CD Workflow dokumentieren (Sprint 02 Leftover)

---

## 📊 Persona-Review Findings — Status

> Aus `.sprint-review/` vom Sprint-03-End (sprint-end.sh Lauf)

| Kategorie    | Anzahl | Status                                               | Wo                          |
| ------------ | ------ | ---------------------------------------------------- | --------------------------- |
| Critical     | 33     | 🔴 Großteils offen (auto-fix lief nicht vollständig) | Phase 1 dieses Sprints      |
| Important    | 381    | 🟠 Offen                                             | Top-Prio-Items in Phase 1.4 |
| Nice-to-Have | 485    | ✅ In `docs/TECHNICAL_DEBT.md`                       | Backlog                     |

**Critical im Detail:**

- 6× Interval-Leak (teilweise False Positives — z.B. subagent-registry räumt korrekt auf)
- 9× Unguarded JSON.parse (4 Production + 5 Test-/Hilfsdateien)
- 6× Hardcoded Secret (5× in `examples/` Dateien = False Positives, 1× Production)
- 4× MIME Bypass
- 5× WebSocket ohne Auth
- 1× eval() in Test (False Positive)

---

## 🔗 Abhängigkeiten

- Docker-Services laufen (LivePortrait, XTTS, Whisper) für Integration Tests in Phase 3
- Sprint 04 abgeschlossen

---

## 📊 Aufwandsschätzung

| Phase                        | Aufwand      |
| ---------------------------- | ------------ |
| Phase 1: Security Critical   | 12-17h       |
| Phase 2: Multi-Channel Voice | 15-20h       |
| Phase 3: Testing & Cleanup   | 10-15h       |
| Phase 4: Test Coverage       | 40-50h       |
| Phase 5: Dokumentation       | 4-6h         |
| **Gesamt**                   | **~80-108h** |

---

## 📌 Vorgemerkt für Sprint 06

### Upstream-Rebase: Proper GitHub-Fork erstellen

**Hintergrund:**
Das Repo wurde durch manuelle Kopie (nicht GitHub-Fork) gestartet → kein gemeinsamer git-Ancestor mit `openclaw/openclaw`.
Dadurch ist `git merge upstream/main` nicht möglich; upstream-Fixes müssen manuell portiert werden.

**Ziel:**
Sauberer Fork mit echtem Common Ancestor, damit ab Sprint 07 upstream-Sync via `git merge` funktioniert.

**Vorgehen:**

1. Proper GitHub-Fork von `openclaw/openclaw` erstellen
2. Unsere neuen Dateien (docker/, docs-secretary/, src/avatar/, .hooks/) als Branch drauflegen
   → ~854 Dateien, die upstream nicht anfasste → weitgehend konfliktfrei
3. Unsere Änderungen an bestehenden Dateien (Security, Queue, Config) als gezielte Commits portieren
   → ~5.490 potentielle Konflikte, nur Kern-Änderungen relevant
4. Upstream-Sync verifizieren: `git fetch upstream && git merge upstream/main`

**Aufwand:** ~1 Sprint (parallel zu anderen Tasks möglich)

**Voraussetzung:** Sprint 05 abgeschlossen (stabile Codebasis als Grundlage)

---

**Sprint Start:** 2026-03-01
**Sprint End:** 2026-03-14
**Review:** 2026-03-14 (sprint-end.sh 05)
