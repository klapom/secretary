# Sprint 07 — Upstream Rebase: Secretary auf openclaw HEAD

**Sprint:** 07
**Dauer:** 2026-02-19 - 2026-03-04 (2 Wochen)
**Ziel:** Secretary-Änderungen sauber auf den aktuellen `openclaw/openclaw` HEAD rebasen — aus manueller Kopie wird ein echter, upstream-syncbarer Fork

---

## 🎯 Sprint-Ziel

Am Ende von Sprint 07 basiert Secretary auf dem aktuellen Stand von `openclaw/openclaw` (upstream/main).
Der Branch `secretary-on-upstream` ist vollständig erstellt, alle Secretary-spezifischen Features laufen,
CI ist grün, und zukünftige Upstream-Syncs sind via `git merge upstream/main` möglich.

**Hintergrund (aus Sprint 05/06 verschoben):**
Das Repo wurde durch manuelle Kopie gestartet — kein gemeinsamer git-Ancestor mit `openclaw/openclaw`.
Upstream-Fixes mussten bisher manuell via cherry-pick portiert werden.
Ab Sprint 08 soll `git fetch upstream && git merge upstream/main` direkt funktionieren.

**Success Criteria:**

- [ ] Branch `secretary-on-upstream` existiert, basiert auf `upstream/main` HEAD
- [ ] Alle Secretary-neuen Dateien/Dirs intakt: `docker/`, `docs-secretary/`, `.hooks/`, `stt_tts_test/`
- [ ] Alle Secretary-Kernänderungen portiert: Security-Fixes, Message Queue, Avatar System
- [ ] `pnpm test` grün (alle Tests bestehen)
- [ ] Coverage-Gate ≥ 80% (Threshold in `vitest.config.ts` wieder auf 80% setzen)
- [ ] `git merge upstream/main` funktioniert ohne Konflikte auf dem neuen Branch
- [ ] CI-Pipeline grün (GitHub Actions auf `secretary-on-upstream`)
- [ ] `origin/main` (klapom/secretary) wird auf neuen Branch umgestellt

---

## 📋 Phase 1: Analyse & Inventarisierung (~4h)

**Priority:** 🔴 CRITICAL (Blocker für alle weiteren Phasen)
**Model:** 🤖 Opus 4.6 (Architekturentscheidung)

**Ziel:** Vollständige, verifizierte Liste aller Secretary-spezifischen Änderungen erstellen.

### 1.1 Neue Dateien identifizieren (Secretary-exklusiv)

Alle Dateien, die upstream NICHT kennt — können konfliktfrei übertragen werden:

```bash
git diff --name-status upstream/main HEAD | grep "^A " | sort
```

Erwartete Secretary-neue Verzeichnisse (komplett neu, kein Konfliktrisiko):

- `docker/` — XTTS, Whisper, LivePortrait, EchoMimic V3 Services
- `docs-secretary/` — Sprint-Planung, Architecture, Development-Docs
- `.hooks/` — Sprint-Management-Skripte (sprint-start, sprint-end, persona-reviews)
- `stt_tts_test/` — Browser-basierte STT/TTS-Test-UI
- `src/avatar/` — Avatar-System-Integration (LivePortrait + TTS-Orchestrierung)
- `src/services/local-voice.ts` — lokale TTS/STT-Pipeline

### 1.2 Modifizierte Dateien inventarisieren

Dateien, die BEIDE (Secretary und upstream) verändert haben — Konfliktrisiko:

```bash
git diff --name-status upstream/main HEAD | grep "^M " | sort > /tmp/modified-files.txt
wc -l /tmp/modified-files.txt
```

Bekannte Secretary-Modifikationen an openclaw-Dateien:

- **Security:** `src/infra/exec-safety.ts`, `src/infra/fs-safe.ts` (SSRF, path traversal)
- **Queue:** `src/auto-reply/` (WhatsApp Race Condition Fix, persistente Queue)
- **Config:** `src/config/` (Secretary-spezifische Konfigurationsoptionen)
- **TTS/STT:** `src/tts/tts.ts` (local TTS integration)
- **CI:** `.github/workflows/ci-minimal.yml` (coverage-gate, security-audit, secret-scan Jobs)

### 1.3 Konflikt-Strategie dokumentieren

Für jede modifizierte Datei festlegen:

- `ours` — Unsere Version übernehmen (z.B. bei von uns komplett neu geschriebenen Files)
- `theirs` — upstream-Version übernehmen (z.B. bei reinen upstream-Bugfixes)
- `merge` — Manuelles Merge (z.B. Security-Fixes die beide Seiten haben)
- `cherry-pick` — Unseren Commit gezielt anwenden

**Tasks:**

- [ ] Task 1.1: `git diff --name-status upstream/main HEAD` ausführen, Ausgabe kategorisieren (1h)
- [ ] Task 1.2: Für jede modifizierte Datei Strategie festlegen (Tabelle in `docs-secretary/architecture/UPSTREAM_MERGE_STRATEGY.md`) (2h)
- [ ] Task 1.3: Secretary-Commits seit Beginn identifizieren, die upstream-Änderungen enthalten (1h)

