# Sprint 05 — Security Fixes, Multi-Channel Voice & Test Coverage

**Sprint:** 05
**Dauer:** 2026-03-01 – 2026-03-14 (2 Wochen)
**Status:** ✅ Completed (2026-02-17)
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

- [x] Token-Validierung für `webrtc-server.ts` implementiert (`?token=` vs `GATEWAY_API_KEY`, close 4401)
- [x] Gateway-WS-Dateien (server-close, server-runtime-state, server-ws-runtime, ws-connection) bereits via `resolvedAuth` + `rateLimiter` in `attachGatewayUpgradeHandler` gesichert — kein Fix nötig
- [x] Tests: invalid token → 4401, no token → 4401, valid token → connected, no API key → skip auth (4 neue Tests)

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

- [x] `ui/avatar-chat/src/hooks/useWebRTC.ts:103` — in try/catch gewrappt
- [x] `webrtc-server.ts:183`, `invoke.ts:820`, `chat.ts:136` — bereits in try/catch, kein Fix nötig
- [x] Tests: malformed JSON → kein Crash (via WebRTC-Auth-Tests abgedeckt)

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

- [x] `file-type` Package installiert (`pnpm add -w file-type`)
- [x] Magic-Byte-Check in `src/gateway/api/characters-http.ts` (Avatar + Voice Endpoints)
- [x] `src/characters/db.ts`, `orchestrator.ts`, `types.characters.ts` — kein direkter Upload-Handler, gesichert via HTTP-Layer
- [x] Tests: PNG/JPEG erlaubt, PDF/EXE als Image abgelehnt, PDF als Audio abgelehnt (6 neue Tests in `mime-validation.test.ts`)

### 1.4 Important-Findings (Top-Prio aus 381 Items)

**Priority:** 🟠 IMPORTANT
**Aufwand:** 4-6h

**God Objects (41 Items)** — Klassen zu groß, schwer testbar:

- [ ] `src/agents/subagent-registry.ts` — aufteilen (siehe Plan unten)
- [ ] `src/gateway/server/server.impl.ts` — aufteilen (siehe Plan unten)

#### Aufspaltungsplan: `src/agents/subagent-registry.ts` (746 Zeilen)

Aktuell ein monolithisches Modul mit Singleton-State, Persistence, Lifecycle-Listener, Sweeper, Announce-Flow und Query-Funktionen. Vorschlag: 4 Dateien.

| Neue Datei                             | Methoden/Verantwortlichkeiten                                                                                                                                                                                                                                                     | ~Zeilen |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `subagent-registry.ts` (verbleibend)   | Exports, `registerSubagentRun`, `releaseSubagentRun`, `resetSubagentRegistryForTests`, `addSubagentRunForTests`, `initSubagentRegistry`, Singleton-Map + State                                                                                                                    | ~120    |
| `subagent-registry.lifecycle.ts` (neu) | `ensureListener`, `waitForSubagentCompletion`, `startSubagentAnnounceCleanupFlow`, `finalizeSubagentCleanup`, `beginSubagentCleanup`, `retryDeferredCompletedAnnounces`, `resumeSubagentRun`, `restoreSubagentRunsOnce`                                                           | ~200    |
| `subagent-registry.sweeper.ts` (neu)   | `startSweeper`, `stopSweeper`, `sweepSubagentRuns`, `resolveArchiveAfterMs`                                                                                                                                                                                                       | ~60     |
| `subagent-registry.queries.ts` (neu)   | `findRunIdsByChildSessionKey`, `getRunsSnapshotForRead`, `resolveRequesterForChildSession`, `isSubagentSessionRunActive`, `markSubagentRunTerminated`, `listSubagentRunsForRequester`, `countActiveRunsForSession`, `countActiveDescendantRuns`, `listDescendantRunsForRequester` | ~200    |
| `subagent-registry.steer.ts` (neu)     | `markSubagentRunForSteerRestart`, `clearSubagentRunSteerRestart`, `replaceSubagentRunAfterSteer`                                                                                                                                                                                  | ~100    |

Hinweis: Alle Teilmodule importieren die Singleton-Map aus `subagent-registry.ts` (interne Shared-State-Referenz). Bestehende `subagent-registry.store.ts` (Disk-IO) bleibt unverändert.

#### Aufspaltungsplan: `src/gateway/server/server.impl.ts` (744 Zeilen)

