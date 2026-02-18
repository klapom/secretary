# Implementation Roadmap V2 - Secretary (Hybrid Approach)

**Project:** Secretary - Personal AI Assistant
**Approach:** Hybrid (Refactor existing OpenClaw codebase)
**Team:** Claude Code + Agent Teams
**Timeline:** 8-10 Wochen (revised from 12 weeks)
**Start:** Sprint 01

---

## 🎯 Project Overview

### Goals

1. ✅ Personal AI Assistant with Multi-Channel Support **[ALREADY EXISTS]**
2. 🔧 Fix Critical Issues (Race Condition, Security) **[REFACTOR]**
3. ➕ Add Avatar Interface with Character Customization **[NEW]**
4. ➕ Add Kill Switch for Emergency Shutdown **[NEW]**
5. ➕ Add MCP Integration **[NEW]**
6. ✅ Cloud Migration Path **[ALREADY DESIGNED]**

### Deployment Target

- **Phase 1:** DGX Spark (local) - Use existing code
- **Phase 2:** Cloud (optional, later) - Already supports Docker

---

## 📊 What We Already Have (OpenClaw/Secretary Codebase)

### ✅ Existing & Production-Ready

**Infrastructure:**

- ✅ **Multi-Channel Gateway** - Production-ready HTTP/WebSocket server
- ✅ **36 Channel Plugins** - WhatsApp, Telegram, Slack, Discord, Signal, iMessage, etc.
- ✅ **WhatsApp/Baileys Integration** - Robust, handles disconnects, media, groups
- ✅ **Session Management** - Persistent sessions with conversation history
- ✅ **Tool Execution System** - 20+ built-in tools (browser, memory, canvas, web search)
- ✅ **Plugin SDK** - Extensible plugin architecture
- ✅ **Docker Setup** - Docker Compose ready
- ✅ **Testing Infrastructure** - Vitest (unit, integration, e2e configs)

**Codebase Stats:**

- 3,009 TypeScript source files
- 36 channel extensions
- 52 pre-built skills
- Well-architected plugin system

### 🔧 Needs Refactoring (Critical Issues)

From our ADR analysis and codebase exploration:

