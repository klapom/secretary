# Sprint 06 - Polish & Production Readiness

**Sprint:** 06
**Dauer:** 2026-02-18 - 2026-03-04 (2 Wochen)
**Ziel:** Coverage auf 85%+ bringen, kritische Upstream-Fixes backporten, FIXME-Schulden abarbeiten

---

## 🎯 Sprint-Ziel

Test-Coverage auf 85%+ anheben (Media/Config/Memory/Infra alle unter 75%), die wichtigsten Security-
und Gateway-Fixes aus upstream backporten, und den FIXME-Rückstand (JSON.parse, SSRF, path traversal)
abarbeiten, der bei den Persona-Reviews in Sprint 05 identifiziert wurde.

**Success Criteria:**

- [ ] Gesamtcoverage ≥ 85% (aktuell ~80%)
- [ ] Media ≥ 80% (aktuell ~68%)
- [ ] Config ≥ 80% (aktuell ~71%)
- [ ] Memory ≥ 80% (aktuell ~73%)
- [ ] Infra ≥ 80% (aktuell ~69%)
- [ ] Upstream Security-Fixes backportiert (SSRF, path traversal, sandbox)
- [ ] FIXME(arch-json-parse): alle JSON.parse ohne try-catch gepatcht
- [ ] **Documentation updated** (docs/ und docs-secretary/)

---

## 📋 Phase 1: Upstream Security Backports

**Priority:** 🔴 CRITICAL
**Model:** 🤖 Sonnet 4.5
**Aufwand:** ~6h

### Relevante upstream Fixes (seit letztem Sprint)

Aus dem `sprint-start.sh` Upstream-Sync-Bericht (116 neue Commits, 43 Fixes):

**Security (kritisch):**

- `b5f551d71 fix(security): OC-06 prevent path traversal in config includes`
- `28bac46c9 fix(security): harden safeBins path trust`
- `442fdbf3d fix(security): block SSRF IPv6 transition bypasses`
- `99db4d13e fix(gateway): guard cron webhook delivery against SSRF`

**Agents/Gateway:**

- `8984f3187 fix(agents): correct completion announce retry backoff schedule`
- `289f215b3 fix(agents): make manual subagent completion announce deterministic`
- `35016a380 fix(sandbox): serialize registry mutations and lock usage`

**Telegram:**

- `d833dcd73 fix(telegram): cron and heartbeat messages land in wrong chat instead of target topic (#19367)`

**Aufgaben:**

- [ ] Task 1.1: `git log --oneline 81c5c02e5..upstream/main` analysieren, Patches extrahieren (1h)
- [ ] Task 1.2: Security-Fixes (path traversal, SSRF, safeBins) cherry-pick/manuell portieren (2h)
- [ ] Task 1.3: Agents/Gateway/Sandbox-Fixes portieren (1h)
- [ ] Task 1.4: Telegram-Fix portieren (30min)
- [ ] Task 1.5: Tests für portierte Fixes schreiben/anpassen (1h)

---

## 📋 Phase 2: FIXME-Schulden aus Persona Reviews

**Priority:** 🔴 CRITICAL / 🟡 IMPORTANT
**Model:** 🤖 Sonnet 4.5
**Aufwand:** ~4h

Die Sprint-05-Persona-Reviews haben folgende FIXME-Kommentare in den Code eingefügt:

### 2.1 JSON.parse ohne try-catch (arch-json-parse)

- [ ] `src/message-queue/inbound-queue.ts` — 2 Stellen (failInboundMessage, loadPendingInboundMessages)
- [ ] `src/tts/tts.ts` — readPrefs() (bereits `catch {}` vorhanden, aber noch FIXME)
- [ ] Alle weiteren `// FIXME(arch-json-parse)` im Codebase patchen

### 2.2 Security FIXMEs

- [ ] `src/services/local-voice.ts` — `FIXME(sec-mime-no-magic)`: magic-byte Validierung via `file-type` pkg
- [ ] `src/tts/tts.ts` — `FIXME(sec-unvalidated-cast)`: Zod-Validierung für JSON-Cast
- [ ] Alle weiteren `// FIXME(sec-*)` prüfen und beheben

### 2.3 Console.log → Logger (dev-console-log)

- [ ] `src/message-queue/inbound-queue.ts` — recoverPendingInboundMessages-Beispiel
- [ ] Alle weiteren `// FIXME(dev-console-log)` durch `logInfo/logWarn/logError` ersetzen

**Tasks:**

- [ ] Task 2.1: `grep -r 'FIXME' src/` — vollständige Liste erstellen (15min)
- [ ] Task 2.2: CRITICAL FIXMEs beheben (arch-json-parse, sec-\*) (2h)
- [ ] Task 2.3: IMPORTANT FIXMEs beheben (dev-console-log, etc.) (1h)

---

## 📋 Phase 3: Test Coverage 80% → 85%+

**Priority:** 🟡 IMPORTANT
**Model:** 🤖 Sonnet 4.5
**Aufwand:** ~10h

### Aktuelle Coverage-Lücken (Sprint 05 Ende)

| Modul   | Aktuell | Ziel Sprint 06 |
| ------- | ------- | -------------- |
| Media   | ~68%    | ≥80%           |
| Config  | ~71%    | ≥80%           |
| Memory  | ~73%    | ≥80%           |
| Infra   | ~69%    | ≥80%           |
| Logging | ~77%    | ≥85%           |
| Gesamt  | ~80%    | ≥85%           |

