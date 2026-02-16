# System Architecture

**Last Updated:** 2026-02-16
**Status:** Current (OpenClaw Fork)

## Overview

This document describes the overall system architecture of the OpenClaw Gateway, illustrating the major components and their interactions.

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WebUI[Web Control UI]
        CLI[CLI Client]
        MacApp[macOS App]
        MobileNode[Mobile Nodes<br/>iOS/Android]
    end

    subgraph "Gateway Core (Port 18789)"
        WS[WebSocket Server]
        HTTP[HTTP Server]
        Auth[Authentication<br/>& Device Pairing]
        RateLimit[Rate Limiter]

        subgraph "Gateway Services"
            ChannelMgr[Channel Manager]
            SessionMgr[Session Manager]
            AgentOrch[Agent Orchestrator]
            ExecMgr[Execution Manager]
            CronSvc[Cron Service]
        end
    end

    subgraph "Channel Plugins (36 Channels)"
        WhatsApp[WhatsApp<br/>Baileys]
        Telegram[Telegram<br/>grammY]
        Slack[Slack Plugin]
        Discord[Discord Plugin]
        Signal[Signal Plugin]
        OtherChannels[... 31 more]
    end

    subgraph "Agent Runtime"
        Pi[Pi Agent SDK<br/>@mariozechner]
        Tools[Tool Registry<br/>52+ Skills]
        Memory[Memory System<br/>MEMORY.md]
        Context[Context Manager<br/>Session Transcripts]
    end

    subgraph "Storage Layer"
        Sessions[Session Store<br/>JSON Files]
        Transcripts[Transcript Files<br/>JSONL]
        Config[Config Store<br/>config.yaml]
        SkillBins[Skill Binaries]
    end

    subgraph "External Services"
        LLM[LLM Providers<br/>Anthropic/OpenAI/etc]
        TTS[TTS Providers<br/>ElevenLabs/Azure]
        Avatar[Avatar System<br/>LivePortrait+XTTS]
    end

    subgraph "Node Execution Layer"
        Canvas[Canvas Host<br/>HTML/CSS/JS]
        Browser[Browser Control<br/>Playwright]
        LocalExec[Local Execution<br/>Sandboxed]
    end

    %% Client connections
    WebUI -->|WSS/HTTPS| WS
    CLI -->|WS| WS
    MacApp -->|WS| WS
    MobileNode -->|WS w/ role:node| WS

    %% Gateway internal flow
    WS --> Auth
    HTTP --> Auth
    Auth --> RateLimit
    RateLimit --> ChannelMgr
    RateLimit --> SessionMgr
    RateLimit --> AgentOrch
    RateLimit --> ExecMgr
    RateLimit --> CronSvc

    %% Channel connections
    ChannelMgr <--> WhatsApp
    ChannelMgr <--> Telegram
    ChannelMgr <--> Slack
    ChannelMgr <--> Discord
    ChannelMgr <--> Signal
    ChannelMgr <--> OtherChannels

    %% Agent orchestration
    AgentOrch --> Pi
    Pi --> Tools
    Pi --> Memory
    Pi --> Context

    %% Storage connections
    SessionMgr --> Sessions
    Context --> Transcripts
    AgentOrch --> Config
    Tools --> SkillBins

    %% External service connections
    Pi --> LLM
    ChannelMgr --> TTS
    ChannelMgr --> Avatar

    %% Execution layer
    ExecMgr --> Canvas
    ExecMgr --> Browser
    ExecMgr --> LocalExec
    MobileNode --> Canvas
    MobileNode --> Browser

    %% Styling
    classDef client fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef gateway fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef channel fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef agent fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef storage fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef external fill:#e0f2f1,stroke:#00796b,stroke-width:2px
    classDef execution fill:#fff9c4,stroke:#f9a825,stroke-width:2px

    class WebUI,CLI,MacApp,MobileNode client
    class WS,HTTP,Auth,RateLimit,ChannelMgr,SessionMgr,AgentOrch,ExecMgr,CronSvc gateway
    class WhatsApp,Telegram,Slack,Discord,Signal,OtherChannels channel
    class Pi,Tools,Memory,Context agent
    class Sessions,Transcripts,Config,SkillBins storage
    class LLM,TTS,Avatar external
    class Canvas,Browser,LocalExec execution