1. **🔴 WhatsApp Race Condition** (#16918)
   - Current: "Message debouncing" exists but not robust
   - Fix: Persistent message queue with retry logic (ADR-02)

2. **🔴 Security Hardening**
   - Current: Basic tool policy, sandbox exists
   - Improve: Multi-layer security (credential redaction + encryption, path blocking)

3. **🟡 Event Bus for Decoupling**
   - Current: Gateway couples everything directly
   - Add: Event Bus for better modularity (ADR-05)

4. **🟡 Code Simplification**
   - Current: 3,009 files, Gateway has 180+ files in single directory
   - Improve: Reorganize into subdirectories

### ➕ New Features to Add

1. **Avatar System** - LivePortrait + XTTS (Stylized → Hyperrealistic)
2. **Kill Switch** - Multi-trigger emergency shutdown
3. **MCP Integration** - Anthropic Model Context Protocol support

---

## 📅 Revised 8-10 Week Roadmap

```
Sprint 01-02  │ Critical Fixes (4 weeks)
Sprint 03-04  │ Avatar System (4 weeks)
Sprint 05     │ MCP Integration (2 weeks)
Sprint 06     │ Polish & Testing (2 weeks - optional)
```

**Timeline Reduction Rationale:**

- ✅ **Skip 4 weeks:** WhatsApp, Gateway, Tools already exist
- ✅ **Skip 2 weeks:** Session management, Docker setup done
- 🔧 **Focus instead:** Refactoring critical issues + new features

---

## 🗓️ Detailed Sprint Plan

### **Sprint 01: Critical Fixes Part 1** (Week 1-2)

**Focus:** Fix race condition + initial security hardening

#### Goals

1. 🔴 **Message Queue Implementation**
   - Fix WhatsApp race condition (#16918)
   - Persistent queue with retry logic
   - Integration with existing Baileys code

2. 🔴 **Security Layer - Phase 1**
   - Credential redaction in logs
   - AES-256-GCM encryption for sensitive data
   - Update existing sandbox configuration

3. 🟡 **Event Bus Foundation**
   - In-process EventEmitter
   - Decouple Gateway → Agent communication
   - Migration path to NATS documented

#### Existing Code to Leverage

```
/src/web/inbound/monitor.ts      # WhatsApp message monitoring
/src/auto-reply/                  # Message handling (needs queue)
/src/agents/sandbox/              # Existing sandbox setup
/src/agents/tool-policy.ts        # Tool policy enforcement
/src/gateway/                     # Gateway server
```

#### Tasks

- [ ] Analyze existing auto-reply message flow
- [ ] Implement persistent message queue (SQLite-backed)
- [ ] Add retry logic with exponential backoff
- [ ] Integrate queue with Baileys inbound monitoring
- [ ] Add credential redaction to logging system
- [ ] Enhance sandbox with stricter capabilities
- [ ] Create EventEmitter-based event bus
- [ ] Refactor Gateway to use event bus for agent communication
- [ ] Write integration tests for queue
- [ ] Write security tests for credential redaction

#### Success Criteria

- ✅ No message loss under rapid message scenarios
- ✅ Race condition #16918 resolved
- ✅ Credentials never appear in logs
- ✅ Event bus decouples 3+ modules
- ✅ 80%+ test coverage for new code

**Effort:** ~60 hours (2 weeks)

---

### **Sprint 02: Critical Fixes Part 2** (Week 3-4)

**Focus:** Security hardening completion + code simplification

#### Goals

1. 🔴 **Security Layer - Phase 2**
   - Path-based access control
   - Command obfuscation detection
   - Encrypted message storage
   - Security audit of tool system

2. 🟡 **Code Reorganization**
   - Split Gateway directory (180+ files → subdirectories)
   - Flatten auto-reply structure (reduce nesting)
   - Improve module boundaries

3. 📚 **Documentation**
   - API documentation (OpenAPI spec)
   - Architecture diagrams
   - Security best practices guide

#### Existing Code to Refactor

```
/src/gateway/                     # 180+ files in single dir
/src/auto-reply/reply/queue/      # 3 levels deep nesting
/src/agents/tools/                # Tool security review
```

#### Tasks

- [ ] Implement path traversal prevention
- [ ] Add command obfuscation detection
- [ ] Encrypt message storage (AES-256-GCM)
- [ ] Security audit of all 20+ built-in tools
- [ ] Split /src/gateway/ into subdirectories (server/, api/, sessions/, hooks/)
- [ ] Flatten /src/auto-reply/ structure
- [ ] Extract common patterns from modules
- [ ] Generate OpenAPI spec for Gateway HTTP API
- [ ] Create architecture diagrams (Mermaid)
- [ ] Write security documentation
- [ ] Integration tests for security features
- [ ] E2E tests for critical flows

#### Success Criteria

- ✅ Path traversal attacks blocked
- ✅ Malicious commands detected
- ✅ All messages encrypted at rest
- ✅ Gateway code organized (max 30 files per dir)
- ✅ OpenAPI spec generated
- ✅ 80%+ test coverage maintained

**Effort:** ~60 hours (2 weeks)

---

### **Sprint 03: Avatar System - Foundation** (Week 5-6)

**Focus:** Avatar rendering infrastructure

#### Goals

1. ➕ **LivePortrait Integration**
   - Image-driven avatar (stylized approach - ADR-11 Alternative B)
   - XTTS voice synthesis
   - Whisper STT

2. ➕ **Character Manager**
   - Character configuration system
   - Avatar asset storage (local → cloud path)
   - Character switching API

3. ➕ **WebRTC Streaming**
   - Real-time avatar video stream
   - Audio bidirectional streaming
   - Low-latency optimization

#### New Code

```
/src/avatar/
  ├── renderer/
  │   ├── liveportrait.ts      # LivePortrait integration
  │   └── renderer-interface.ts # Abstract renderer (swap later)
  ├── tts/
  │   └── xtts.ts               # XTTS synthesis
  ├── stt/
  │   └── whisper.ts            # Whisper STT
  ├── character-manager.ts      # Character config
  └── streaming/
      └── webrtc.ts             # WebRTC server
```

#### Tasks

- [ ] Research LivePortrait Python API
- [ ] Create Python microservice for LivePortrait
- [ ] Integrate XTTS for voice synthesis
- [ ] Integrate Whisper for STT
- [ ] Build Character Manager (config, storage, switching)
- [ ] Implement WebRTC streaming server
- [ ] Create avatar renderer interface (allow future swap to hyperrealistic)
- [ ] Add avatar channel to Gateway
- [ ] Build simple test UI for avatar
- [ ] Performance optimization (target: <200ms latency)
- [ ] Unit tests for character manager
- [ ] Integration tests for avatar pipeline

#### Success Criteria

- ✅ Avatar renders from static image
- ✅ Voice synthesis working (XTTS)
- ✅ STT working (Whisper)
- ✅ WebRTC streaming <200ms latency
- ✅ Character switching works
- ✅ 80%+ test coverage

**Effort:** ~70 hours (2 weeks)

---

### **Sprint 04: Avatar System - Integration** (Week 7-8)

**Focus:** Avatar UI + channel integration

#### Goals

1. ➕ **Avatar Chat UI**
   - React 18 frontend
   - WebRTC client
   - Voice interaction controls
   - Character selection

2. ➕ **Multi-Channel Avatar Support**
   - Voice messages to WhatsApp/Telegram
   - Avatar responses via web UI
   - Conversation sync across channels

3. 🔧 **Character Studio (Optional)**
   - Upload custom character images
   - Configure voice settings
   - Preview avatar

#### New Code

```
/ui/avatar-chat/
  ├── components/
  │   ├── AvatarVideo.tsx       # Avatar display
  │   ├── VoiceControls.tsx     # Mic/speaker controls
  │   └── CharacterSelector.tsx # Character picker
  ├── hooks/
  │   └── useWebRTC.ts          # WebRTC client hook
  └── App.tsx
```

#### Tasks

- [ ] Build Avatar Chat UI (React + TypeScript + TailwindCSS)
- [ ] Implement WebRTC client
- [ ] Add voice controls (mute, volume, push-to-talk)
- [ ] Character selection UI
- [ ] Integrate with Gateway API
- [ ] Add voice message support to WhatsApp/Telegram channels
- [ ] Sync conversations (avatar web ↔ messaging channels)
- [ ] (Optional) Build Character Studio UI
- [ ] E2E tests with Playwright
- [ ] Performance testing (WebRTC)

#### Success Criteria

- ✅ Avatar Chat UI functional
- ✅ Voice interaction works end-to-end
- ✅ Character switching in UI
- ✅ Voice messages work in WhatsApp/Telegram
- ✅ E2E tests pass

**Effort:** ~70 hours (2 weeks)

---

### **Sprint 05: MCP Integration** (Week 9-10)

**Focus:** Model Context Protocol support

#### Goals

1. ➕ **MCP Client**
   - Connect to standard MCP servers
   - Filesystem, Git, GitHub servers
   - Tool discovery

2. ➕ **Custom MCP Servers**
   - Docker executor MCP server
   - Browser MCP server
   - Avatar MCP server

3. 🔧 **Tool System Integration**
   - Map MCP tools → Secretary tools
   - Unified tool execution
   - MCP tool policies

#### New Code

```
/src/mcp/
  ├── client.ts                 # MCP client
  ├── servers/
  │   ├── docker-executor.ts    # Docker MCP server
  │   ├── browser.ts            # Browser MCP server
  │   └── avatar.ts             # Avatar MCP server
  └── tool-adapter.ts           # MCP → Secretary tool adapter
```

#### Tasks

- [ ] Implement MCP client (connect to stdio/SSE servers)
- [ ] Integrate standard MCP servers (filesystem, git, github)
- [ ] Build custom Docker executor MCP server
- [ ] Build custom Browser MCP server
- [ ] Build custom Avatar MCP server
- [ ] Create MCP → Secretary tool adapter
- [ ] Add MCP tool policies
- [ ] Configuration for MCP servers
- [ ] Unit tests for MCP client
- [ ] Integration tests with real MCP servers

#### Success Criteria

- ✅ MCP client connects to standard servers
- ✅ 3 custom MCP servers working
- ✅ Tools from MCP servers usable by agent
- ✅ Tool policies apply to MCP tools
- ✅ 80%+ test coverage

**Effort:** ~40 hours (2 weeks, can finish early)

---

### **Sprint 06 (Optional): Polish & Testing** (Week 11-12)

**Focus:** Production readiness

#### Goals

1. 📚 **Documentation**
   - User guides for all features
   - API documentation complete
   - Deployment guides

2. 🧪 **Comprehensive Testing**
   - 85%+ total coverage
   - Load testing
   - Security penetration testing

3. 🎨 **UX Improvements**
   - Error messages
   - Loading states
   - Edge case handling

#### Tasks

- [ ] Write user guides
- [ ] Complete API docs
- [ ] Deployment guides (Docker, K8s)
- [ ] Increase test coverage to 85%+
- [ ] Load testing (simulate 100 concurrent users)
- [ ] Security audit
- [ ] UX polish (error messages, loading states)
- [ ] Performance optimization
- [ ] Bug fixes from testing

#### Success Criteria

- ✅ 85%+ test coverage
- ✅ Documentation complete
- ✅ Load tests pass (100 concurrent users)
- ✅ Security audit findings addressed
- ✅ Production-ready

**Effort:** ~40 hours (2 weeks, optional)

---

## 📊 Effort Summary

| Sprint    | Focus                 | Effort   | Cumulative |
| --------- | --------------------- | -------- | ---------- |
| Sprint 01 | Critical Fixes Part 1 | 60h (2w) | 60h        |
| Sprint 02 | Critical Fixes Part 2 | 60h (2w) | 120h       |
| Sprint 03 | Avatar Foundation     | 70h (2w) | 190h       |
| Sprint 04 | Avatar Integration    | 70h (2w) | 260h       |
| Sprint 05 | MCP Integration       | 40h (2w) | 300h       |
| Sprint 06 | Polish (Optional)     | 40h (2w) | 340h       |

**Total:** 300-340 hours (10-12 weeks if solo, ~8 weeks with agent teams)

**Saved from original 12-week plan:** ~6 weeks (WhatsApp, Gateway, Tools, Docker)

---

## 🎯 Success Metrics

### Sprint 01-02 (Critical Fixes)

- ✅ WhatsApp race condition resolved
- ✅ 0 credentials in logs
- ✅ Messages encrypted at rest
- ✅ 80%+ test coverage
- ✅ Event bus decouples ≥3 modules

### Sprint 03-04 (Avatar System)

- ✅ Avatar renders and speaks
- ✅ <200ms WebRTC latency
- ✅ Voice interaction works end-to-end
- ✅ Character switching functional

### Sprint 05 (MCP Integration)

- ✅ MCP client works with 3+ servers
- ✅ Custom MCP servers functional
- ✅ MCP tools accessible to agent

### Sprint 06 (Polish)

- ✅ 85%+ test coverage
- ✅ Documentation complete
- ✅ Production-ready

---

## 🔄 Migration Paths (Future)

### Database: SQLite → PostgreSQL

- Current: SQLite with WAL mode
- Trigger: >10k active users
- Effort: ~1 week (interface already designed)

### Event Bus: In-Process → NATS

- Current: In-process EventEmitter
- Trigger: Microservices split
- Effort: ~1 week (interface already designed)

### Sandbox: Docker → gVisor

- Current: Hardened Docker
- Trigger: Maximum security requirement
- Effort: ~1 week (optional)

### Avatar: Stylized → Hyperrealistic

- Current: LivePortrait (stylized)
- Trigger: User preference
- Effort: ~2 weeks (interface allows easy swap)

### Deployment: DGX Spark → Cloud (K8s)

- Current: Docker Compose
- Trigger: Scaling needs
- Effort: ~2 weeks (Docker already set up)

---

## 🚀 Getting Started (Sprint 01)

### Prerequisites

- ✅ Secretary codebase (renamed from OpenClaw)
- ✅ Node.js 22+
- ✅ pnpm
- ✅ Docker
- ✅ DGX Spark access

### Setup

```bash
cd /home/admin/projects/secretary/openclaw-source

# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Start gateway (development)
pnpm dev

# Start gateway (production)
secretary gateway --port 18789
```

### First Sprint Tasks

1. Read Sprint 01 plan (`docs-secretary/sprints/SPRINT_01.md`)
2. Run `.hooks/sprint-start.sh 01 "Critical Fixes Part 1"`
3. Start implementation
4. At end: Run `.hooks/sprint-end.sh 01`

---

## 📝 Notes

**Why Hybrid Approach?**

- ✅ Functional WhatsApp bot from Day 1
- ✅ Production-ready codebase
- ✅ 36 channel plugins already exist
- ✅ Saves ~6 weeks of development time
- 🔧 Focus on critical issues + new features

**Risks:**

- ⚠️ Large codebase (3,009 files) - need time to understand
- ⚠️ Legacy code quality varies - some refactoring needed
- ⚠️ Tight Baileys coupling - addressed in security sprint

**Mitigations:**

- ✅ Comprehensive codebase analysis completed
- ✅ Prioritized refactoring (critical issues first)
- ✅ Interface-based design for future flexibility
- ✅ Agent teams for parallel work

---

**Status:** ✅ Ready for Sprint 01
**Last Updated:** 2026-02-16
**Version:** 2.0 (Hybrid Approach)
