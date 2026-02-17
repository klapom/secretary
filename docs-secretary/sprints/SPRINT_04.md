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

### Phase 1: DGX Container (Week 1) ✅ COMPLETED (2026-02-16)

#### LivePortrait Container ✅

- [x] Create Dockerfile for LivePortrait (CUDA 13.0 + ARM64)
- [x] NGC PyTorch 25.09-py3 base image
- [x] Add health check endpoint
- [x] Configure shared memory limits (/dev/shm: 4GB)
- [x] Document GPU memory requirements (8GB VRAM)
- [x] Flash Attention workaround for sm_121
- [x] CUDA 13.0 environment variables
- [ ] Test GPU acceleration on DGX Spark (pending hardware access)

#### XTTS Container ✅

- [x] Create Dockerfile for XTTS (GPU, CUDA 13.0)
- [x] Pre-download models (Coqui TTS v2)
- [x] Add warm-up script for model loading
- [x] Configure GPU memory allocation (4GB VRAM)
- [ ] Test voice synthesis latency (<500ms) (pending deployment)

#### Whisper Container ✅

- [x] Create Dockerfile for Whisper (faster-whisper, CUDA 13.0)
- [x] Add model caching (reduce startup time)
- [x] Configure batch processing
- [ ] Test STT accuracy and latency (pending deployment)

#### Docker Compose Orchestration ✅

- [x] Create docker-compose.dgx.yml
- [x] Configure GPU resource limits (128GB unified memory budget)
- [x] Add service dependencies
- [x] Configure networking (bridge mode, internal APIs)
- [x] Add volume mounts (models, data, cache)
- [x] Docker profiles for on-demand GPU start (`profiles: [avatar]`)
- [x] Health checks and restart policies
- [ ] Test full stack startup on DGX (pending hardware access)

#### Documentation ✅

- [x] DGX Spark Reference Guide ([DGX_SPARK_REFERENCE.md](../guides/DGX_SPARK_REFERENCE.md))
- [x] AEGIS_Rag best practices integrated
- [x] Container README with troubleshooting
- [x] Sprint 04 technical specifications
- [x] Memory budgeting examples

**Phase 1 Summary:**

- 15 Docker files created (1497+ lines)
- DGX Spark specs integrated from AEGIS_Rag production
- Docker profiles for VRAM conservation
- ✅ Deployment tested on DGX Spark (192.168.178.10)

**Phase 1 Deployment Issues (Fixed):**

1. **Python 3.12 incompatibility** → Downgraded to pytorch:24.01-py3 (Python 3.11)
   - TTS library requires Python <3.12
   - Changed base images in liveportrait & xtts Dockerfiles

2. **Unimplemented services** → Commented out in docker-compose.dgx.yml
   - webrtc-signaling (Phase 3 work)
   - avatar-ui (run with Vite instead)

**Deployment Notes:** See [docker/DEPLOYMENT_NOTES.md](../../docker/DEPLOYMENT_NOTES.md) for detailed troubleshooting.

---

### Phase 2: Avatar Chat UI (Week 2) ✅ COMPLETED (2026-02-16)

#### Core Components ✅

- [x] AvatarVideo component (WebRTC display)
- [x] VoiceControls component (mic/speaker)
- [x] CharacterSelector component
- [x] StatusIndicator component

#### WebRTC Client ✅

- [x] useWebRTC hook (signaling + peer connection)
- [x] useAudioStream hook (mic input)
- [x] Handle connection states (connecting, connected, failed)
- [x] Handle reconnection logic

#### Integration 🔄 PENDING

- [x] Connect to WebRTC signaling server (configured)
- [ ] Test voice interaction flow (pending backend deployment)
- [ ] Test character switching (pending backend)
- [ ] Performance optimization (<200ms latency) (pending real deployment)

**Phase 2 Summary:**

- 18 React UI files created (~1,033 lines)
- Components: AvatarVideo, VoiceControls, CharacterSelector, StatusIndicator
- Hooks: useWebRTC (signaling + reconnection), useAudioStream (audio level)
- Tech Stack: React 18.3.1, TypeScript 5.4.5, Vite 5.3.1, TailwindCSS, simple-peer
- WebRTC proxy: `/ws` → ws://localhost:8080, `/api` → http://localhost:3001
- Features: Connection management, auto-reconnect, audio visualization, character selection
- Status: UI complete, ready for backend integration testing

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

### Phase 5: Test Coverage Sprint (71% → 90%)