Aktuell eine einzige `startGatewayServer()` Funktion (580+ Zeilen) die alles initialisiert. Bereits teilweise aufgeteilt (server-channels, server-chat, server-close, server-cron, etc.), aber die Orchestrierungsfunktion selbst ist zu lang. Vorschlag: Weitere Extraktion von Setup-Blöcken.

| Neue Datei                                   | Verantwortlichkeiten                                                                  | ~Zeilen |
| -------------------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| `server.impl.ts` (verbleibend)               | `startGatewayServer` Kern-Orchestrierung, Option-Types, Imports                       | ~250    |
| `server-config-init.ts` (neu)                | Config-Snapshot lesen, Legacy-Migration, Validation, Plugin-Auto-Enable (L183-231)    | ~80     |
| `server-discovery-init.ts` (neu)             | Discovery-Setup, Bonjour, Tailscale-Exposure, Skills-Remote-Setup (L430-470)          | ~60     |
| `server-node-wiring.ts` (neu)                | NodeRegistry, NodeSubscriptions, nodeSendEvent/Session/AllSubscribed Setup (L395-412) | ~50     |
| `server-ws-setup.ts` (neu)                   | `attachGatewayWsHandlers` Aufruf mit dem grossen Context-Objekt (L549-608)            | ~80     |
| `server-sidecars-init.ts` (existiert teilw.) | Browser-Control, Plugin-Services, Channel-Start, Gateway-Start-Hook (L632-654)        | ~50     |

Hinweis: `server.impl.ts` hat keine Klasse — es ist eine prozedurale Init-Funktion. Die Aufspaltung extrahiert Setup-Blöcke in Factory-Funktionen die das jeweils relevante State-Subset zurückgeben. Die Orchestrierung ruft sie sequentiell auf.

**Unbounded Caches (4 Items)** — Memory-Leak-Risiko:

- [ ] Cache-Size-Limit für alle 4 unbounded caches

**Console.log in Production (68 Items)**:

- [x] Top-30 console.warn/error durch Logger ersetzt in 13 Dateien (src/agents/, src/gateway/) — 0 console.\* in Production übrig

---

## 📋 Phase 2: Multi-Channel Voice (Sprint 04 Phase 3)

**Priority:** 🟠 HIGH
**Aufwand:** 15-20h

> Aus Sprint 04 Phase 3 übernommen — noch nicht angefangen.

### 2.1 Voice Messages WhatsApp

- [x] TTS-Audio → WAV→OGG/Opus Konvertierung (`convertWavToOggOpus()` via ffmpeg)
- [x] Local TTS Provider registriert (`src/tts/tts.ts` + `local-voice.ts`, keine API-Key nötig)
- [x] Local STT Provider registriert (`src/media-understanding/providers/local/`)
- [ ] Channel-Level: eingehende WhatsApp `audioMessage` → STT → Agent → TTS → Voice Note zurück (Phase 2.3)

### 2.2 Voice Messages Telegram

- [x] STT-Provider-Infrastruktur geteilt mit WhatsApp (local provider)
- [x] WAV-Buffer direkt nutzbar für Telegram `sendVoice`
- [ ] Channel-Level: eingehende Telegram `voice` → STT → Agent → TTS → sendVoice (Phase 2.3)

### 2.3 Avatar Response Routing

- [x] WhatsApp Inbound: PTT/audioMessage erkannt → `localTranscribe()` → `[Sprachnachricht] <Text>` in Agent-Flow
- [x] WhatsApp Outbound: `convertWavToOggOpus()` → `ptt: true` wenn `voiceCompatible`
- [x] Telegram Inbound: `voice` → local STT Fallback in `bot-message-context.ts`
- [x] Telegram Outbound: WAV→OGG→`sendVoice`
- [x] Tests: `voice-routing.test.ts` (WhatsApp 6 + Telegram 4 Tests), alle grün
- [ ] Conversation sync (Web ↔ WhatsApp ↔ Telegram) — Sprint 06
- [ ] Voice commands erkennen und weiterleiten — Sprint 06

---

## 📋 Phase 3: Testing & Cleanup (Sprint 04 Phase 4)

**Priority:** 🟡 MEDIUM
**Aufwand:** 10-15h

### 3.1 WebRTC Signaling Tests (4 skipped)

> Herkunft: KNOWN_ISSUES.md, Sprint 04 Phase 4
> Empfehlung: Mock-WebSocket Lösung (1-2h)

