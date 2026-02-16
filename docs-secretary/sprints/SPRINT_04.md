# Sprint 04: Avatar System - Integration & DGX Container

**Duration:** 2026-02-17 to 2026-02-28 (2 Weeks)
**Status:** 📋 Planned
**Focus:** Avatar UI + DGX GPU Container + Multi-Channel Integration

---

## 🎯 Sprint Goals

### 1. 🐳 DGX Container (Priority: CRITICAL)

**Deploy Avatar System on DGX Spark with GPU acceleration**

- Docker container for LivePortrait (CUDA 12.1 + ARM64 support)
- Docker container for XTTS (GPU-accelerated voice synthesis)
- Docker container for Whisper (STT with GPU)
- Docker Compose orchestration
- Resource limits (GPU memory, CPU, shared memory)
- Health checks and restart policies

### 2. 🖼️ Avatar Chat UI

**React 18 frontend with WebRTC streaming**

- Avatar video display component
- Voice interaction controls (mic/speaker)
- Character selection interface
- WebRTC client integration
- Real-time status indicators

### 3. 📱 Multi-Channel Avatar Support

**Voice messages across WhatsApp/Telegram**

- Voice message to WhatsApp/Telegram
- Avatar responses via web UI
- Conversation sync across channels
- Voice command handling

### 4. 🧹 Cleanup from Sprint 03

**Fix deferred issues**

- WebRTC signaling tests (mock or fix - KNOWN_ISSUES.md)
- ARM64 container for LivePortrait
- Gateway API key test flakiness

---

## 📦 Deliverables

### DGX Container Setup

```
/docker/
  ├── liveportrait/
  │   ├── Dockerfile.arm64         # ARM64-compatible LivePortrait
  │   ├── requirements.txt         # Python dependencies
  │   └── entrypoint.sh            # Service startup
  ├── xtts/
  │   ├── Dockerfile               # XTTS GPU container
  │   └── model-download.sh        # Pre-download models
  ├── whisper/
  │   ├── Dockerfile               # Whisper STT container
  │   └── model-cache.sh           # Model caching
  └── docker-compose.dgx.yml       # DGX-specific orchestration
```

### Avatar Chat UI

```
/ui/avatar-chat/
  ├── src/
  │   ├── components/
  │   │   ├── AvatarVideo.tsx      # WebRTC video display
  │   │   ├── VoiceControls.tsx    # Mic/speaker controls
  │   │   ├── CharacterSelector.tsx # Character picker
  │   │   └── StatusIndicator.tsx  # Connection status
  │   ├── hooks/
  │   │   ├── useWebRTC.ts         # WebRTC client hook
  │   │   ├── useAudioStream.ts    # Audio streaming
  │   │   └── useCharacter.ts      # Character state
  │   ├── services/
  │   │   └── avatarClient.ts      # API client
  │   └── App.tsx
  ├── vite.config.ts
  └── package.json
```

---

## 🗂️ Tasks

### Phase 1: DGX Container (Week 1)

#### LivePortrait Container

- [ ] Create Dockerfile for LivePortrait (CUDA 12.1 + ARM64)
- [ ] Test GPU acceleration (NVIDIA A100/H100)
- [ ] Add health check endpoint
- [ ] Configure shared memory limits (/dev/shm)
- [ ] Document GPU memory requirements

#### XTTS Container

- [ ] Create Dockerfile for XTTS (GPU)
- [ ] Pre-download models (Coqui TTS v2)
- [ ] Test voice synthesis latency (<500ms)
- [ ] Add warm-up script for model loading
- [ ] Configure GPU memory allocation

#### Whisper Container

- [ ] Create Dockerfile for Whisper (faster-whisper)
- [ ] Test STT accuracy and latency
- [ ] Add model caching (reduce startup time)
- [ ] Configure batch processing

#### Docker Compose Orchestration

- [ ] Create docker-compose.dgx.yml
- [ ] Configure GPU resource limits
- [ ] Add service dependencies
- [ ] Configure networking (bridge + host)
- [ ] Add volume mounts (models, data)
- [ ] Test full stack startup

### Phase 2: Avatar Chat UI (Week 2)

#### Core Components

- [ ] AvatarVideo component (WebRTC display)
- [ ] VoiceControls component (mic/speaker)
- [ ] CharacterSelector component
- [ ] StatusIndicator component

#### WebRTC Client

- [ ] useWebRTC hook (signaling + peer connection)
- [ ] useAudioStream hook (mic input)
- [ ] Handle connection states (connecting, connected, failed)
- [ ] Handle reconnection logic

#### Integration

