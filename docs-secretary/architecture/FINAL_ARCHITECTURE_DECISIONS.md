# Final Architecture Decision Records (ADR)

# OpenClaw Fork - Entschiedene Architektur

**Datum:** 2026-02-15
**Status:** ✅ FINALIZED
**Projekt:** Persönlicher AI-Assistent basierend auf OpenClaw

---

## 📋 Zusammenfassung aller Entscheidungen

| ADR        | Bereich                 | Entscheidung                            | Aufwand    | Begründung                                                            |
| ---------- | ----------------------- | --------------------------------------- | ---------- | --------------------------------------------------------------------- |
| **ADR-01** | Architektur             | **B - Modularer Monolith**              | 4-6 Wochen | Persönlicher Assistent, schnelle Entwicklung, Cloud-Migration möglich |
| **ADR-02** | WhatsApp Race Condition | **B - Message Queue**                   | 1 Woche    | 100% Delivery, Crash-Safe, Kill Switch Integration                    |
| **ADR-03** | Sandbox Security        | **B - Hardened Docker**                 | 1 Woche    | Gute Security, DGX Spark ready, Migration zu gVisor möglich           |
| **ADR-04** | Database                | **B - SQLite + WAL**                    | 3-5 Tage   | Single-File, keine EBUSY, ausreichend für Use Case                    |
| **ADR-05** | Message Broker          | **C - In-Process Event Bus**            | 2-3 Tage   | Monolith-optimal, 0 Dependencies, Migration-Path zu NATS              |
| **ADR-06** | Credential Leakage      | **C - Regex + Encryption**              | 3-4 Tage   | Defense in Depth, Quick Win, ausreichende Coverage                    |
| **ADR-07** | Command Obfuscation     | **B - AST + Heuristics**                | 4-5 Tage   | Balance Security/Performance                                          |
| **ADR-08** | Deployment              | **C - Docker Compose + K8s-ready**      | 3-5 Tage   | DGX Spark, Cloud-Migration vorbereitet                                |
| **ADR-09** | Observability           | **B - Structured Logging + Prometheus** | 2-3 Tage   | Debugging-fähig, Production-ready optional                            |
| **ADR-10** | Browser Tab Mgmt        | **A - Tab Pool mit Limits**             | 2-3 Tage   | Memory-Safe, DoS-Prevention                                           |
| **ADR-11** | Avatar Interface        | **LivePortrait (Stylized→Hyperreal)**   | 3 Wochen   | Character Customization, Migration-Path                               |
| **ADR-12** | Kill Switch             | **Multi-Layer Emergency Shutdown**      | 1 Woche    | Safety-Critical, LLM trennbar                                         |

**Total Development Time:** ~10-12 Wochen (2.5-3 Monate)

---

## 🏗️ Finale System-Architektur

