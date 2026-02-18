# Secretary - Planning Documentation Index

**Last Updated:** 2026-02-16
**Version:** 0.1.0 (Sprint 01 Ready)
**Status:** Planning Complete ✅

---

## 🎯 Quick Navigation

### 🔥 Always Load First

**[DEVELOPER_QUICK_REFERENCE.md](../DEVELOPER_QUICK_REFERENCE.md)** ⭐
_Ultra-compact reference with all critical links - keep in context during development_

### 📘 Two Documentation Systems

**1. Planning Docs (This Directory - `docs-secretary/`)**
What we're **building, changing, and refactoring**

**2. [Original Secretary Docs](../docs/index.md) (`docs/`)**
How the **existing system works** - Reference this during development!

---

## 🔗 Essential Original Docs (Load as Needed)

**When developing, refer to these existing system docs:**

| Topic                | Link                                                              | When to Read                    |
| -------------------- | ----------------------------------------------------------------- | ------------------------------- |
| Gateway Architecture | [docs/concepts/architecture.md](../docs/concepts/architecture.md) | Understanding Gateway structure |
| Message Queue        | [docs/concepts/queue.md](../docs/concepts/queue.md)               | Implementing queue feature      |
| Models & Providers   | [docs/concepts/models.md](../docs/concepts/models.md)             | LLM integration                 |
| Sessions             | [docs/concepts/sessions.md](../docs/concepts/sessions.md)         | Session management              |
| Agent Loop           | [docs/concepts/agent-loop.md](../docs/concepts/agent-loop.md)     | How agents work                 |
| Multi-Agent          | [docs/concepts/multi-agent.md](../docs/concepts/multi-agent.md)   | Subagent spawning               |
| Memory               | [docs/concepts/memory.md](../docs/concepts/memory.md)             | Conversation memory             |
| WhatsApp/Baileys     | [docs/whatsapp/](../docs/whatsapp/)                               | WhatsApp integration            |
| All Channels         | [docs/channels/](../docs/channels/)                               | 36 channel plugins              |
| Tools                | [docs/tools/](../docs/tools/)                                     | Built-in tools                  |

---

## 📚 Planning Documentation Structure

**This directory contains our planning, ADRs, and sprint plans.**

---

## 🏗️ Architecture & Decisions

**Location:** `docs/architecture/`

### Core Architecture Documents

- **[FINAL_ARCHITECTURE_DECISIONS.md](architecture/FINAL_ARCHITECTURE_DECISIONS.md)**
  - Summary of all 12 ADR decisions
  - Final system architecture diagram
  - Migration paths (Monolith → Microservices, Local → Cloud)
  - Security features matrix
  - **READ THIS FIRST** for architecture overview

- **[ARCHITECTURE_DECISIONS.md](architecture/ARCHITECTURE_DECISIONS.md)**
  - Detailed ADR-01 to ADR-10 with alternatives A, B, C, D
  - Each ADR includes: Problem, Alternatives with code examples, Pros/Cons, Effort estimation
  - Covers: Monolith vs Microservices, Message Queue, Database, Sandbox, Event Bus, Authentication, Logging, State Management, Testing, Deployment

### Specific Feature ADRs

- **[ADR_11_AVATAR_INTERFACE.md](architecture/ADR_11_AVATAR_INTERFACE.md)**
  - Avatar implementation alternatives (LivePortrait, D-ID, HeyGen, SadTalker)
  - Character customization system
  - Migration strategy: Stylized → Hyperrealistic
  - Code examples and integration patterns

- **[ADR_12_KILL_SWITCH.md](architecture/ADR_12_KILL_SWITCH.md)**
  - Kill Switch implementation with state machine
  - Multi-layer shutdown sequence
  - API, CLI, Hardware button triggers
  - Integration in all modules
  - Security considerations

### Avatar System Documentation

- **[AVATAR_MIGRATION_STRATEGY.md](architecture/AVATAR_MIGRATION_STRATEGY.md)**
  - Interface-based design allowing renderer swap
  - Migration effort estimation (B→A: 2 weeks)
  - Performance optimization strategies

- **[AVATAR_SYSTEM_INTEGRATION.md](architecture/AVATAR_SYSTEM_INTEGRATION.md)**
  - Integration into both Monolith and Microservices architectures
  - Character Manager implementation
  - Storage strategies (Local → Cloud)
  - WebRTC streaming architecture

---

## 💻 Development Workflow

**Location:** `docs/development/`

- **[BEST_PRACTICE.md](development/BEST_PRACTICE.md)**
  - ✅ Successful patterns (Interface-based design, Event Bus, Multi-layer defense)
  - ❌ Anti-patterns to avoid (Closures over socket references, `any` types, secrets in env vars)
  - Tool-specific tips (TypeScript, Docker, Testing)
  - Security best practices
  - **READ BEFORE CODING**

- **[WORKFLOW_COMPLETE.md](development/WORKFLOW_COMPLETE.md)**
  - Comprehensive checklist of all implemented workflow features
  - Sprint Planning & Execution automation
  - Testing strategy implementation
  - Persona Reviews process
  - CI/CD evolution plan
  - Version control workflow