---

## 📋 Phase 2: Branch Setup (~3h)

**Priority:** 🔴 CRITICAL
**Model:** 🤖 Sonnet 4.6

**Ziel:** Neuer Branch `secretary-on-upstream` von aktuellem upstream/main, alle konfliktfreien Secretary-Dateien übertragen.

```bash
# Schritt 1: Aktuellen upstream holen
git fetch upstream

# Schritt 2: Neuen Branch von upstream/main
git checkout -b secretary-on-upstream upstream/main

# Schritt 3: Secretary-neue Verzeichnisse direkt aus main branch holen
git checkout main -- docker/
git checkout main -- docs-secretary/
git checkout main -- .hooks/
git checkout main -- stt_tts_test/

# Schritt 4: Secretary-neue src-Dateien
git checkout main -- src/avatar/
git checkout main -- src/services/local-voice.ts
# (weitere neue Dateien aus Phase-1-Analyse)

# Schritt 5: Secretary-neue Config/CI-Files
git checkout main -- CLAUDE.md DEVELOPER_QUICK_REFERENCE.md
git checkout main -- .github/workflows/ci-minimal.yml
```

**Tasks:**

- [ ] Task 2.1: Branch `secretary-on-upstream` von upstream/main erstellen (15min)
- [ ] Task 2.2: Alle Secretary-neuen Verzeichnisse übertragen (1h)
- [ ] Task 2.3: Erste Smoke-Tests: `pnpm install && pnpm build` (30min)
- [ ] Task 2.4: Commit: `"chore: add Secretary-specific new directories onto openclaw HEAD"` (15min)

---

## 📋 Phase 3: Secretary-Kernänderungen portieren (~8h)

**Priority:** 🔴 CRITICAL
**Model:** 🤖 Sonnet 4.6

**Ziel:** Alle Secretary-Modifikationen an bestehenden openclaw-Dateien auf `secretary-on-upstream` anwenden.

### 3.1 Security-Fixes portieren

Die von uns implementierten Security-Fixes (SSRF, path traversal, sandbox):

```bash
# Commits aus main die Security-Fixes enthalten
git log main --oneline --grep="security\|fix(security)" | head -10
# Dann selektives cherry-pick oder manuelles Merge
```

- [ ] SSRF-Schutz (`src/infra/exec-safety.ts`, `src/infra/fs-safe.ts`)
- [ ] Path-Traversal-Fix
- [ ] Sandbox-Hardening
- [ ] Überprüfen: Hat upstream dieselben Fixes? → ggf. `theirs` wählen

### 3.2 WhatsApp Message Queue portieren

Der persistente Queue-Fix ist Secretary-spezifisch (upstream hat ihn nicht):

- [ ] `src/message-queue/` — vollständig übertragen
- [ ] `src/auto-reply/queue/` — Secretary-Erweiterungen übertragen
- [ ] Integration-Tests mitübertragen

### 3.3 TTS/STT-Integration portieren

- [ ] `src/tts/tts.ts` — local TTS integration (XTTS-Aufruf)
- [ ] `src/services/local-voice.ts` — bereits als neue Datei in Phase 2

### 3.4 Config-Änderungen portieren

- [ ] Secretary-spezifische Konfigurationsoptionen in `src/config/`
- [ ] Überprüfen gegen upstream-Änderungen (upstream hat Config ebenfalls geändert)

### 3.5 CI/CD portieren

- [ ] `.github/workflows/ci-minimal.yml` — coverage-gate, security-audit, secret-scan
- [ ] Anpassen an upstream CI-Struktur (upstream CI-Workflow könnte sich geändert haben)

**Tasks:**

- [ ] Task 3.1: Security-Commits cherry-pick/manuell (2h)
- [ ] Task 3.2: Message Queue übertragen (2h)
- [ ] Task 3.3: TTS/STT-Integration (1h)
- [ ] Task 3.4: Config-Änderungen (1h)
- [ ] Task 3.5: CI/CD anpassen (1h)
- [ ] Task 3.6: Zwischenstand: `pnpm test` (nur Basics — nicht Coverage) (1h)

---

## 📋 Phase 4: Konfliktlösung & TypeScript-Fix (~8h)

**Priority:** 🟡 IMPORTANT
**Model:** 🤖 Sonnet 4.6

**Ziel:** Alle Konflikte zwischen Secretary-Änderungen und upstream-Änderungen lösen,
TypeScript-Fehler auf ein akzeptables Niveau bringen.

### 4.1 Konflikte identifizieren und lösen

```bash
# TypeScript-Fehler nach Phase 3
pnpm tsgo 2>&1 | grep "error TS" | wc -l

# Fehler nach Kategorie auflisten
pnpm tsgo 2>&1 | grep "error TS" | sed 's/.*error TS\([0-9]*\).*/TS\1/' | sort | uniq -c | sort -rn
```

Erwartete Konflikte:

- API-Signatur-Änderungen in upstream (Secretary-Code ruft veränderte APIs auf)
- Typ-Definitionen, die upstream umstrukturiert hat
- Import-Pfade, die durch upstream-Refactoring verschoben wurden