```
┌─────────────────────────────────────────────────────────────────────┐
│                     OpenClaw Monolith (DGX Spark)                   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Kill Switch (Global)                        │ │
│  │  API | CLI | Hardware Button | Watchdog                        │ │
│  └────────────────────────┬───────────────────────────────────────┘ │
│                           │                                          │
│  ┌────────────────────────▼───────────────────────────────────────┐ │
│  │                   Gateway Module                               │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │ │
│  │  │WhatsApp  │  │ Telegram │  │  Slack   │  │Avatar Channel│  │ │
│  │  │ Adapter  │  │ Adapter  │  │ Adapter  │  │  (WebRTC)    │  │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │ │
│  └───────┼─────────────┼─────────────┼────────────────┼──────────┘ │
│          │             │             │                │             │
│          └─────────────┴─────────────┴────────────────┘             │
│                           │                                          │
│  ┌────────────────────────▼──────────────────────────────────────┐  │
│  │              In-Process Event Bus                             │  │
│  │  Topics: inbound.message | outbound.message | tool.exec      │  │
│  └────────────────────────┬──────────────────────────────────────┘  │
│                           │                                          │
│  ┌────────────────────────▼──────────────────────────────────────┐  │
│  │                 Agent Runtime Module                          │  │
│  │  ┌──────────────┐  ┌────────────────┐  ┌──────────────────┐ │  │
│  │  │ LLM Backend  │  │ Context Mgmt   │  │ Tool Orchestrator│ │  │
│  │  │ (Claude API) │  │ (Sliding Win)  │  │                  │ │  │
│  │  └──────┬───────┘  └────────────────┘  └────────┬─────────┘ │  │
│  └─────────┼──────────────────────────────────────────┼─────────┘  │
│            │                                          │             │
│  ┌─────────▼──────────────────────────────────────────▼─────────┐  │
│  │                 Tool Executor Module                          │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │  │
│  │  │ Docker Sandbox   │  │  Command Filter  │  │ MCP Tools  │ │  │
│  │  │ (Hardened)       │  │  (Obfuscation)   │  │ Integration│ │  │
│  │  └──────────────────┘  └──────────────────┘  └────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │               Avatar Rendering Module                        │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐  │  │
│  │  │    STT     │→ │     TTS      │→ │   LivePortrait     │  │  │
│  │  │  (Whisper) │  │    (XTTS)    │  │   (Stylized)       │  │  │
│  │  └────────────┘  └──────────────┘  └────────────────────┘  │  │
│  │  ┌──────────────────────────────────────────────────────────┐│  │
│  │  │        Character Manager + Asset Storage              ││  │
│  │  └──────────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │               Persistence Layer                              │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │  │
│  │  │ SQLite + WAL     │  │ Message Queue    │                 │  │
│  │  │ - Sessions       │  │ - Outbound Queue │                 │  │
│  │  │ - History (enc)  │  │ - Retry Logic    │                 │  │
│  │  │ - Characters     │  │                  │                 │  │
│  │  └──────────────────┘  └──────────────────┘                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                Security & Observability                      │  │
│  │  ┌──────────────────┐  ┌──────────────────┐                 │  │
│  │  │ Credential       │  │ Structured       │                 │  │
│  │  │ Redaction        │  │ Logging (JSON)   │                 │  │
│  │  │ + Encryption     │  │ + Prometheus     │                 │  │
│  │  └──────────────────┘  └──────────────────┘                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  Docker (DGX Spark)    │
              │  - GPU Passthrough     │
              │  - Volume Mounts       │
              └────────────────────────┘
```

---

## 🚀 Migration Path zu Cloud (später)

### Phase 1 (JETZT): Modularer Monolith auf DGX

```yaml
# docker-compose.yml
services:
  openclaw:
    image: openclaw:latest
    volumes:
      - ./data:/data
      - ~/.openclaw:/root/.openclaw
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]
```

### Phase 2 (SPÄTER): Microservices in Cloud

```
┌──────────────┐     ┌────────────┐     ┌──────────────┐
│   Gateway    │────▶│   NATS     │────▶│    Agent     │
│   Service    │     │  (Cloud)   │     │   Runtime    │
│ (Cloud Run)  │     └────────────┘     │  (ECS+GPU)   │
└──────────────┘                        └──────────────┘
       │                                        │
       │                                        ▼
       │                              ┌──────────────────┐
       │                              │  Tool Executor   │
       │                              │  (Lambda/Fargate)│
       │                              └──────────────────┘
       ▼
┌──────────────────┐
│ Avatar Service   │
│ (GPU Instance)   │
└──────────────────┘

Storage: SQLite → PostgreSQL (RDS)
Event Bus: In-Process → NATS JetStream
Sandbox: Docker → gVisor (GKE)
```

**Migration-Aufwand:** 2-3 Wochen (wegen sauberer Interfaces)

---

## 🔒 Sicherheits-Features (implementiert)

