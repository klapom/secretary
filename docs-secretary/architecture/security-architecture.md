# Security Architecture

**Last Updated:** 2026-02-16
**Status:** Current (OpenClaw Fork - Sprint 01 Enhancements)

## Overview

This document describes the multi-layer security architecture of OpenClaw Gateway, including authentication, authorization, sandbox execution, credential protection, and threat mitigation.

## Security Layers

```mermaid
graph TB
    subgraph "Layer 1: Network & Transport"
        TLS[TLS 1.3<br/>Certificate Pinning]
        Tailscale[Tailscale Network<br/>Zero Trust]
        Firewall[Bind Policy<br/>loopback/lan/tailnet]
        RateLimit[Rate Limiting<br/>Auth Attempts]
    end

    subgraph "Layer 2: Authentication & Authorization"
        DevicePair[Device Pairing<br/>Token-Based Auth]
        Scopes[Scope-Based Access<br/>RBAC]
        Challenge[Challenge-Response<br/>Non-Local Connects]
        TokenRotate[Token Rotation<br/>30-Day Expiry]
    end

    subgraph "Layer 3: Input Validation & Sanitization"
        Schema[JSON Schema<br/>Validation]
        Sanitize[Input Sanitization<br/>XSS/Injection Prevention]
        CredRedact[Credential Redaction<br/>Logs & Storage]
        CommandObf[Command Obfuscation<br/>Detection]
    end

    subgraph "Layer 4: Execution Security"
        Sandbox[Multi-Layer Sandbox<br/>Process Isolation]
        Approval[Execution Approval<br/>Workflows]
        Timeout[Resource Limits<br/>Timeout Enforcement]
        Capability[Capability Checks<br/>Tool Permissions]
    end

    subgraph "Layer 5: Data Security"
        Encrypt[Encryption at Rest<br/>Sensitive Data]
        Isolation[Session Isolation<br/>No Cross-Leakage]
        Audit[Audit Logging<br/>Security Events]
        KillSwitch[Kill Switch<br/>Emergency Shutdown]
    end

    Internet[Internet/External] --> TLS
    TLS --> Tailscale
    Tailscale --> Firewall
    Firewall --> RateLimit

    RateLimit --> DevicePair
    DevicePair --> Scopes
    Scopes --> Challenge
    Challenge --> TokenRotate

    TokenRotate --> Schema
    Schema --> Sanitize
    Sanitize --> CredRedact
    CredRedact --> CommandObf

    CommandObf --> Sandbox
    Sandbox --> Approval
    Approval --> Timeout
    Timeout --> Capability

    Capability --> Encrypt
    Encrypt --> Isolation
    Isolation --> Audit
    Audit --> KillSwitch

    %% Styling
    classDef network fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef auth fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef input fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef exec fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef data fill:#fce4ec,stroke:#c2185b,stroke-width:2px

    class TLS,Tailscale,Firewall,RateLimit network
    class DevicePair,Scopes,Challenge,TokenRotate auth
    class Schema,Sanitize,CredRedact,CommandObf input
    class Sandbox,Approval,Timeout,Capability exec
    class Encrypt,Isolation,Audit,KillSwitch data
```

## Layer 1: Network & Transport Security

### TLS Configuration

```mermaid
graph LR
    Client[Client] -->|TLS 1.3| Gateway[Gateway Server]
    Gateway -->|Certificate| CA[Certificate Authority]

    subgraph "TLS Features"
        TLS13[TLS 1.3 Only]
        ALPN[ALPN: h2, http/1.1]
        SNI[SNI Required]
        Cipher[Strong Cipher Suites]
    end

    Gateway --> TLS13
    Gateway --> ALPN
    Gateway --> SNI
    Gateway --> Cipher

    style Client fill:#e1f5ff
    style Gateway fill:#fff3e0
    style CA fill:#f3e5f5
```

**Features:**

- TLS 1.3 with strong cipher suites only
- Certificate pinning for known clients
- Automatic certificate rotation
- HSTS headers for web UI

### Tailscale Integration

**Zero Trust Network Access:**

- Clients connect via Tailscale VPN
- Mutual TLS with Tailscale identity
- Network-level ACLs
- No public internet exposure

### Bind Policy

**Three modes:**

- **loopback** (`127.0.0.1`): Local-only connections
- **lan** (`0.0.0.0`): LAN access (secure network required)
- **tailnet**: Tailscale network only (recommended)

### Rate Limiting

**Protection against:**

- Brute-force authentication attempts
- DoS attacks on Gateway
- Resource exhaustion

**Limits:**

- 5 failed auth attempts per minute per IP
- 100 requests per minute per client
- Configurable per scope/method

## Layer 2: Authentication & Authorization