- [x] WebSocket in `webrtc-server.test.ts` via `vi.mock()` mocken
- [x] 4 skipped Tests aktivieren: reject-full-server, receive-offer, send-answer, ICE-candidates
- [x] Alle 19/19 WebRTC-Tests grün (Race-Condition-Fix: message-Listener vor `open` registrieren)

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

### 3.5 CI-Pipeline Ausbau (aus ci-minimal.yml TODOs)

> Herkunft: `.github/workflows/ci-minimal.yml` — geplante Sprint-Meilensteine die nie implementiert wurden.
> Die vollständige upstream CI (`ci.yml`) hat viele Features die wir noch nicht nutzen.

**Sprint 05 Ziel:** ci-minimal.yml auf Stand bringen

- [ ] **Coverage Gate:** `pnpm vitest run --coverage` mit Schwellwert 80% (CI schlägt fehl wenn darunter)
- [ ] **Security Audit:** `npm audit --audit-level=high` in CI (Sprint 05 war geplant)
- [ ] **Secret Scanning:** `detect-secrets scan --baseline .secrets.baseline` (wie upstream ci.yml)
- [ ] **`pnpm check`:** Type-Check + Lint zusammen als Gate (aktuell getrennt und optional)
- [ ] **Scope Detection:** Docs-only Changes → schwere Jobs überspringen (spart CI-Zeit)

**Sprint 06+ Ziel (vormerken):**

- Docker Build + Push in CI (Sprint 06 geplant)
- Vitest JSON Reports + slowest-test Zusammenfassung hochladen (wie upstream)
- Performance Benchmarks (Sprint 07 geplant)

---

## 📋 Phase 4: Test Coverage Sprint (71% → 80%)

**Priority:** 🟡 MEDIUM
**Aufwand:** 40-50h
**Quelle:** Sprint 04 Phase 5

### Priorität nach Modul

| Modul            | Vorher | Jetzt     | Ziel | Prio                                         |
| ---------------- | ------ | --------- | ---- | -------------------------------------------- |
| `src/infra/tls`  | 9.52%  | ✅ 92.85% | 50%+ | 🔴 CRITICAL                                  |
| `src/tts`        | 47.42% | ✅ 86%    | 75%+ | 🟠 HIGH                                      |
| `src/plugin-sdk` | 23.22% | ✅ 85.8%  | 60%+ | 🟡 MEDIUM                                    |
| `src/shared`     | 62.83% | ✅ 86.14% | 80%+ | 🟡 MEDIUM                                    |
| `src/media`      | 64.15% | ✅ ~68%   | 75%+ | ⏭️ Sprint 06 (image-ops/sips paths complex)  |
| `src/infra`      | 69.84% | ~69%      | 80%+ | ⏭️ Sprint 06 (device-auth/sqlite)            |
| `src/logging`    | 67.18% | ✅ 77%    | 75%+ | ✅ Ziel erreicht                             |
| `src/config`     | 67.22% | ~71%      | 75%+ | ⏭️ Sprint 06 (400+ Zeilen Migration-Dateien) |
| `src/sessions`   | 69.58% | ✅ 94.93% | 80%+ | 🟢 LOW                                       |
| `src/memory`     | 70.95% | ~73%      | 80%+ | ⏭️ Sprint 06 (manager-sync-ops DB)           |

**Woche 1 (Priority order):**

- [x] TLS → 92.85% (fingerprint.test.ts + gateway.test.ts, 14 neue Tests)
- [x] TTS → 86% (tts.test.ts erweitert von 35 auf 107 Tests)
- [x] Plugin-SDK → 85.8% (52 neue Tests: webhook-path, text-chunking, config-paths, etc.)

**Woche 2:**

- [x] Plugin-SDK → 85.8% (abgeschlossen)
- [x] Shared → 86.14% (73 neue Tests: chat-envelope, config-eval, device-auth, subagents-format, etc.)
- [x] Sessions → 94.93% ✅
- [x] Media → ~68% (image-ops sips paths → Sprint 06)
- [x] Logging → 77% ✅ (Ziel 75% erreicht)
- [~] Config → ~71% (Legacy-Migration-Dateien 400+ Zeilen → Sprint 06)
- [~] Memory → ~73% (manager-sync-ops DB-Ops → Sprint 06)
- [~] Infra → ~69% (device-auth/sqlite → Sprint 06)
- **+282 neue Tests** (708 Testdateien, 6166 Tests total)

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