| Feature                     | Implementation                    | Status    |
| --------------------------- | --------------------------------- | --------- |
| **Kill Switch**             | Multi-Layer (API/CLI/Hardware)    | ✅ ADR-12 |
| **Sandbox**                 | Hardened Docker (→ gVisor später) | ✅ ADR-03 |
| **Credential Redaction**    | Regex + AES-256-GCM Encryption    | ✅ ADR-06 |
| **Command Obfuscation**     | AST-based Detection               | ✅ ADR-07 |
| **Sensitive Path Blocking** | Deny ~/.ssh, ~/.aws, etc.         | ✅ ADR-03 |
| **Message Queue**           | Delivery Guarantee + Retry        | ✅ ADR-02 |
| **Audit Logging**           | Structured JSON Logs              | ✅ ADR-09 |

---

## 📊 Performance Targets

| Metrik                       | Target       | Implementation           |
| ---------------------------- | ------------ | ------------------------ |
| **Message Latency**          | <2s (text)   | Event Bus + WAL SQLite   |
| **Avatar Response**          | <3s (voice)  | LivePortrait optimized   |
| **Concurrent Sessions**      | 10-20        | SQLite WAL + Docker      |
| **Message Queue Throughput** | 100/min      | SQLite + Worker Pool     |
| **Tool Execution**           | <30s timeout | Docker + Resource Limits |
| **Database Writes**          | 1000/s       | WAL Mode                 |

---

## 🧪 Testing Strategy

| Level                 | Coverage            | Tools           |
| --------------------- | ------------------- | --------------- |
| **Unit Tests**        | 80%                 | Jest, pytest    |
| **Integration Tests** | Critical Paths      | Testcontainers  |
| **E2E Tests**         | User Journeys       | Playwright      |
| **Security Tests**    | Penetration Testing | OWASP ZAP, Snyk |
| **Performance Tests** | Load/Stress         | k6              |

---

## 📦 Deployment Targets

### Development (DGX Spark)

```bash
docker-compose up -d
# Single command deployment
```

### Production (Cloud - später)

```bash
# Kubernetes
kubectl apply -f k8s/
# Oder Helm
helm install openclaw ./helm/openclaw
```

---

## 🔄 Feature Flags für Migration

```typescript
// config/features.ts
export const features = {
  // Phase 1 (JETZT)
  eventBus: "in-process", // Later: 'nats'
  database: "sqlite", // Later: 'postgres'
  sandbox: "docker", // Later: 'gvisor'
  avatar: "stylized", // Later: 'hyperrealistic'

  // Phase 2 (CLOUD)
  multiTenant: false, // Later: true
  horizontalScaling: false, // Later: true

  // Optional
  mcp: true, // MCP Integration!
  webUI: true, // Frontend
  hardwareKillSwitch: false, // GPIO Button
};
```

---

## 💰 Kosten-Übersicht

### Development (Jahr 1)

| Item                              | Kosten              |
| --------------------------------- | ------------------- |
| **Development** (10-12 Wochen)    | €0 (Claude Code)    |
| **DGX Spark** (bereits vorhanden) | €0                  |
| **LLM API** (Anthropic)           | €100-500/Monat      |
| **Domain + SSL**                  | €50/Jahr            |
| **Backup Storage**                | €10/Monat           |
| **Total Jahr 1**                  | **€1,200 - €6,000** |

### Production (Cloud - später)

| Item                  | Kosten/Monat              |
| --------------------- | ------------------------- |
| Kubernetes Cluster    | €200                      |
| GPU Instance (Avatar) | €300                      |
| PostgreSQL (Managed)  | €100                      |
| NATS (Managed)        | €50                       |
| LLM API               | €500-2000                 |
| **Total**             | **€1,150 - €2,650/Monat** |

---

## ✅ Nächste Schritte

1. **Frontend Planning** (siehe separates Dokument)
2. **MCP Integration** (siehe separates Dokument)
3. **Implementation Roadmap** (siehe separates Dokument)

---

**Status:** ✅ Architecture Finalized
**Ready for Implementation:** Yes
**Migration Path:** Documented
