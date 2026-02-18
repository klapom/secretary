# Upstream Merge Strategy — Sprint 07

**Erstellt:** 2026-02-18
**Upstream HEAD:** `bdb13d6c4c1f0dcc5dad76e3569a37300159f73f`
**Unser HEAD:** `32b036985f3002a220ef06d2a1427a54b70e96e4`
**Neue Commits in upstream seit letztem Sync (`fc5bcebd0`):** 13

## Zusammenfassung

| Kategorie                                        | Anzahl |
| ------------------------------------------------ | ------ |
| Neue Dateien (Secretary-exklusiv)                | 968    |
| Modifizierte Dateien (beidseitig)                | 1979   |
| Gelöschte Dateien (upstream hat sie, wir nicht)  | 332    |
| Umbenannte Dateien (upstream hat sie verschoben) | 144    |

## Neue Dateien (Secretary-exklusiv, kein Konfliktrisiko)

Diese Dateien existieren nur in Secretary und koennen konfliktfrei uebertragen werden.

| Verzeichnis/Kategorie             | Anzahl | Beschreibung                                                                   |
| --------------------------------- | ------ | ------------------------------------------------------------------------------ |
| `apps/` (Android/macOS/SharedKit) | 469    | Secretary-branded mobile/desktop apps                                          |
| `src/` (diverse neue Module)      | 390    | Neue Secretary-Quellcode-Module (event-bus, security, sessions, logging, etc.) |
| `docker/`                         | 40     | Docker Services (XTTS, Whisper, LivePortrait, EchoMimic, Canary)               |
| `docs-secretary/`                 | 33     | Secretary-Planungsdoku, Sprints, Architektur                                   |
| `src/avatar/`                     | 27     | Avatar-System (LivePortrait, Expression, Pipeline)                             |
| `ui/avatar-chat/`                 | 23     | Avatar Chat UI                                                                 |
| `.hooks/`                         | 9      | Sprint-Hooks, Persona-Reviews, Auto-Fix                                        |
| `src/services/`                   | 3      | local-voice.ts, weitere Services                                               |
| `.github/workflows/`              | 2      | ci-minimal.yml (coverage-gate, security-audit, secret-scan)                    |
| Sonstige (root-level)             | ~10    | DEVELOPER_QUICK_REFERENCE.md, KNOWN_ISSUES.md, secretary.mjs, etc.             |

## Modifizierte Dateien (Konfliktrisiko)

Die 1979 modifizierten Dateien umfassen praktisch die gesamte Codebase. Upstream hat 13 Refactoring-Commits gemacht (Deduplizierung, Code-Sharing), die viele Dateien betreffen.

### Hoch-Risiko (Secretary-spezifische Aenderungen + Upstream-Refactoring)

| Datei                               | Strategie | Begruendung                                               |
| ----------------------------------- | --------- | --------------------------------------------------------- |
| `src/infra/fs-safe.ts`              | **ours**  | Secretary SSRF/Path-Traversal-Schutz (12 Zeilen Diff)     |
| `src/tts/tts.ts`                    | **ours**  | Secretary local TTS Integration (237 Zeilen Diff)         |
| `src/tts/tts-core.ts`               | **ours**  | TTS Core mit local-voice Support                          |
| `src/tts/tts.test.ts`               | **ours**  | TTS Tests fuer local-voice                                |
| `src/agents/tools/tts-tool.ts`      | **merge** | TTS Tool — pruefen ob upstream Aenderungen kompatibel     |
| `src/gateway/server-methods/tts.ts` | **merge** | Gateway TTS endpoint                                      |
| `src/config/schema.ts`              | **merge** | Secretary config extensions + upstream Schema-Aenderungen |
| `src/config/types.tts.ts`           | **ours**  | Secretary TTS config types                                |
| `src/config/defaults.ts`            | **merge** | Secretary defaults + upstream defaults                    |
| `src/config/zod-schema.ts`          | **merge** | Secretary Zod-Erweiterungen + upstream Schema             |

### Mittel-Risiko (Upstream-Refactoring betrifft Code den Secretary auch geaendert hat)