### 4.2 Test-Fixes

- [ ] Tests die aufgrund von upstream-API-Änderungen brechen
- [ ] Mock-Updates für veränderte Module
- [ ] Flaky Tests identifizieren

### 4.3 Coverage-Gate wiederherstellen

- [ ] `vitest.config.ts` Threshold von 79% zurück auf 80% setzen
- [ ] Fehlende Coverage durch gezielte Tests ergänzen (falls nötig)

**Tasks:**

- [ ] Task 4.1: TS-Fehler kategorisieren und systematisch lösen (4h)
- [ ] Task 4.2: Test-Suite grün machen (2h)
- [ ] Task 4.3: Coverage ≥ 80% wiederherstellen (2h)

---

## 📋 Phase 5: CI & Integration (~4h)

**Priority:** 🟡 IMPORTANT
**Model:** 🤖 Sonnet 4.6

**Ziel:** CI-Pipeline grün, Branch auf GitHub verfügbar, origin/main umgestellt.

### 5.1 GitHub Actions CI grün

- [ ] `.github/workflows/ci-minimal.yml` auf `secretary-on-upstream` pushen
- [ ] CI-Lauf beobachten, Fehler beheben
- [ ] Coverage-Gate, Security-Audit, Secret-Scan alle grün

### 5.2 Upstream-Sync-Test

```bash
git fetch upstream
git merge upstream/main
# Ziel: Keine Konflikte (alle Secretary-Dateien sind "neu", nicht konfligierend)
```

### 5.3 origin/main umstellen

```bash
# Auf GitHub: Branch secretary-on-upstream als main setzen
# Oder: PR erstellen und mergen
git push origin secretary-on-upstream:main --force-with-lease
```

**Tasks:**

- [ ] Task 5.1: Branch pushen, CI-Lauf starten (30min)
- [ ] Task 5.2: CI-Fehler beheben (2h)
- [ ] Task 5.3: `git merge upstream/main` testen (30min)
- [ ] Task 5.4: origin/main umstellen (Absprache mit User nötig) (30min)

---

## 🚫 Out of Scope

- ❌ Voice Commands (Conversation sync Web↔WhatsApp↔Telegram) — Sprint 08
- ❌ Avatar Integration E2E-Tests — Sprint 08
- ❌ Docker Build in CI — Sprint 08
- ❌ Load Testing / Performance Benchmarks — Sprint 08-09
- ❌ EchoMimic in Web-UI integrieren — Sprint 08

---

## 📊 Sprint Metrics

### Velocity

- **Geplanter Aufwand:** ~27h (Phases 1-5)
- **Completed:** - (wird am Ende gefüllt)

### Time Tracking

| Phase                         | Geplant | Actual |
| ----------------------------- | ------- | ------ |
| Phase 1: Analyse              | 4h      | -      |
| Phase 2: Branch Setup         | 3h      | -      |
| Phase 3: Kernänderungen       | 8h      | -      |
| Phase 4: Konflikte & TS-Fixes | 8h      | -      |
| Phase 5: CI & Integration     | 4h      | -      |

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
- [ ] `docs-secretary/architecture/UPSTREAM_MERGE_STRATEGY.md` erstellt (Phase 1)
- [ ] BEST_PRACTICE.md updated with rebase learnings

### docs/ (System Docs)

- [ ] ADR: "Upstream-Sync-Strategie" (Branch `secretary-on-upstream` als neues Main)

---

## 📝 Sprint Retrospective (Ende)

### What went well? 👍

-

### What could be improved? 🤔

-

### Learnings → BEST_PRACTICE.md

- **Status:** 🟡 In Progress

---

## 📌 Vorgemerkt für Sprint 08

### Voice Commands & Conversation Sync

- Conversation sync (Web ↔ WhatsApp ↔ Telegram)
- Voice commands erkennen und weiterleiten
- EchoMimic V3 in Web-UI integrieren (Lip-Sync bei TTS-Antworten)

### Avatar Integration Tests

- Integration Test: LivePortrait render pipeline (end-to-end)
- Integration Test: TTS + STT pipeline
- E2E Test: Voice interaction flow (Browser → STT → Agent → TTS → Avatar → EchoMimic)

### CI/CD Erweiterungen

- Docker Build + Push in CI
- Vitest JSON Reports + slowest-test Zusammenfassung
- Performance Benchmarks

---

## 📋 Aus Sprint 06 übernommen

> Automatisch übernommen von SPRINT_06.md

### Coverage Verbesserung (auf 80%+ halten)

Coverage-Gate in `vitest.config.ts` wurde für Sprint-06-Abschluss auf 79% gesetzt.
In Sprint 07 Phase 4.3 muss er wieder auf 80% gesetzt und gehalten werden.

### FIXME-Schulden (aus Persona-Review Sprint 05)

Noch nicht erledigte FIXMEs aus Sprint 06 Phase 2:

- `// FIXME(arch-json-parse)` — restliche Stellen prüfen
- `// FIXME(sec-*)` — restliche Security-FIXMEs
- `// FIXME(dev-console-log)` — restliche console.log-Stellen