**Current Status:** 71.01% Lines Coverage (60.69% Statements)

**Modules Under 70% Coverage (Prioritized by Effort/Impact):**

#### 4.1 src/tts (47.42% → 75%+) — HIGH PRIORITY

- **Status:** Critical for avatar feature
- **Current:** 47.42% lines, 49.87% statements
- **Target:** 75% (+27% gain)
- **Files:**
  - `tts-core.ts`: 42.1% → Need tests for GPU path, model loading, phoneme generation (lines 520-672)
  - `tts.ts`: 52.15% → Need tests for synthesis pipeline, error handling (lines 800-926)
- **Estimated Tests:** 15-18 test cases
- **Estimated Effort:** 6-8 hours (requires GPU mocking)
- **Key Scenarios:**
  - [ ] Test synthesis with various language inputs (German, English, mixed)
  - [ ] Test speaker switching (Claribel Dervla vs. Sofia Hellen)
  - [ ] Test error handling (invalid text, GPU OOM, timeout)
  - [ ] Test batch processing pipeline
  - [ ] Mock XTTS API responses

#### 4.2 src/plugin-sdk (23.22% → 60%+) — MEDIUM PRIORITY

- **Status:** Used by 36+ channel plugins
- **Current:** 23.22% lines, 3.41% statements
- **Target:** 60% (+36% gain)
- **Files:**
  - `index.ts`: Central exports (missing)
  - `config-paths.ts`, `webhook-path.ts`, `account-id.ts`, `file-lock.ts` (0%)
  - `onboarding.ts`, `allow-from.ts`, `text-chunking.ts`, `status-helpers.ts` (low coverage)
- **Estimated Tests:** 20-25 test cases
- **Estimated Effort:** 8-10 hours (integration tests required)
- **Key Scenarios:**
  - [ ] Config path resolution (multi-os compatibility)
  - [ ] Webhook path generation and validation
  - [ ] Account ID parsing and encoding
  - [ ] File locking behavior (concurrent access)
  - [ ] Onboarding flow mocking
  - [ ] Auth allow-from list validation
  - [ ] Text chunking edge cases (unicode, very long text)

#### 4.3 src/shared (62.83% → 80%+) — MEDIUM PRIORITY

- **Status:** Core shared utilities, used everywhere
- **Current:** 62.83% lines, 53.31% statements
- **Target:** 80% (+17% gain)
- **Key Files with Low Coverage:**
  - `chat-envelope.ts`, `chat-content.ts`: Message structure tests
  - `device-auth.ts`: Auth flow tests
  - `config-eval.ts`, `requirements.ts`: Config evaluation tests
  - `usage-aggregates.ts`, `entry-status.ts`: Data aggregation tests
- **Estimated Tests:** 12-15 test cases
- **Estimated Effort:** 4-6 hours

#### 4.4 src/infra/tls (9.52% → 50%+) — CRITICAL

- **Status:** Security critical
- **Current:** 9.52% lines
- **Target:** 50% (+40% gain)
- **Files:**
  - `gateway.ts`: TLS gateway implementation
  - `fingerprint.ts`: Certificate fingerprint validation
- **Estimated Tests:** 10-12 test cases
- **Estimated Effort:** 5-7 hours (requires TLS mocking)
- **Key Scenarios:**
  - [ ] Certificate validation
  - [ ] Fingerprint computation
  - [ ] TLS handshake mocking
  - [ ] Error handling (invalid cert, expired, etc.)

#### 4.5 src/media (64.15% → 75%+) — MEDIUM PRIORITY

- **Status:** Media file handling
- **Current:** 64.15% lines, 55.75% statements
- **Target:** 75% (+10% gain)
- **Estimated Tests:** 8-10 test cases
- **Estimated Effort:** 3-4 hours

#### 4.6 src/infra (69.84% → 80%+) — MEDIUM PRIORITY

- **Status:** Infrastructure, widely used
- **Current:** 69.84% lines, 57.6% statements
- **Target:** 80% (+10% gain)
- **Estimated Tests:** 10-12 test cases
- **Estimated Effort:** 4-5 hours

#### 4.7 src/logging (67.18% → 75%+) — LOW PRIORITY

- **Status:** Logging utilities (not critical path)
- **Current:** 67.18% lines, 52.35% statements
- **Target:** 75% (+8% gain)
- **Estimated Tests:** 5-7 test cases
- **Estimated Effort:** 2-3 hours