| Datei-Bereich                    | Strategie              | Begruendung                                                                                                                  |
| -------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/auto-reply/` (~130 Dateien) | **merge**              | Secretary Queue-Fix + upstream Refactoring (queue moved to `src/auto-reply/queue/`)                                          |
| `src/config/` (~60 Dateien)      | **merge**              | Secretary config extensions + upstream Schema-Changes                                                                        |
| `src/gateway/` (~100+ Dateien)   | **theirs** then apply  | Upstream hat massives Gateway-Refactoring (Unterverzeichnisse: `core/`, `api/`, `hooks/`, `sessions/`, `server/`, `shared/`) |
| `src/agents/` (~40 Dateien)      | **theirs** then review | Upstream Refactoring, Secretary hat wenige Aenderungen hier                                                                  |

### Niedrig-Risiko (hauptsaechlich Upstream-Refactoring, keine Secretary-Aenderungen)

| Datei-Bereich                      | Strategie  | Begruendung                                             |
| ---------------------------------- | ---------- | ------------------------------------------------------- |
| `apps/ios/`, `apps/macos/`         | **theirs** | Upstream iOS/macOS Updates, keine Secretary-Aenderungen |
| `extensions/`                      | **theirs** | Channel-Plugin Updates von upstream                     |
| `ui/src/`                          | **theirs** | UI Updates von upstream                                 |
| `src/slack/`, `src/discord/`, etc. | **theirs** | Channel-spezifisch, keine Secretary-Aenderungen         |

## Geloeschte Dateien (332 Dateien)

Upstream hat 332 Dateien geloescht (Refactoring: Test-Helpers konsolidiert, Module zusammengefuehrt).

**Empfehlung:** `theirs` — upstream Loeschungen uebernehmen. Secretary hat keine dieser Dateien modifiziert.

Betroffene Bereiche:

- `src/agents/` — Viele Test-Helpers und Hilfsdateien konsolidiert
- `src/auto-reply/` — Export-HTML Templates, Queue-Dateien (verschoben)
- `src/gateway/` — Massiv restrukturiert (siehe Umbenennungen)
- `src/memory/` — Embeddings-Module konsolidiert
- `ui/src/i18n/` — I18n komplett entfernt

## Umbenannte Dateien (144 Dateien)

Upstream hat grosse Restrukturierung durchgefuehrt:

| Von                               | Nach                                                       | Anzahl |
| --------------------------------- | ---------------------------------------------------------- | ------ |
| `src/gateway/*.ts`                | `src/gateway/{core,api,hooks,sessions,server,shared}/*.ts` | ~120   |
| `src/auto-reply/reply/queue/*.ts` | `src/auto-reply/queue/*.ts`                                | ~8     |
| `src/auto-reply/reply/exec/*.ts`  | `src/auto-reply/exec/*.ts`                                 | ~2     |

**Empfehlung:** `theirs` fuer Umbenennungen. Secretary-Aenderungen an betroffenen Dateien muessen danach auf die neuen Pfade angewendet werden.

## Upstream-Aenderungen seit letztem Sync (13 Commits)

```
bdb13d6c4 refactor(cron-cli): share enable-disable command wiring
8369913c7 refactor(models): reuse validated config snapshot loader
61c0c147a refactor(update-cli): share timeout option validation
b704bad8f test: merge telegram thread id normalization assertions
c0e0d4c63 test: dedupe empty-array counter checks in sandbox formatters
e9a37d7af test: merge telegram probe success retry variants
3128bd285 test: dedupe non-matching unhandled rejection cases
3b481001d test: merge duplicate line carousel column-limit cases
2157385ff refactor(auto-reply): share unique model catalog insertion
c7458782b refactor(cli): dedupe service-load and command-removal loops
5e76cefc7 refactor(gateway): share session store lookup map builder
b4cba304e refactor(outbound): reuse required channel/plugin resolution
a117e9fed refactor(outbound): share plugin send/poll dispatch path
```

Alle 13 Commits sind **Refactoring/Test-Deduplizierung** — keine neuen Features, keine Breaking Changes. Risiko: niedrig bis mittel (viele Dateien betroffen, aber nur Code-Reorganisation).

## Empfohlene Reihenfolge fuer Phase 2-3

### Phase 2: Branch erstellen und konfliktfreie Dateien portieren

1. **Branch `secretary-on-upstream` von `upstream/main` erstellen**
2. **Neue Secretary-Verzeichnisse (kein Konflikt):**
   - `docker/` (40 Dateien)
   - `docs-secretary/` (33 Dateien)
   - `.hooks/` (9 Dateien)
   - `.github/workflows/ci-minimal.yml`
   - `ui/avatar-chat/` (23 Dateien)
   - Root-Dateien: `DEVELOPER_QUICK_REFERENCE.md`, `KNOWN_ISSUES.md`, `secretary.mjs`, etc.
3. **Neue Secretary-src-Dateien (kein Konflikt):**
   - `src/avatar/` (27 Dateien)
   - `src/services/local-voice.ts` etc. (3 Dateien)
   - `src/event-bus/`, `src/security/`, `src/sessions/`, `src/logging/` etc.
   - `src/message-queue/`, `src/media-understanding/`
4. **Apps (Secretary-branded, kein Konflikt):**
   - `apps/android/` (Secretary-spezifisch)
   - `apps/macos/Sources/Secretary*/`
   - `apps/shared/SecretaryKit/`

### Phase 3: Modifizierte Dateien mergen

5. **Unkritische Merges zuerst (theirs + review):**
   - `extensions/`, `ui/src/`, Channel-Dateien
6. **Mittlere Komplexitaet:**
   - `src/auto-reply/` — Queue-Aenderungen auf neue Pfade anpassen
   - `src/config/` — Schema-Erweiterungen pruefen
7. **Hohe Komplexitaet (manuell):**
   - `src/tts/tts.ts` — local-voice Integration auf upstream TTS anwenden
   - `src/infra/fs-safe.ts` — SSRF-Schutz auf upstream Version anwenden
   - `src/gateway/` — Secretary-Aenderungen auf neue Unterverzeichnisstruktur mappen

### Phase 4: Validierung

8. **TypeScript-Kompilierung:** `pnpm build` (Import-Pfade pruefen!)
9. **Tests:** `pnpm test` (80%+ Coverage Gate)
10. **Docker Services:** Smoke-Test aller Docker Services