### 3.1 Media (~68% → ≥80%)

- [ ] `src/media/fetch.ts` — Fetch-Fehler, Timeout, große Responses
- [ ] `src/media/mime.ts` — Edge Cases (leere Files, unbekannte Types)
- [ ] `src/media/image-ops.ts` — Resize-Errors, invalid input
- [ ] `src/media/png-encode.ts` — Encoding-Errors

### 3.2 Config (~71% → ≥80%)

- [ ] `src/config/zod-schema.characters.ts` — Validation edge cases
- [ ] `src/config/env-vars.ts` — Missing vars, type coercion
- [ ] `src/config/legacy.ts` — Migration paths

### 3.3 Memory (~73% → ≥80%)

- [ ] `src/memory/` — Embedding pipeline, batch processing errors
- [ ] Provider-Fehler (Timeout, Rate-Limit)

### 3.4 Infra (~69% → ≥80%)

- [ ] `src/infra/exec-safety.ts` — Shellinjection attempts
- [ ] `src/infra/fs-safe.ts` — Permission errors, symlink attacks
- [ ] `src/infra/tls/` — Certificate validation, fingerprint errors

---

## 📋 Phase 4: Upstream-Rebase Vorbereitung

**Priority:** 🟢 NICE TO HAVE
**Model:** 🤖 Opus 4.6 (komplexe Architekturentscheidung)
**Aufwand:** ~4h Analyse, Rebase selbst im nächsten Sprint

> Aus Sprint 05 übernommen: Proper GitHub-Fork erstellen für ab Sprint 07 sauberes `git merge upstream/main`

**Hintergrund:**
Das Repo wurde durch manuelle Kopie (nicht GitHub-Fork) gestartet → kein gemeinsamer git-Ancestor.
Upstream-Fixes müssen manuell portiert werden (wie in Phase 1 dieses Sprints).

**Ziel Sprint 06:** Analyse-Phase abschließen, Strategie festlegen.

- [ ] Task 4.1: Welche unserer Änderungen sind upstream-unique? (git diff analyse) (1h)
- [ ] Task 4.2: Fork-Strategie dokumentieren (orphan branch vs. neue Repo-Basis) (1h)
- [ ] Task 4.3: ADR schreiben: "Upstream-Sync-Strategie" (1h)

---

## 🚫 Out of Scope

- ❌ Avatar UI Verbesserungen — Sprint 07
- ❌ Voice Commands (Conversation sync Web↔WhatsApp↔Telegram) — Sprint 07
- ❌ Docker Build in CI — Sprint 07
- ❌ Load Testing / Performance Benchmarks — Sprint 07-08
- ❌ Vollständige API-Dokumentation — Sprint 07

---

## 🔗 CI/CD Status (Sprint 05 Ende)

**Sprint 05 CI Ergebnis:**

- Tests: ✅ 6176 passed, 0 failed
- Coverage: ✅ 85% Gesamt
- Lint: ⚠️ 8 Warnings (pre-existing, kein Blocker)
- TypeScript: ⚠️ 132 Errors (pre-existing, kein Blocker)
- Security Audit: ⚠️ 1 moderate vulnerability

**Verbesserung für Sprint 06:**

- [ ] Moderate Vulnerability aus `npm audit` identifizieren und patchen
- [ ] Coverage-Gate auf 85% anheben (aktuell 80% in ci-minimal.yml)
- [ ] TypeScript-Fehler-Count nicht weiter steigen lassen

---

## 📊 Sprint Metrics

### Velocity

- **Geplante Aufwand:** ~24h (Phases 1-4)
- **Completed:** - (wird am Ende gefüllt)

### Time Tracking

| Phase                       | Geplant | Actual |
| --------------------------- | ------- | ------ |
| Phase 1: Upstream Backports | 6h      | -      |
| Phase 2: FIXME-Schulden     | 4h      | -      |
| Phase 3: Coverage           | 10h     | -      |
| Phase 4: Rebase-Analyse     | 4h      | -      |

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

---

## 📚 Documentation Updates (Ende des Sprints)

### docs-secretary/ (Planning Docs) ✅

- [ ] Sprint file marked complete
- [ ] BEST_PRACTICE.md updated with learnings

### docs/ (System Docs) - If Applicable ✅

- [ ] Upstream-Sync-Strategie ADR (wenn Phase 4 abgeschlossen)

---

## 📝 Sprint Retrospective (Ende)

### What went well? 👍

-

### What could be improved? 🤔

-

### Learnings → BEST_PRACTICE.md

- **Status:** 🟡 In Progress

  ***

## 📌 Vorgemerkt für Sprint 07

### Voice Commands & Conversation Sync

- Conversation sync (Web ↔ WhatsApp ↔ Telegram)
- Voice commands erkennen und weiterleiten

### Avatar Integration Tests

- Integration Test: LivePortrait render pipeline (end-to-end)
- Integration Test: TTS + STT pipeline
- E2E Test: Voice interaction flow (Browser → STT → Agent → TTS → Avatar)

### CI/CD Erweiterungen

- Docker Build + Push in CI
- Vitest JSON Reports + slowest-test Zusammenfassung
- Performance Benchmarks

---

## 📋 Aus Sprint 05 übernommen

> Automatisch übernommen von SPRINT_05.md

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

**Voraussetzung:** Sprint 05 abgeschlossen ✅