#### 4.8 src/config (67.22% → 75%+) — LOW PRIORITY

- **Status:** Configuration management
- **Current:** 67.22% lines, 59.56% statements
- **Target:** 75% (+8% gain)
- **Estimated Tests:** 6-8 test cases
- **Estimated Effort:** 2-3 hours

#### 4.9 src/sessions (69.58% → 80%+) — MEDIUM PRIORITY

- **Status:** Session management
- **Current:** 69.58% lines, 63.82% statements
- **Target:** 80% (+10% gain)
- **Estimated Tests:** 8-10 test cases
- **Estimated Effort:** 3-4 hours

#### 4.10 src/memory (70.95% → 80%+) — LOW PRIORITY

- **Status:** Just above 70% threshold
- **Current:** 70.95% lines, 55.51% statements
- **Target:** 80% (+9% gain)
- **Estimated Tests:** 5-7 test cases
- **Estimated Effort:** 2-3 hours

**Execution Plan (Total: 40-50 hours across sprint):**

**Week 1 (Priority order):**

- [ ] 4.4 TLS (5-7h) — Security critical, block if not done
- [ ] 4.1 TTS (6-8h) — Avatar feature enabler
- [ ] 4.2 Plugin-SDK (4-5h initial) — Start with config-paths + webhook-path

**Week 2:**

- [ ] 4.2 Plugin-SDK (remaining 4-5h)
- [ ] 4.3 Shared utilities (4-6h)
- [ ] 4.5-4.10 Remaining modules (8-12h)

**Success Criteria:**

- [ ] Overall coverage: 71% → 80% minimum (target: 85%)
- [ ] TLS module: 9.52% → 50%+
- [ ] TTS module: 47.42% → 75%+
- [ ] No module below 65% (except type definitions)
- [ ] All new tests passing (CI green)
- [ ] No performance regressions

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

- ✅ 80%+ test coverage maintained (current 71.01% → target 80%+ in Phase 5)
- ✅ All Sprint 03 deferred issues resolved
- ✅ Documentation complete
- ✅ Performance benchmarks documented
- 🟡 Test Coverage Sprint 05 planned (see Phase 5 tasks above)

---

## 📊 Technical Decisions

### DGX Spark Hardware Specifications

| Component           | Specification                        |
| ------------------- | ------------------------------------ |
| **GPU**             | NVIDIA GB10 (Blackwell Architecture) |
| **CUDA Capability** | sm_121 / sm_121a (CUDA 12.1+)        |
| **Memory**          | 128GB Unified (CPU + GPU shared)     |
| **CPU**             | 20 ARM Cortex Cores (aarch64)        |
| **CUDA Version**    | 13.0                                 |
| **Driver**          | 580.95.05+                           |
| **OS**              | Ubuntu 24.04 LTS                     |

**Framework Compatibility:**

| Framework         | Status            | Notes                                            |
| ----------------- | ----------------- | ------------------------------------------------ |
| **PyTorch cu130** | ✅ Works          | NGC Container `nvcr.io/nvidia/pytorch:25.09-py3` |
| **llama.cpp**     | ✅ Works          | Native CUDA compilation                          |
| **Triton**        | ⚠️ Build Required | Must build from source for sm_121a               |
| **TensorFlow**    | ❌ Unsupported    | Not supported on DGX Spark                       |

**Required Environment Variables:**

```bash
export TORCH_CUDA_ARCH_LIST="12.1a"
export TRITON_PTXAS_PATH=/usr/local/cuda/bin/ptxas
export CUDACXX=/usr/local/cuda-13.0/bin/nvcc
export CUDA_HOME=/usr/local/cuda-13.0
export PATH=$CUDA_HOME/bin:$PATH
export LD_LIBRARY_PATH=$CUDA_HOME/lib64:$LD_LIBRARY_PATH
```

**Flash Attention Workaround:**

```python
import torch
torch.backends.cuda.enable_flash_sdp(False)
torch.backends.cuda.enable_mem_efficient_sdp(True)
```

_Reason:_ Flash Attention kernels not yet compiled for sm_121. Memory-Efficient SDP provides acceptable performance (~10-12 sec/iter).

### Container Strategy

**Base Images (Updated for DGX Spark):**

- LivePortrait: `nvcr.io/nvidia/pytorch:25.09-py3` (CUDA 13.0, sm_121)
- XTTS: `nvcr.io/nvidia/pytorch:25.09-py3` (CUDA 13.0)
- Whisper: `nvidia/cuda:13.0.0-runtime-ubuntu24.04`

