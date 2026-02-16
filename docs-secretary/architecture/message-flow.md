# Message Flow Architecture

**Last Updated:** 2026-02-16
**Status:** Current (OpenClaw Fork)

## Overview

This document illustrates how messages flow through the OpenClaw Gateway system, from inbound channel messages through agent processing to outbound delivery.

## Inbound Message Flow (Channel → Agent)

```mermaid
sequenceDiagram
    participant Channel as Channel Plugin<br/>(WhatsApp/Telegram/etc)
    participant Dispatcher as Reply Dispatcher
    participant Queue as Message Queue<br/>(Race Condition Fix)
    participant AutoReply as Auto-Reply Logic
    participant Session as Session Manager
    participant Agent as Agent Runtime<br/>(Pi SDK)
    participant LLM as LLM Provider<br/>(Anthropic/etc)
    participant Storage as Transcript Storage

    Channel->>Dispatcher: Inbound message<br/>{from, body, channel}

    Note over Dispatcher: Extract metadata<br/>sender, chat type, etc.

    Dispatcher->>Queue: Enqueue message
    Note over Queue: Prevents concurrent<br/>processing per session

    Queue->>AutoReply: Process next in queue

    AutoReply->>AutoReply: Parse commands<br/>(/, /think, etc)

    AutoReply->>Session: Resolve session key<br/>(sender + agent scope)
    Session-->>AutoReply: Session entry

    AutoReply->>Session: Load session config<br/>(model, thinking level, etc)
    Session-->>AutoReply: Config + transcript path

    AutoReply->>Storage: Append user message<br/>to transcript (JSONL)

    AutoReply->>Agent: Send message<br/>{text, images, context}

    Note over Agent: Assemble context:<br/>- MEMORY.md<br/>- SOUL.md<br/>- Transcript history<br/>- Tool definitions

    Agent->>LLM: Request<br/>{messages, tools, model}

    Note over LLM: Process with<br/>extended thinking<br/>if enabled

    LLM-->>Agent: Stream response<br/>(text + tool calls)

    loop Tool execution
        Agent->>Agent: Execute tool<br/>(or request approval)
        Agent->>LLM: Continue with tool results
        LLM-->>Agent: Stream next response
    end

    Agent-->>AutoReply: Final response<br/>{text, stopReason, usage}

    AutoReply->>Storage: Append assistant message<br/>to transcript

    AutoReply->>Dispatcher: Deliver response

    Dispatcher->>Channel: Send message<br/>(with formatting)

    Channel->>Channel: Confirm delivery
    Channel-->>Dispatcher: Delivery ack

    Dispatcher->>Queue: Mark message complete
    Queue->>Queue: Process next queued<br/>message (if any)
```

## WebSocket Chat Flow (WebChat → Agent)

```mermaid
sequenceDiagram
    participant Client as WebChat Client
    participant WS as WebSocket Gateway
    participant Auth as Auth & Rate Limit
    participant Handler as Chat Handler
    participant Session as Session Manager
    participant Agent as Agent Runtime
    participant Broadcast as Event Broadcast
    participant Storage as Transcript Storage

    Client->>WS: connect frame<br/>{role: operator, scopes}
    WS->>Auth: Validate device token
    Auth-->>WS: Auth success
    WS-->>Client: hello-ok + snapshot

    Client->>WS: req:chat.send<br/>{sessionKey, message, idempotencyKey}

    WS->>Auth: Check scopes<br/>(operator.write required)
    Auth-->>WS: Authorized

    WS->>Handler: Route to chat.send handler

    Handler->>Handler: Check idempotency cache

    alt Already processed
        Handler-->>WS: Cached response
        WS-->>Client: res:chat.send (cached)
    else New request
        Handler->>Session: Resolve session
        Session-->>Handler: Session entry

        Handler->>Handler: Create abort controller<br/>{runId, sessionKey}

        Handler-->>WS: Immediate ack
        WS-->>Client: res:chat.send<br/>{runId, status: started}

        Handler->>Storage: Append user message

        Handler->>Agent: Dispatch message<br/>{runId, abortSignal}

        par Streaming response
            Agent->>Broadcast: Delta event
            Broadcast-->>Client: event:chat<br/>{runId, state: delta, seq: 1}

            Agent->>Broadcast: Delta event
            Broadcast-->>Client: event:chat<br/>{runId, state: delta, seq: 2}

            Agent->>Broadcast: Delta event (N times)
            Broadcast-->>Client: event:chat<br/>{runId, state: delta, seq: N}
        end

        Agent-->>Handler: Completion<br/>{message, usage, stopReason}

        Handler->>Storage: Append assistant message

        Handler->>Broadcast: Final event
        Broadcast-->>Client: event:chat<br/>{runId, state: final, message}

        Handler->>Handler: Cache response
        Handler->>Handler: Cleanup abort controller
    end
```

## Chat Abort Flow