- **[WORKFLOW_ENHANCEMENTS.md](development/WORKFLOW_ENHANCEMENTS.md)**
  - 15 additional workflow recommendations
  - Prioritized: Must Have, Should Have, Nice to Have
  - Pre-commit hooks, Conventional commits, Code coverage badges
  - Performance benchmarks, API documentation

---

## 📅 Planning & Roadmap

**Location:** `docs/planning/`

- **[IMPLEMENTATION_ROADMAP.md](planning/IMPLEMENTATION_ROADMAP.md)**
  - **12-week detailed sprint plan**
  - Phase 1 (Weeks 1-2): Core Foundation
  - Phase 2 (Weeks 3-4): Agent Runtime + Tools
  - Phase 3 (Weeks 5-6): Security & Messaging
  - Phase 4 (Weeks 7-8): Avatar System
  - Phase 5 (Weeks 9-10): MCP Integration
  - Phase 6 (Week 11): Frontend
  - Phase 7 (Week 12): Testing & Polish
  - **USE THIS FOR SPRINT PLANNING**

- **[SPRINT_TEMPLATE_V2.md](planning/SPRINT_TEMPLATE_V2.md)**
  - Sprint template focused on implementation
  - Features, Tasks, Tests, Dependencies
  - Persona Review findings section
  - CI/CD improvement tracking
  - Use for creating new sprint files in `docs/sprints/`

---

## 📖 Feature Guides & Integration

**Location:** `docs/guides/`

### Integration Guides

- **[MCP_INTEGRATION.md](guides/MCP_INTEGRATION.md)**
  - MCP (Model Context Protocol) Client implementation
  - Integration with standard MCP servers (filesystem, git, github)
  - Custom MCP servers for OpenClaw (docker-executor, browser, avatar)
  - Configuration and security considerations

- **[FRONTEND_PLANNING.md](guides/FRONTEND_PLANNING.md)**
  - 5 UI components: Avatar Chat, Admin Dashboard, Character Studio, History Viewer, Kill Switch Panel
  - React 18 + TypeScript + TailwindCSS
  - WebRTC integration for avatar streaming
  - Component architecture and state management

### Analysis & Specification

- **[OPENCLAW_ANALYSIS_AND_SPECIFICATION.md](guides/OPENCLAW_ANALYSIS_AND_SPECIFICATION.md)**
  - Original OpenClaw analysis
  - Critical issues identified (WhatsApp race conditions, security vulnerabilities, performance issues)
  - Multi-persona review findings
  - Specification for rebuilding while avoiding all issues

### Use Cases

- **[UseCases.md](guides/UseCases.md)**
  - UC-01 to UC-60 covering all features
  - Messaging, Avatar, Tools, Security, MCP, Admin use cases
  - Each with: User Story, Steps, Expected Result, Test reference
  - **USE FOR ACCEPTANCE CRITERIA**

---

## 🏃 Sprint Files

**Location:** `docs/sprints/`

Individual sprint files are created using the template:

- `SPRINT_01.md` - Core Foundation
- `SPRINT_02.md` - Agent Runtime + Tools
- `SPRINT_03.md` - Security & Messaging
- etc.

Each sprint file contains:

- Sprint goals and success criteria
- Features and tasks
- Acceptance criteria
- Implementation notes
- Test specifications
- Persona review findings (end of sprint)
- Retrospective

---

## 🔄 Automation & Hooks

**Location:** `.hooks/`

### Sprint Management

- **`.hooks/sprint-start.sh`**
  - Analyzes last CI run
  - Creates Sprint file from template
  - Checks incomplete tasks from previous sprint
  - Updates CLAUDE.md with current sprint number
  - Shows Technical Debt summary

- **`.hooks/sprint-end.sh`**
  - Runs all tests (requires 80%+ coverage)
  - Executes Persona Reviews (4 senior roles)
  - Auto-fixes Critical/Important issues
  - Interactive decision for Nice-to-Have (fix or tech debt)
  - Updates CHANGELOG.md automatically
  - Creates git commit + tag
  - Optional push to remote

### Persona Review Scripts (to be implemented)

- `.hooks/persona-reviews/architect.js`
- `.hooks/persona-reviews/tester.js`
- `.hooks/persona-reviews/developer.js`
- `.hooks/persona-reviews/security.js`

### Auto-Fix Scripts (to be implemented)

- `.hooks/auto-fix.js` - Auto-fixes Critical/Important issues
- `.hooks/add-to-tech-debt.js` - Adds Nice-to-Have to TECHNICAL_DEBT.md
- `.hooks/remove-from-tech-debt.js` - Removes resolved items

---

## 🔧 Technical Debt

**Location:** `docs/` (root level)

- **TECHNICAL_DEBT.md** (to be created)
  - Central register for all tech debt
  - Categorized by priority (High/Medium/Low)
  - Tracks: Origin, Impact, Effort, Status
  - Auto-populated from Nice-to-Have findings

