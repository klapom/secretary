# LinkedIn Blog Posts — Secretary Project

---

## Post 1: Building Software with AI Agent Teams

_A candid account of using Claude Code + multi-agent teams to build a real production system_

---

We're building a personal AI assistant — voice, avatar, the whole thing. Real-time speech-to-text, text-to-speech, a LivePortrait-driven avatar, WebRTC streaming. All running locally on an NVIDIA DGX Spark with an ARM64 GPU.

Three sprints in, we've settled into a workflow that surprised us. I want to share what actually works — and what doesn't.

---

### The Setup: Agent Teams for Sprint Execution

Claude Code has a multi-agent feature where you can spawn specialized subagents, assign them tasks, and let them work in parallel. We started using this for sprint execution in Sprint 03.

The basic pattern: I break a sprint into independent tasks, spin up agents in parallel, and merge results when they're done. For Sprint 03 (Avatar System), three agents ran simultaneously:

- **LivePortrait agent** (Opus 4.6) — researching and implementing the Python microservice for avatar rendering
- **Character Manager agent** (Haiku 4.5) — completing the REST API for character profiles
- **WebRTC agent** (Sonnet 4.5) — fixing test bugs and documenting the integration contract

That last point brings me to something I didn't expect.

---

### Model Selection Actually Matters

We don't use the same model for everything. Claude recommends (and we've validated) a tiered approach:

**Opus 4.6** for tasks involving:

- Unknown technology (LivePortrait on ARM64 — nobody has documented this well)
- Complex integration across multiple services
- ML model debugging where you need to reason about edge cases

**Sonnet 4.5** for:

- Mid-complexity engineering (WebRTC signaling, TypeScript integration)
- Tasks where you understand the problem space but the implementation is non-trivial

**Haiku 4.5** for:

- CRUD APIs, database schema, REST endpoints
- Documentation updates
- Tasks where the pattern is clear and the work is mostly execution

The cost/quality tradeoff is real. Running Opus for a simple SQLite CRUD layer is wasteful. Running Haiku on "research how LivePortrait works on ARM64 and make it work" produces frustrating results.

**Concrete example from this sprint:** The Character Manager task was "implement 9 REST endpoints with SQLite backend." We assigned it to Haiku. Result: 26 tests, all passing, Bearer token auth, file upload with MIME validation, production-ready — in one shot. The same task in Opus would have cost 5-8x more.

---

### The Memory System: Make It Explicit

Claude Code has a persistent memory system. You can tell it what to remember across sessions.

What I learned: **don't leave it to the AI to decide what's worth remembering.** Be explicit. After we had wrong directories appearing in our codebase (more on that in a second), I told Claude directly:

_"Add a rule to memory that no new top-level folders should ever be created in the project root."_

That rule now lives in `MEMORY.md` and gets injected into every agent's context. Problem eliminated.

Other things we explicitly committed to memory:

- Which Docker base image quirks affect our ARM64 GPU (GB10/sm_121)
- That `transformers >= 4.43.0` breaks XTTS audio generation (this one nearly cost us two days)
- The exact PyTorch version pinning required for CUDA on our hardware
- That Distil-Whisper translates German to English instead of transcribing it

If you discover something hard — write it down. Tell the AI to remember it. The next session starts fresh; your memory doesn't have to.

---

### The Directory Structure Problem

This is embarrassing in retrospect, but worth sharing.

In Sprint 02, an agent created two new documentation folders at the project root. The project already had a clear structure: `docs/` for system docs, `docs-secretary/` for planning docs, `src/` for TypeScript, `docker/` for Python microservices. The agent, not knowing better, just made new folders where it felt logical.

The fix wasn't complex, but the lesson was:

**Agents need explicit spatial context, not just task context.**

We now include a full directory tree in `DEVELOPER_QUICK_REFERENCE.md` — the document every agent gets at spawn time. It shows exactly where things go, and it shows explicit ❌ examples of wrong placements:

```
❌ openclaw-source/MyNewFolder/      → NEVER create top-level dirs
❌ openclaw-source/liveportrait/     → WRONG (belongs in docker/liveportrait/)
✅ docker/liveportrait/              → Correct
✅ src/avatar/streaming/             → Correct
```

Three sprints of agents running, and this pattern hasn't reappeared since we added that section.

---

### What Parallel Agents Actually Look Like

This is what one morning of development looks like now:

```
09:00 — Review sprint board, break into independent tasks
09:15 — Spawn 3 agents in parallel (Opus/Sonnet/Haiku based on task complexity)
09:15 — Go do something else (or review previous sprint output)
~11:00 — First agent reports back (WebRTC tests: 44/48 green)
~11:30 — Second agent reports back (Character Manager: 26 tests, all endpoints live)
~14:00 — LivePortrait agent still working (ARM64 GPU compatibility is genuinely hard)
```

The fast tasks (CRUD, tests, docs) finish in 30-90 minutes. The hard research tasks take 2-4 hours. The key insight: **you're no longer blocked by sequential execution.** Three engineers working in parallel, asynchronously, reporting back to you.

The main risk: agents making conflicting changes to shared files. We handle this by designing tasks to own separate files/modules. The sprint plan defines clear ownership boundaries before we spawn anyone.

---

### What Doesn't Work Yet

**Honest limitations:**

1. **Long-running tasks need monitoring.** An agent working on something for 3 hours might hit a dead end and not tell you for 45 minutes. We check in periodically.

2. **Cross-agent coordination is manual.** If Agent A's output determines Agent B's input, you have to gate that manually (Phase 1 → Phase 2 in our sprint structure). There's no automatic handoff yet.

3. **Agents can't run Docker builds autonomously.** They write the Dockerfiles and configurations, but actually testing whether the container starts still requires human oversight — especially when dealing with ARM64 CUDA compatibility where things fail in subtle ways.

4. **Context contamination.** If you give an agent too much irrelevant context, it starts making decisions based on outdated information. We keep task prompts focused.

---

### The Bottom Line

Three sprints in, this workflow has become our default. The overhead of breaking work into agent tasks is more than offset by the parallelism. A sprint that would take a single developer a week runs in 2-3 days of wall clock time, with the human mostly doing review, integration decisions, and handling the genuinely ambiguous problems.

The magic isn't any single feature — it's the combination of persistent memory, parallel execution, model tier selection, and explicit spatial context (the directory structure rules). Any one of these alone is a minor improvement. Together, they're a substantial change to how a small team can execute.

We're not fully there yet. LivePortrait on ARM64 is still giving us trouble today. But the foundation is solid, and the pattern is repeatable.

If you're building something non-trivial and you haven't tried structured multi-agent execution for sprints — it's worth a session to experiment.

---

_Building a voice+avatar AI assistant locally. Following along? Happy to share more specifics._

`#ClaudeCode #AIAgents #SoftwareEngineering #LLM #DeveloperExperience`

---

---

## Post 2: Automating the Software Development Lifecycle

_How two shell scripts replaced 2 hours of manual overhead per sprint_

---

One of the most underrated productivity gains in our AI-assisted development workflow isn't the AI at all — it's the automation we built around it.

Every sprint in our project starts and ends with a single command. Here's what actually happens under the hood.

---

### Sprint Start: `./sprint-start.sh 03 "Avatar System"`

Running this script does five things automatically, in order:

**1. CI analysis**
It pulls the last GitHub Actions run via `gh run list` and checks whether it passed or failed. If CI was red at the end of the previous sprint, a note gets added to the new sprint backlog automatically. You can't accidentally start a sprint on a broken foundation and forget about it.

**2. Sprint file creation**
A sprint plan file gets generated from a template — `docs-secretary/sprints/SPRINT_03.md` — with the sprint number, name, and start/end dates already filled in. The 2-week window is calculated automatically. What you get is a structured document with features, acceptance criteria, task lists, time tracking, and a retrospective section — all ready to fill in.