**GPU Allocation (128GB Unified Memory):**

```
Normal Mode (Chat):
  - OS Overhead: ~9GB
  - Available: ~119GB

Avatar Mode (Add to Normal):
  - LivePortrait: 8GB VRAM
  - XTTS: 4GB VRAM
  - Whisper: 2GB VRAM
  - Total: 14GB VRAM
  - Remaining: ~105GB free
```

**Docker Profiles (On-Demand Start):**

```bash
# Normal mode: No GPU services
docker compose up -d

# Avatar mode: Start GPU services when needed
docker compose --profile avatar up -d
```

_Benefit:_ GPU services only run when avatar is active, freeing VRAM for other tasks.

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

### ARM64 Considerations (DGX Spark aarch64)

DGX Spark uses **ARM Cortex cores (aarch64)** - requires ARM-compatible containers:

**NGC PyTorch Container (Recommended):**

- `nvcr.io/nvidia/pytorch:25.09-py3` (multi-arch, includes aarch64)
- Pre-compiled for ARM64 + CUDA 13.0 + sm_121
- Saves 2-3 hours of manual compilation

**Alternative (Manual Build):**

- Build PyTorch from source with `CMAKE_CUDA_ARCHITECTURES=121`
- Not recommended - NGC containers are production-ready

**Common Issues:**

- `/usr/bin/nvcc` (CUDA 12.0) → Wrong! Use `/usr/local/cuda-13.0/bin/nvcc`
- `pip install` fails → Use `--break-system-packages` (PEP 668)
- Flash Attention errors → Disable flash_sdp, enable mem_efficient_sdp (see above)

### Nemotron Model Integration (Optional)

**Nemotron-3-Nano-30B-A3B-NVFP4** could replace LivePortrait for text-driven avatars:

| Spec           | Value                              |
| -------------- | ---------------------------------- |
| Total Params   | 30B                                |
| Active Params  | 3.5B (MoE, 10% activation)         |
| Architecture   | Mamba2 + MoE + Attention           |
| Quantization   | NVFP4 (Blackwell FP4 tensor cores) |
| VRAM           | ~18 GB                             |
| Context        | 256K (up to 1M)                    |
| Expected tok/s | 60-80 on DGX Spark                 |

**Use Case:** Text-to-avatar generation instead of image-driven LivePortrait.

**Deployment via vLLM:**

```yaml
nemotron:
  image: vllm/vllm-openai:latest
  profiles: [avatar-nemotron]
  command: >
    --model nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-NVFP4
    --max-model-len 32768
    --max-num-seqs 8
    --gpu-memory-utilization 0.4
    --trust-remote-code
    --kv-cache-dtype fp8
```

**Decision:** Deferred to Sprint 05 - Focus on LivePortrait first (Sprint 04).

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

---

## 📌 Vorgemerkt für Sprint 05

### Upstream-Rebase: Proper GitHub-Fork erstellen

**Hintergrund:**
Das Repo wurde durch manuelle Kopie (nicht GitHub-Fork) gestartet → kein gemeinsamer git-Ancestor mit `openclaw/openclaw`.
Dadurch ist `git merge upstream/main` nicht möglich; upstream-Fixes müssen manuell portiert werden.

**Ziel:**
Sauberer Fork mit echtem Common Ancestor, damit ab Sprint 06 upstream-Sync via `git merge` funktioniert.

**Vorgehen:**

1. Proper GitHub-Fork von `openclaw/openclaw` erstellen
2. Unsere neuen Dateien (docker/, docs-secretary/, src/avatar/, .hooks/) als Branch drauflegen
   → ~854 Dateien, die upstream nicht anfasste → weitgehend konfliktfrei
3. Unsere Änderungen an bestehenden Dateien (Security, Queue, Config) als gezielte Commits portieren
   → ~5.490 potentielle Konflikte, nur Kern-Änderungen relevant
4. Upstream-Sync verifizieren: `git fetch upstream && git merge upstream/main`

**Aufwand:** ~1 Sprint (parallel zu anderen Tasks möglich)

**Voraussetzung:** Sprint 04 + 05 abgeschlossen (stabile Codebasis als Grundlage)

---

**Sprint Start:** 2026-02-17
**Sprint End:** 2026-02-28
**Review:** 2026-02-28 (Persona Reviews via sprint-end.sh)