---

## 📝 Change Management

**Location:** Root directory

- **CHANGELOG.md**
  - Keep a Changelog format
  - Semantic versioning
  - Auto-updated by sprint-end.sh
  - Includes sprint metrics (coverage, story points, issues)

---

## 🚀 CI/CD

**Location:** `.github/workflows/`

- **ci-minimal.yml**
  - Minimal CI: Lint, Type Check, Unit Tests
  - Placeholder for iterative improvements per sprint
  - CI status reporting
  - Evolution plan:
    - Sprint 01: Lint + Type Check + Unit Tests ✅
    - Sprint 02: + Integration Tests
    - Sprint 03: + E2E Tests
    - Sprint 04: + Coverage Reporting
    - Sprint 05: + Security Audit
    - Sprint 06: + Docker Build
    - Sprint 07: + Performance Benchmarks
    - Sprint 08: + Deployment

---

## 📊 Quick Reference Tables

### Document Purpose Matrix

| Need                           | Document                        | Location           |
| ------------------------------ | ------------------------------- | ------------------ |
| Architecture overview          | FINAL_ARCHITECTURE_DECISIONS.md | docs/architecture/ |
| Detailed ADR with alternatives | ARCHITECTURE_DECISIONS.md       | docs/architecture/ |
| Avatar system design           | ADR_11_AVATAR_INTERFACE.md      | docs/architecture/ |
| Kill switch design             | ADR_12_KILL_SWITCH.md           | docs/architecture/ |
| Coding best practices          | BEST_PRACTICE.md                | docs/development/  |
| Sprint planning                | IMPLEMENTATION_ROADMAP.md       | docs/planning/     |
| Sprint template                | SPRINT_TEMPLATE_V2.md           | docs/planning/     |
| MCP integration                | MCP_INTEGRATION.md              | docs/guides/       |
| Frontend design                | FRONTEND_PLANNING.md            | docs/guides/       |
| Use cases                      | UseCases.md                     | docs/guides/       |
| Workflow automation            | WORKFLOW_COMPLETE.md            | docs/development/  |

### Technology Stack Quick Reference

| Layer      | Current (Phase 1)              | Future (Phase 2)      |
| ---------- | ------------------------------ | --------------------- |
| Runtime    | Node.js 22 + TypeScript        | Same                  |
| Database   | SQLite + WAL                   | PostgreSQL            |
| Sandbox    | Docker (hardened)              | gVisor (optional)     |
| LLM        | Anthropic Claude 4.6           | Same                  |
| Avatar     | LivePortrait + XTTS (Stylized) | Hyperrealistic option |
| Event Bus  | In-Process EventEmitter        | NATS                  |
| Frontend   | React 18 + TypeScript          | Same                  |
| Testing    | Jest + Playwright              | Same                  |
| Deployment | Docker Compose (DGX Spark)     | Kubernetes (Cloud)    |

---

## 🎯 Common Tasks - Quick Guide

### Starting a New Sprint

1. Read: `docs/planning/IMPLEMENTATION_ROADMAP.md` for sprint goals
2. Run: `./.hooks/sprint-start.sh <num> "<name>"`
3. Edit: `docs/sprints/SPRINT_0X.md` with specific tasks
4. Review: `docs/development/BEST_PRACTICE.md` for patterns
5. Start coding

### During Development

1. Check: `docs/development/BEST_PRACTICE.md` for patterns
2. Reference: Relevant ADRs in `docs/architecture/`
3. Write tests (80%+ coverage)
4. Follow security checklist in BEST_PRACTICE.md

### Ending a Sprint

1. Run: `./.hooks/sprint-end.sh <num>`
2. Review: Auto-generated CHANGELOG.md entry
3. Update: `docs/guides/UseCases.md` if new features
4. Update: `docs/development/BEST_PRACTICE.md` if learnings
5. Review: `TECHNICAL_DEBT.md` for newly added items

### Finding Information

- **Architecture question?** → `docs/architecture/FINAL_ARCHITECTURE_DECISIONS.md`
- **How to implement X?** → Specific ADR in `docs/architecture/`
- **Coding best practice?** → `docs/development/BEST_PRACTICE.md`
- **What to build next?** → `docs/planning/IMPLEMENTATION_ROADMAP.md`
- **Acceptance criteria?** → `docs/guides/UseCases.md`
- **Workflow question?** → `docs/development/WORKFLOW_COMPLETE.md`

---

## 📞 Support & Resources

### External Documentation

- [Anthropic API Docs](https://docs.anthropic.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Baileys (WhatsApp)](https://github.com/WhiskeySockets/Baileys)
- [Playwright Docs](https://playwright.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Internal Resources

- Main Entry: `CLAUDE.md` (root)
- This Index: `docs/INDEX.md`
- Repository: (to be set up)
- Issues: (to be set up)

---

**Version:** 0.1.0
**Last Updated:** 2026-02-16
**Status:** Ready for Sprint 01 🚀