**3. Previous sprint carryover check**
It scans the prior sprint file for unchecked items (`- [ ]`). If anything is incomplete, you get a warning: _"Found 7 incomplete tasks in Sprint 02. Review and transfer if needed."_ Nothing falls through the cracks silently.

**4. CLAUDE.md update**
The main project instruction file that every AI agent reads gets updated automatically: `Current Sprint: 03`. This means every agent that spawns during the sprint has the correct sprint context without any manual updates.

**5. Technical debt summary**
The current backlog of tracked technical debt items is printed, with high-priority items highlighted. Sprint planning always starts with awareness of the debt load.

Total time: about 10 seconds.

---

### Sprint End: `./sprint-end.sh 03`

This one does more:

**1. Full test run — hard gate**
`pnpm test` runs. If tests fail, the script exits. You cannot close a sprint on a red test suite. This sounds obvious, but without the hard gate, it's surprisingly easy to say "I'll fix that next sprint" and carry failing tests for weeks.

**2. Coverage check — soft gate**
If coverage drops below 80%, you get prompted: _"Coverage is 74%. Continue anyway? (y/n)"_ It's not a hard stop, but it forces a conscious decision instead of a silent regression.

**3. Four automated persona reviews**
This is the part I'm most proud of. Four specialized review scripts run sequentially:

- 🏗️ **Senior Architect** — checks for architectural violations, coupling issues, missing abstractions
- 🧪 **Senior Tester** — checks for untested paths, missing integration tests, edge cases
- 💻 **Senior Developer** — checks for code quality, anti-patterns, duplication
- 🔒 **Senior Security Engineer** — checks for credential exposure, injection vectors, insecure defaults

Each reviewer outputs findings into three buckets: Critical, Important, Nice-to-Have.

**4. Auto-fix Critical & Important**
Critical and Important findings trigger the auto-fix script. The AI fixes them before the sprint closes. This is the part that makes the system feel different from a linter — it's not just reporting problems, it's resolving them.

**5. Interactive Nice-to-Have triage**
Nice-to-have issues get listed one by one with a prompt: _"Fix now? (y/n)"_ If you say no, the item goes into `docs/TECHNICAL_DEBT.md` with an auto-generated ID. If you say yes, it gets fixed immediately. Nothing gets lost, and the decision is always explicit.

**6. CHANGELOG generation**
Commits since the last tag get parsed by type (`feat:`, `fix:`, `refactor:`, `security:`) and a CHANGELOG entry is generated automatically, complete with sprint metrics: coverage %, critical issues fixed, tech debt added.

**7. Git commit + tag + push prompt**
Everything gets committed with a structured message — sprint number, name, features, coverage stats. A version tag is created. Then you get asked: _"Push to remote? (y/n)"_ — the one human decision that should remain human.

Total time: 3-8 minutes depending on test suite size.

---

### Why This Matters

The goal wasn't automation for its own sake. It was to make the right thing the easy thing.

Without these scripts, sprint transitions look like this: Run tests (maybe). Check coverage (probably not). Review code quality (if there's time). Update the CHANGELOG (next week). Tag a release (eventually). The friction accumulates and standards slip.

With the scripts, every sprint ends the same way regardless of how rushed the last few days were. The AI agents that work on the next sprint start with accurate context. The technical debt register is always current. The CHANGELOG writes itself.

The total investment to build both scripts was maybe 4-5 hours. They've paid that back many times over across three sprints.

---

### The Bigger Pattern

What we've found is that AI-assisted development works best when the AI handles _implementation_ and automation handles _process_. The agents write the code. The scripts enforce the standards. Neither is sufficient alone — agents without process guardrails drift; scripts without capable implementation assistance can't fill the gaps they protect.

The combination is what makes it feel like a well-run engineering team rather than an autocomplete tool.

---

_Building a local AI assistant with voice, avatar, and multi-agent development sprints. Next up: Sprint 04._

`#DevOps #Automation #ClaudeCode #AIAgents #SoftwareEngineering #CI`