```mermaid
sequenceDiagram
    participant Client as WebChat/CLI
    participant WS as WebSocket Gateway
    participant Handler as Chat Abort Handler
    participant AbortMgr as Abort Manager
    participant Agent as Active Agent Run
    participant Storage as Transcript Storage
    participant Broadcast as Event Broadcast

    Client->>WS: req:chat.abort<br/>{sessionKey, runId?}

    WS->>Handler: Route to chat.abort

    alt Abort specific run
        Handler->>AbortMgr: Find controller<br/>by runId
        AbortMgr-->>Handler: AbortController

        Handler->>Handler: Validate sessionKey match

        Handler->>AbortMgr: Get partial buffer<br/>(streamed text so far)
        AbortMgr-->>Handler: Partial text

        Handler->>Agent: Signal abort<br/>(via AbortController)
        Agent-->>Handler: Abort acknowledged

        opt Partial text exists
            Handler->>Storage: Save partial response<br/>(marked as aborted)
        end

        Handler->>Broadcast: Abort event
        Broadcast-->>Client: event:chat<br/>{runId, state: aborted}

        Handler-->>WS: Success
        WS-->>Client: res:chat.abort<br/>{ok: true, runIds: [runId]}
    else Abort all runs for session
        Handler->>AbortMgr: Find all active runs<br/>for sessionKey
        AbortMgr-->>Handler: List of controllers

        loop Each active run
            Handler->>AbortMgr: Get partial buffer
            Handler->>Agent: Signal abort
            Handler->>Storage: Save partial (if exists)
            Handler->>Broadcast: Abort event
        end

        Handler-->>WS: Success
        WS-->>Client: res:chat.abort<br/>{ok: true, runIds: [id1, id2]}
    end
```

## Channel Reply Flow (Agent → Channel)

```mermaid
graph TB
    subgraph "Agent Completion"
        AgentDone[Agent completes response]
        ReplyCtx[Build reply context]
    end

    subgraph "Reply Dispatcher"
        Prefix[Apply prefix logic<br/>model indicator, emoji]
        Format[Format for channel<br/>markdown/HTML/plain]
        Split[Split long messages<br/>channel limits]
    end

    subgraph "Delivery Logic"
        Policy{Send Policy?}
        Queue[Enqueue for delivery]
        Retry[Retry logic<br/>exponential backoff]
    end

    subgraph "Channel Plugin"
        Send[Send via channel API]
        Confirm[Wait for confirmation]
        Error[Handle delivery error]
    end

    subgraph "Error Handling"
        Log[Log error]
        Notify[Notify user<br/>(if possible)]
        Fallback{Fallback channel?}
    end

    AgentDone --> ReplyCtx
    ReplyCtx --> Prefix
    Prefix --> Format
    Format --> Split
    Split --> Policy

    Policy -->|allow| Queue
    Policy -->|deny| Log

    Queue --> Send
    Send --> Confirm
    Send --> Error

    Confirm --> Done[✓ Delivered]

    Error --> Log
    Log --> Retry
    Retry -->|attempts left| Queue
    Retry -->|max attempts| Fallback

    Fallback -->|yes| AltChannel[Try alternate channel]
    Fallback -->|no| Notify

    AltChannel --> Send

    %% Styling
    classDef agent fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef dispatcher fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef delivery fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef channel fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef error fill:#ffebee,stroke:#c62828,stroke-width:2px

    class AgentDone,ReplyCtx agent
    class Prefix,Format,Split dispatcher
    class Policy,Queue,Retry delivery
    class Send,Confirm channel
    class Error,Log,Notify,Fallback error
```

## Message Queue (Race Condition Prevention)

The message queue prevents concurrent processing of messages for the same session, which was causing WhatsApp race conditions in the original OpenClaw.

```mermaid
stateDiagram-v2
    [*] --> Idle: Queue empty

    Idle --> Processing: New message arrives
    Processing --> Idle: Processing complete
    Processing --> Queued: Another message<br/>for same session

    Queued --> Processing: Current message<br/>completes
    Queued --> Queued: More messages<br/>arrive

    state Processing {
        [*] --> ValidateSession
        ValidateSession --> LoadContext
        LoadContext --> InvokeAgent
        InvokeAgent --> SaveResponse
        SaveResponse --> DeliverReply
        DeliverReply --> [*]
    }

    note right of Processing
        Only ONE message per session
        can be in this state at a time
    end note

    note right of Queued
        FIFO queue per session key
        prevents race conditions
    end note
```

## Key Patterns

### 1. Idempotency

- All side-effecting operations require idempotency keys
- Gateway maintains short-lived cache (dedupe map)
- Prevents duplicate agent invocations on retry

### 2. Streaming

- WebSocket clients receive real-time deltas
- Channel plugins receive final message only
- Sequence numbers ensure correct ordering

### 3. Race Condition Prevention

- One message per session processed at a time
- Queue-based serialization
- Prevents conflicting transcript writes

### 4. Graceful Degradation

- Channel failures don't crash gateway
- Partial responses saved on abort
- Fallback delivery mechanisms

### 5. Multi-Channel Routing

- Single session can route to multiple channels
- Channel-specific formatting applied
- Delivery confirmation tracking

## Performance Considerations

### Latency Sources

1. **Channel → Queue**: < 10ms (in-memory)
2. **Queue → Agent**: < 50ms (context assembly)
3. **Agent → LLM**: 500-5000ms (network + inference)
4. **LLM streaming**: 50-200ms per token
5. **Reply → Channel**: 100-500ms (API latency)

### Optimizations

- **Token caching**: Reduces LLM API costs
- **Transcript compaction**: Limits context size
- **Parallel tool execution**: Multiple tools at once
- **Connection pooling**: Reuse HTTP connections

## Related Documents

- [System Architecture](system-architecture.md)
- [Security Architecture](security-architecture.md)
- [WhatsApp Race Condition Fix (ADR-02)](ARCHITECTURE_DECISIONS.md#adr-02)