- [ ] Connect to WebRTC signaling server
- [ ] Test voice interaction flow
- [ ] Test character switching
- [ ] Performance optimization (<200ms latency)

### Phase 3: Multi-Channel Integration

- [ ] Voice message handler for WhatsApp
- [ ] Voice message handler for Telegram
- [ ] Avatar response routing
- [ ] Conversation sync (web ↔ WhatsApp/Telegram)
- [ ] Test voice commands

### Phase 4: Testing & Cleanup

- [ ] Fix WebRTC signaling tests (KNOWN_ISSUES.md)
- [ ] Fix Gateway API key test flakiness
- [ ] Integration tests for avatar pipeline
- [ ] E2E tests for voice interaction
- [ ] Load testing (concurrent users)
- [ ] Documentation (deployment guide)

---

## 🎯 Success Criteria

### DGX Container

- ✅ LivePortrait runs on DGX Spark (ARM64 + CUDA 12.1)
- ✅ XTTS voice synthesis <500ms latency
- ✅ Whisper STT <300ms latency
- ✅ All services start with `docker compose up`
- ✅ GPU utilization monitored (nvidia-smi)
- ✅ Services auto-restart on failure

### Avatar Chat UI

- ✅ Avatar video streams in browser
- ✅ Voice controls functional
- ✅ Character switching works
- ✅ WebRTC latency <200ms
- ✅ UI responsive (React 18)

### Multi-Channel

- ✅ WhatsApp voice messages work
- ✅ Telegram voice messages work
- ✅ Conversation sync across channels
- ✅ Voice commands recognized

### Quality

- ✅ 80%+ test coverage maintained
- ✅ All Sprint 03 deferred issues resolved
- ✅ Documentation complete
- ✅ Performance benchmarks documented

---

## 📊 Technical Decisions

### Container Strategy

**Base Images:**

- LivePortrait: `nvcr.io/nvidia/pytorch:24.01-py3` (CUDA 12.1)
- XTTS: `nvcr.io/nvidia/pytorch:24.01-py3`
- Whisper: `python:3.11-slim` + CUDA toolkit

**GPU Allocation:**

- LivePortrait: 8GB VRAM (primary)
- XTTS: 4GB VRAM (voice synthesis)
- Whisper: 2GB VRAM (STT)
- Total: 14GB VRAM minimum (DGX has 40GB/80GB)

**Networking:**

- Frontend UI: Port 3000 (HTTP)
- Avatar WebRTC: Port 8080 (WS signaling)
- LivePortrait API: Port 8081 (internal)
- XTTS API: Port 8082 (internal)
- Whisper API: Port 8083 (internal)

### UI Framework

- **React 18** (modern, fast, TypeScript support)
- **Vite** (fast dev server, HMR)
- **TailwindCSS** (rapid styling)
- **simple-peer** (WebRTC abstraction)

---

## 🔗 Dependencies

### Sprint 03 Outputs (Required)

- ✅ Character Manager API
- ✅ WebRTC streaming server
- ✅ LivePortrait integration
- ✅ XTTS integration
- ✅ Whisper integration

### External Dependencies

- DGX Spark access (NVIDIA drivers, Docker)
- GPU availability (CUDA 12.1+)
- Network ports (3000, 8080-8083)

---

## 📝 Notes

### Known Issues from Sprint 03

See [KNOWN_ISSUES.md](../../KNOWN_ISSUES.md):

1. WebRTC signaling tests skipped (fix in Phase 4)
2. Gateway API key test flakiness (investigate)

### ARM64 Considerations

LivePortrait requires ARM64-compatible PyTorch build:

- Use `nvcr.io/nvidia/pytorch:24.01-py3-arm64sbsa` base image
- Test on DGX Grace Hopper (ARM64 + NVIDIA GPU)
- Fallback to x86_64 if ARM64 unavailable

### Performance Targets

- **Voice-to-Avatar latency:** <1 second (STT + TTS + render)
- **WebRTC latency:** <200ms (video/audio streaming)
- **Character switching:** <2 seconds (model loading)

---

## 🚀 Getting Started

```bash
# Phase 1: DGX Container Setup
cd docker/
docker compose -f docker-compose.dgx.yml up --build

# Phase 2: UI Development
cd ui/avatar-chat/
npm install
npm run dev

# Phase 3: Integration Testing
npm run test:integration

# Phase 4: E2E Testing
npm run test:e2e
```

---

**Sprint Start:** 2026-02-17
**Sprint End:** 2026-02-28
**Review:** 2026-02-28 (Persona Reviews via sprint-end.sh)
