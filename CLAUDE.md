# Secretary - Personal AI Assistant

**Version:** 2026.2.16 (Secretary - ex-OpenClaw)
**Current Sprint:** 01 - Critical Fixes Part 1 (🟢 In Progress)
**Tech Stack:** TypeScript, Node.js 22, pnpm, Docker
**Deployment:** DGX Spark (Local) → Cloud Migration later
**Codebase:** 3,009 TypeScript files, 36 channel plugins, 52 skills

---

## Quick Start

### Sprint Management
```bash
# Start new sprint
./.hooks/sprint-start.sh 01 "Core Foundation"

# End current sprint
./.hooks/sprint-end.sh 01
```

### Development
```bash
pnpm install         # Install dependencies
pnpm dev             # Start development server
pnpm test            # Run all tests
pnpm build           # Build for production
secretary gateway    # Start gateway (after build)
```

---

## Architecture Overview

**Pattern:** Modular Monolith → Microservices Migration Path

**Core Modules:**
- **Agent Runtime:** LLM orchestration, tool execution, kill switch
- **Messaging:** WhatsApp integration with queue-based race condition fix
- **Avatar System:** LivePortrait + XTTS (Stylized → Hyperrealistic migration)
- **Security:** Multi-layer (Sandbox, Encryption, Access Control)
- **MCP Integration:** Anthropic Model Context Protocol support

---

## Current Focus

**Phase:** Sprint 01 Started 🟢 (2026-02-16)
**Approach:** Hybrid (Refactor existing Secretary codebase, not build from scratch)
**Duration:** 2 Weeks (2026-02-16 to 2026-02-28)

**Sprint 01 Priorities:**
- 🔴 Message Queue (WhatsApp race condition #16918 fix)
- 🔴 Security Layer Phase 1 (credential redaction, sandbox hardening)
- 🟡 Event Bus foundation (decouple Gateway)
- 🧪 Test infrastructure (80%+ coverage)

**What Already Exists:**
- ✅ WhatsApp/Baileys integration (production-ready)
- ✅ 36 channel plugins (Telegram, Slack, Discord, etc.)
- ✅ Gateway architecture + 20+ agent tools
- ✅ Docker setup + testing infrastructure

---

## Documentation

📚 **ALWAYS LOAD FIRST:** [DEVELOPER_QUICK_REFERENCE.md](DEVELOPER_QUICK_REFERENCE.md) ⭐
  *Ultra-compact reference with all critical links - keep in context during development*

**Our Planning Docs:**
- [docs-secretary/INDEX.md](docs-secretary/INDEX.md) - What we're building/changing
- [docs-secretary/sprints/SPRINT_01.md](docs-secretary/sprints/SPRINT_01.md) - Current Sprint
- [docs-secretary/planning/IMPLEMENTATION_ROADMAP_V2.md](docs-secretary/planning/IMPLEMENTATION_ROADMAP_V2.md) - 8-10 week roadmap

**Original Secretary Docs:**
- [docs/index.md](docs/index.md) - How the existing system works
- [docs/concepts/](docs/concepts/) - Technical concepts (architecture, models, sessions, etc.)
- [docs/channels/](docs/channels/) - All 36 channel plugins
- [docs/tools/](docs/tools/) - Built-in tools documentation

---

## Testing Strategy

- **Unit Tests:** 80% (Jest)
- **Integration Tests:** 15%
- **E2E Tests:** 5% (Playwright)
- **Minimum Coverage:** 80%

---

## Workflow

**Automated:**
- Sprint start: CI analysis, file creation, debt review
- Sprint end: Tests, persona reviews, auto-fix, changelog, git tag
- Persona reviews: 4 senior roles (Architect, Tester, Developer, Security)
- Critical/Important issues: Auto-fixed
- Nice-to-Have issues: Interactive decision (fix or tech debt)

**Manual:**
- Feature implementation
- Test writing
- Retrospectives
- Use case documentation

---

## Key Commands

```bash
# Testing
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests
npm run test:e2e           # E2E tests (Playwright)
npm run coverage           # Coverage report

# Sprint Management
./.hooks/sprint-start.sh <num> "<name>"
./.hooks/sprint-end.sh <num>

# CI/CD
git push                   # Triggers minimal CI (lint, type-check, unit tests)
```

---

## Emergency Procedures

**Kill Switch:** Multi-trigger emergency shutdown
- API: `POST /api/kill-switch`
- CLI: `npm run kill-switch`
- Hardware: GPIO button (optional)

---

**For complete documentation, see [docs/INDEX.md](docs/INDEX.md)**