### Device Pairing Flow

```mermaid
sequenceDiagram
    participant Client as New Client
    participant Gateway as Gateway
    participant Operator as Operator<br/>(Approver)
    participant Store as Device Store

    Client->>Gateway: connect<br/>{deviceId, role, caps}
    Note over Gateway: First-time device

    Gateway->>Gateway: Generate challenge<br/>nonce

    alt Local Connection (127.0.0.1 or own tailnet)
        Gateway->>Gateway: Auto-approve<br/>(local trust)
        Gateway-->>Client: Approved + token
    else Remote Connection
        Gateway-->>Client: Pending approval<br/>{challenge}

        Gateway->>Operator: event:device.pair.requested<br/>{deviceId, metadata}

        Operator->>Gateway: device.pair.approve<br/>{deviceId, challenge_signature}

        Gateway->>Gateway: Verify signature<br/>against challenge

        Gateway->>Gateway: Generate device token<br/>(30-day expiry)

        Gateway->>Store: Save token<br/>{deviceId, token, expires}

        Gateway-->>Client: Approved + token

        Gateway->>Operator: event:device.pair.resolved<br/>{deviceId, approved: true}
    end

    Note over Client: Store token<br/>for future connections

    Client->>Gateway: connect (next time)<br/>{deviceId, token}

    Gateway->>Store: Validate token

    alt Token valid
        Gateway-->>Client: Authenticated
    else Token expired/invalid
        Gateway-->>Client: Re-pairing required
    end
```

### Scope-Based Access Control (RBAC)

| Scope                | Permissions                   | Methods                                                               |
| -------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `operator.admin`     | Full system access            | All methods                                                           |
| `operator.read`      | Read-only access              | `health`, `status`, `logs.tail`, `sessions.list`, `agents.list`, etc. |
| `operator.write`     | Chat and agent operations     | `chat.send`, `agent`, `send`, `wake`, `browser.request`               |
| `operator.approvals` | Execution approval management | `exec.approval.*`                                                     |
| `operator.pairing`   | Device/node pairing           | `device.pair.*`, `node.pair.*`                                        |

**Node Role:**

- Special role for execution nodes (iOS/Android/headless)
- Limited to: `node.invoke.result`, `node.event`, `skills.bins`
- Cannot invoke agent methods or access sessions

### Challenge-Response Authentication

**For non-local connections:**

1. Gateway sends random nonce (challenge)
2. Client signs with device private key
3. Gateway verifies signature with stored public key
4. Only then issues device token

**Prevents:**

- Replay attacks
- Token theft
- MITM attacks

### Token Rotation

**Lifecycle:**

- Tokens expire after 30 days
- Auto-renewal on successful connection within 7 days of expiry
- Manual rotation via `device.token.rotate`
- Emergency revocation via `device.token.revoke`

## Layer 3: Input Validation & Sanitization

### JSON Schema Validation

**All WebSocket requests validated against schemas:**

```typescript
// Example: chat.send validation
ChatSendParamsSchema = Type.Object(
  {
    sessionKey: NonEmptyString,
    message: Type.String(),
    thinking: Type.Optional(Type.String()),
    attachments: Type.Optional(Type.Array(Type.Unknown())),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 0 })),
    idempotencyKey: NonEmptyString,
  },
  { additionalProperties: false },
);
```

**Benefits:**

- Prevents malformed requests
- Type safety
- No SQL injection vectors (no SQL in use)
- Automatic error responses

### Credential Redaction (Sprint 01 - Phase 2)

```mermaid
graph LR
    Input[Input String] --> Scanner[Credential Scanner]

    Scanner --> Regex[Regex Patterns<br/>API keys, tokens, passwords]
    Scanner --> Context[Contextual Analysis<br/>Environment variables]

    Regex --> Redact[Redaction Engine]
    Context --> Redact

    Redact --> Replace[Replace with<br/>[REDACTED]]

    Replace --> Log[Log Output]
    Replace --> Storage[Storage Output]
    Replace --> Broadcast[WebSocket Broadcast]

    style Scanner fill:#f3e5f5,stroke:#7b1fa2
    style Redact fill:#ffebee,stroke:#c62828
    style Log,Storage,Broadcast fill:#e8f5e9,stroke:#388e3c
```

**Patterns detected:**

- API keys: `sk-...`, `api_key=...`
- OAuth tokens: `Bearer ...`
- Passwords: `password=...`, `pwd=...`
- Environment variables: `export SECRET=...`
- Connection strings: `postgresql://user:pass@...`

**Locations redacted:**

- Agent logs
- Transcript storage
- WebSocket event broadcasts
- Error messages
- Diagnostic outputs

### Command Obfuscation Detection