```

## Component Descriptions

### Client Layer

- **Web Control UI**: Browser-based interface for system management and chat
- **CLI Client**: Command-line interface for operations and automation
- **macOS App**: Native desktop application
- **Mobile Nodes**: iOS/Android devices with execution capabilities

### Gateway Core

#### WebSocket Server

- Handles persistent connections from clients and nodes
- Protocol version 3
- Bidirectional RPC with request/response/event frames
- Supports multiple concurrent connections

#### HTTP Server

- Serves Control UI assets
- Canvas Host endpoints (`/__openclaw__/canvas/`, `/__openclaw__/a2ui/`)
- Optional OpenAI Chat Completions endpoint (`/v1/chat/completions`)
- Optional OpenResponses API endpoint (`/v1/responses`)

#### Authentication & Device Pairing

- Device-based authentication with token rotation
- Tailscale network identity support
- Role-based access control (operator vs node)
- Scope-based permissions (admin, read, write, approvals, pairing)

#### Rate Limiter

- Prevents authentication abuse
- Configurable limits per client/device

### Gateway Services

#### Channel Manager

- Manages 36+ channel plugin connections
- Routes messages between channels and agents
- Handles delivery confirmations and errors
- Reply dispatcher with queue-based race condition prevention

#### Session Manager

- Maintains session lifecycle (create, update, reset, delete)
- Session store persistence (JSON files)
- Session key resolution and routing
- Label and metadata management

#### Agent Orchestrator

- Coordinates agent execution via Pi SDK
- Model selection and provider routing
- Context assembly from transcripts and memory
- Subagent spawning and management

#### Execution Manager

- Tool execution approval workflows
- Sandbox security enforcement
- Remote execution on paired nodes
- Timeout and resource limits

#### Cron Service

- Scheduled task management
- Recurring message/command execution
- Run history tracking

### Channel Plugins

36 integrated channels including:

- **WhatsApp** (Baileys library)
- **Telegram** (grammY framework)
- **Slack, Discord, Signal**
- 31 additional channels

### Agent Runtime

#### Pi Agent SDK

- Core agent framework by @mariozechner
- Tool execution interface
- Stream handling for incremental responses
- Session management

#### Tool Registry

- 52+ built-in skills/tools
- Dynamic skill loading
- Remote skill execution on nodes
- Binary caching

#### Memory System

- Persistent memory in `MEMORY.md`
- Agent identity and personality
- Bootstrap files (SOUL.md, IDENTITY.md, TOOLS.md)

#### Context Manager

- Transcript assembly (JSONL format)
- Message history with parent chains
- Token counting and compaction
- Cache management

### Storage Layer

- **Session Store**: JSON-based session metadata
- **Transcripts**: JSONL files per session
- **Config Store**: YAML configuration
- **Skill Binaries**: Cached executables

### External Services

- **LLM Providers**: Anthropic, OpenAI, Google, etc.
- **TTS Providers**: ElevenLabs, Azure Cognitive Services
- **Avatar System**: LivePortrait + XTTS for realistic avatars

### Node Execution Layer

- **Canvas Host**: Agent-editable HTML/CSS/JS pages
- **Browser Control**: Playwright-based automation
- **Local Execution**: Sandboxed command execution

## Key Characteristics

### Scalability

- Currently: **Modular Monolith** (single process)
- Future: Migration path to microservices via Event Bus decoupling

### Security

- Multi-layer sandbox for tool execution
- Credential redaction in logs and storage
- Device pairing with approval workflows
- Rate limiting on authentication

### Reliability

- Message queue prevents WhatsApp race conditions
- Idempotent request handling
- Graceful degradation on channel failures
- Kill switch for emergency shutdown

### Performance

- WebSocket for low-latency bidirectional communication
- Streaming responses for real-time feedback
- Token caching for reduced API costs
- Efficient JSONL-based transcript storage

## Protocol Version

**Current Version**: 3

See [Gateway Protocol Documentation](/docs/concepts/architecture.md) for wire protocol details.

## Related Documents

- [Message Flow Architecture](message-flow.md)
- [Security Architecture](security-architecture.md)
- [Gateway Architecture](/docs/concepts/architecture.md)
- [Architecture Decision Records](ARCHITECTURE_DECISIONS.md)
