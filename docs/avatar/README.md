# Avatar System

Sprint 03 implements a complete avatar rendering and streaming pipeline for the Secretary Assistant. The system combines real-time avatar animation with speech synthesis and speech recognition.

## Overview

The Avatar System is a complete pipeline that enables real-time, interactive avatar conversations:

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (WebRTC Client)                                    │
│                                                             │
│ User Microphone ──┐                        ┌── Avatar Video │
│                  └──> Whisper STT (8083)──>│  LivePortrait  │
│                     (German speech        │  (8081)        │
│                      recognition)         │                │
│                                           └── XTTS TTS     │
│ Text Output <────────────────────────────────  (8082)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

WebRTC Signaling: Port 8086 (MediaBridge)
```

## Services

The Avatar System consists of four core Python microservices, all deployed via Docker:

| Service              | Port | Purpose                            | GPU                              | Status          |
| -------------------- | ---- | ---------------------------------- | -------------------------------- | --------------- |
| **LivePortrait**     | 8081 | Avatar rendering from static image | CUDA + ONNX (CPU face detection) | ✅ Production   |
| **XTTS v2**          | 8082 | Voice synthesis (17 languages)     | CUDA                             | ✅ Production   |
| **Whisper Large V3** | 8083 | Speech-to-text (97 languages)      | CUDA                             | ✅ Production   |
| **Canary-NeMo**      | 8084 | Alternative STT (experimental)     | CPU                              | 🧪 Experimental |
| **WebRTC Signaling** | 8086 | Video/audio streaming coordination | N/A                              | ✅ TypeScript   |

## Documentation

- **[LivePortrait Details](./liveportrait.md)** — Avatar rendering service, expressions, performance
- **[Service Status](../docker/SETUP_A_STATUS.md)** — Complete deployment guide, API examples, technical learnings
- **[Orchestrator](./orchestrator.md)** — Pipeline coordination (TypeScript, port 8086 signaling)

## Quick Start

### 1. Start Services

```bash
cd /home/admin/projects/secretary/openclaw-source/docker/
docker compose -f docker-compose.dgx.yml --profile avatar up -d
```

### 2. Health Checks

```bash
curl http://localhost:8081/health  # LivePortrait
curl http://localhost:8082/health  # XTTS
curl http://localhost:8083/health  # Whisper
```

### 3. Test UI

Access the test interface at **https://192.168.178.10:8085**:

- Microphone input → Whisper STT
- Text input → XTTS TTS
- Full end-to-end pipeline test

## Port Reference

```
8081  = LivePortrait (avatar rendering)
8082  = XTTS TTS (voice synthesis)
8083  = Whisper STT (speech recognition)
8084  = Canary-NeMo STT (experimental)
8085  = Test UI (Flask server)
8086  = WebRTC Signaling (IMPORTANT: NOT 8081 — separate from LivePortrait!)
```

**Critical:** WebRTC signaling runs on **port 8086**, not 8081. This avoids conflict with the LivePortrait rendering service.

## Orchestrator

The TypeScript Orchestrator (`src/avatar/orchestrator.ts`) coordinates all services:

- **Video Pipeline:** Captures user emotion input → sends to LivePortrait (8081) → renders avatar frames
- **Audio Input:** Browser microphone → Whisper STT (8083) → transcription
- **Audio Output:** Text → XTTS TTS (8082) → audio playback
- **WebRTC:** Coordinates MediaBridge for real-time video/audio streaming (port 8086)

All services are stateless HTTP microservices; the orchestrator handles sequencing and error handling.

## Performance Targets

| Component    | Metric             | Target       | Actual                      |
| ------------ | ------------------ | ------------ | --------------------------- |
| LivePortrait | Frame rendering    | <100ms       | ~80ms (after warmup)        |
| LivePortrait | First frame warmup | -            | ~12s (torch compilation)    |
| XTTS         | Synthesis time     | <1s          | 0.5-0.7s (GPU)              |
| Whisper      | Transcription      | <1s/5s-audio | ~0.5-1s (GPU)               |
| WebRTC       | End-to-end latency | <200ms       | Pending (real browser test) |

## Known Limitations

1. **LivePortrait Cold Start:** First frame takes ~12s due to torch model compilation. Subsequent frames are fast (~80ms). The service warms up on startup automatically.

2. **XTTS vs. Whisper Incompatibility:** XTTS-generated audio causes Whisper to hallucinate (issue #16920). Use real microphone audio for STT; XTTS for human listening only.

3. **Canary-NeMo Experimental:** Not recommended for production. Whisper Large V3 (port 8083) is the standard.

## DGX Spark ARM64 Specific Notes

- All services use `torch==2.10.0+cu130` pre-installed to support GB10/sm_121 GPU
- `transformers` pinned to `<4.43.0` for XTTS quality (see SETUP_A_STATUS.md for details)
- Models cached in Docker volumes (~800MB LivePortrait, ~1.8GB XTTS, ~3GB Whisper)

See [Technical Learnings](../docker/SETUP_A_STATUS.md#-key-technical-learnings) for detailed dependency fixes.

## Next Steps

- **End-to-End Browser Test:** Validate real WebRTC streaming latency
- **Character Management:** Swap avatars via Character Manager (SQL backend)
- **Hyperrealistic Path:** Plan transition to realistic avatars (Sprint 05-06)