**Detects evasion techniques:**

- Base64-encoded commands
- Hex-encoded payloads
- Whitespace obfuscation
- Variable indirection
- Partial command construction

**Actions:**

- Flag for manual review
- Require elevated approval
- Log security event
- Optional automatic denial

## Layer 4: Execution Security

### Multi-Layer Sandbox

```mermaid
graph TB
    subgraph "Sandbox Layers"
        User[User Space<br/>Restricted UID]
        FS[Filesystem Isolation<br/>Chroot/Containers]
        Net[Network Restrictions<br/>Firewall Rules]
        Proc[Process Limits<br/>cgroups/ulimit]
        Sys[Syscall Filtering<br/>seccomp-bpf]
    end

    subgraph "Execution Context"
        Tool[Tool Execution]
        Timeout[Timeout Monitor<br/>Max 5min]
        Resource[Resource Monitor<br/>CPU/Memory]
    end

    Tool --> User
    User --> FS
    FS --> Net
    Net --> Proc
    Proc --> Sys

    Timeout -.-> Tool
    Resource -.-> Tool

    Sys --> Allowed{Syscall<br/>Allowed?}
    Allowed -->|Yes| Execute[Execute]
    Allowed -->|No| Kill[Kill Process]

    Execute --> Result[Return Result]
    Kill --> Error[Security Violation]

    %% Styling
    classDef sandbox fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef monitor fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef decision fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px

    class User,FS,Net,Proc,Sys sandbox
    class Timeout,Resource monitor
    class Allowed decision
```

**Sandbox Features:**

1. **Process Isolation**
   - Dedicated process per tool execution
   - No shared memory with Gateway
   - Parent-child process monitoring

2. **Filesystem Isolation**
   - Read-only system directories
   - Temporary workspace per execution
   - No access to sensitive files (`/etc/shadow`, etc.)

3. **Network Restrictions**
   - No outbound connections by default
   - Whitelist for approved domains
   - No raw socket access

4. **Resource Limits**
   - CPU: 80% max single core
   - Memory: 512MB per execution
   - Disk I/O: 50MB/s
   - Execution time: 5 minutes

5. **Syscall Filtering (seccomp)**
   - Blocks dangerous syscalls
   - Prevents privilege escalation
   - Denies kernel module loading

### Execution Approval Workflows

```mermaid
stateDiagram-v2
    [*] --> Requested: Tool execution requested

    Requested --> Evaluate: Evaluate security policy

    state Evaluate {
        [*] --> CheckPolicy
        CheckPolicy --> High: High-risk tool
        CheckPolicy --> Medium: Medium-risk tool
        CheckPolicy --> Low: Low-risk tool
    }

    High --> ApprovalRequired: Require human approval
    Medium --> AutoApprove: Auto-approve with audit
    Low --> AutoApprove

    ApprovalRequired --> WaitingApproval: Notify operator

    WaitingApproval --> Approved: Operator approves
    WaitingApproval --> Denied: Operator denies
    WaitingApproval --> Timeout: 5 min timeout

    Approved --> Execute
    AutoApprove --> Execute

    Execute --> [*]: Success
    Denied --> [*]: Blocked
    Timeout --> [*]: Expired

    note right of ApprovalRequired
        High-risk tools:
        - shell execution
        - file deletion
        - network access
        - browser actions
    end note
```

**Approval Tiers:**

| Tier                  | Examples                             | Action                   |
| --------------------- | ------------------------------------ | ------------------------ |
| **Auto-Approve**      | Read-only tools, safe commands       | Immediate execution      |
| **Audit**             | File writes, external APIs           | Execute + log for review |
| **Approval Required** | Shell commands, deletions            | Wait for operator        |
| **Deny**              | Kernel operations, privileged access | Always block             |

### Capability-Based Security

**Tool permissions declared upfront:**

```typescript
const toolDefinition = {
  name: "file_delete",
  capabilities: ["filesystem:write", "audit"],
  riskLevel: "high",
  requiresApproval: true,
};
```

**Enforcement:**

- Gateway checks tool capabilities vs. session permissions
- Nodes check local capabilities (camera, location, etc.)
- Violations logged and blocked

## Layer 5: Data Security

### Encryption at Rest

**Encrypted storage:**

- Device tokens (AES-256)
- OAuth credentials (AES-256)
- Sensitive session metadata (optional)

**Key management:**

- Keys stored in OS keychain/keyring
- Rotation every 90 days
- No keys in source code or config files

### Session Isolation

**Prevents cross-session data leakage:**

- Separate transcript files per session
- No shared state between sessions
- Session IDs randomly generated (UUID)
- Context isolation in agent runtime

### Audit Logging

**Security events logged:**

- Authentication attempts (success/failure)
- Device pairing approvals/denials
- Execution approvals/denials
- Tool invocations (with parameters)
- Configuration changes
- Suspicious command patterns
- Rate limit violations

**Log retention:**

- Security logs: 90 days
- Audit logs: 1 year
- Compliance exports available

### Kill Switch (ADR-12)

```mermaid
graph TB
    Trigger{Emergency<br/>Trigger}

    API[API Endpoint<br/>POST /api/kill-switch]
    CLI[CLI Command<br/>openclaw kill-switch]
    GPIO[Hardware Button<br/>GPIO trigger]
    Auto[Automatic<br/>Threat Detection]

    Trigger --> API
    Trigger --> CLI
    Trigger --> GPIO
    Trigger --> Auto

    API --> Shutdown[Shutdown Sequence]
    CLI --> Shutdown
    GPIO --> Shutdown
    Auto --> Shutdown

    Shutdown --> CloseChannels[Close all channels]
    Shutdown --> AbortRuns[Abort agent runs]
    Shutdown --> CloseWS[Close WebSocket connections]
    Shutdown --> SaveState[Save state snapshot]
    Shutdown --> Exit[Exit process]

    style Trigger fill:#ffebee,stroke:#c62828,stroke-width:3px
    style Shutdown fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    style Exit fill:#e0e0e0,stroke:#424242,stroke-width:2px
```

**Trigger scenarios:**

- Detected security breach
- Credential leakage detected
- Operator-initiated emergency shutdown
- Hardware button press (optional)
- Automatic threat response

**Shutdown sequence (< 5 seconds):**

1. Close all channel connections
2. Abort active agent runs
3. Close WebSocket connections
4. Save critical state
5. Clear sensitive memory
6. Exit process

## Threat Model & Mitigations

### Threat: Unauthorized Access

**Vectors:**

- Stolen device token
- Compromised Tailscale identity
- Network eavesdropping

**Mitigations:**

- ✅ Token rotation (30 days)
- ✅ TLS 1.3 encryption
- ✅ Challenge-response for remote connects
- ✅ Rate limiting on auth attempts

### Threat: Credential Leakage

**Vectors:**

- Agent logs containing secrets
- Transcript storage with API keys
- WebSocket broadcasts with passwords

**Mitigations:**

- ✅ Credential redaction (Sprint 01 - Phase 2)
- ✅ Pattern-based detection
- ✅ Context-aware scanning
- ✅ Redaction in all outputs

### Threat: Command Injection

**Vectors:**

- Malicious tool parameters
- Obfuscated shell commands
- Environment variable manipulation

**Mitigations:**

- ✅ Input sanitization
- ✅ Command obfuscation detection
- ✅ Sandbox execution
- ✅ Syscall filtering

### Threat: Privilege Escalation

**Vectors:**

- Exploiting vulnerable tools
- Bypassing sandbox restrictions
- Kernel exploits

**Mitigations:**

- ✅ Multi-layer sandbox
- ✅ Least-privilege execution
- ✅ seccomp syscall filtering
- ✅ Regular security updates

### Threat: Data Exfiltration

**Vectors:**

- Tool reading sensitive files
- Network access to external servers
- Cross-session data leakage

**Mitigations:**

- ✅ Filesystem isolation (chroot)
- ✅ Network restrictions
- ✅ Session isolation
- ✅ Audit logging

### Threat: Denial of Service

**Vectors:**

- Resource exhaustion (CPU/memory)
- Infinite loops in tools
- Connection flooding

**Mitigations:**

- ✅ Resource limits (cgroups)
- ✅ Execution timeouts
- ✅ Rate limiting
- ✅ Connection limits

## Security Roadmap (Sprint 02+)

### Planned Enhancements

1. **Anomaly Detection**
   - Machine learning for unusual command patterns
   - Behavioral analysis of tool usage
   - Automatic threat scoring

2. **Encrypted Transcripts**
   - End-to-end encryption for session transcripts
   - Key per session
   - User-controlled decryption

3. **Hardware Security Module (HSM)**
   - Store encryption keys in HSM
   - Hardware-backed token signing
   - Tamper detection

4. **Compliance Certifications**
   - SOC 2 Type II preparation
   - GDPR compliance review
   - HIPAA readiness (for healthcare use cases)

5. **Security Scanning**
   - Automated vulnerability scanning
   - Dependency audit (npm audit, Snyk)
   - Container image scanning

## Related Documents

- [System Architecture](system-architecture.md)
- [Message Flow Architecture](message-flow.md)
- [Kill Switch ADR](ADR_12_KILL_SWITCH.md)
- [Architecture Decision Records](ARCHITECTURE_DECISIONS.md)
