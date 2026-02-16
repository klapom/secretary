# Avatar System Deployment Notes

Real-world deployment insights from DGX Spark (2026-02-16).

---

## ✅ What Works

### Hardware

- **GPU:** NVIDIA GB10 Blackwell (sm_121) ✅
- **Driver:** 580.126.09 ✅
- **CUDA:** 12.1/13.0 support ✅
- **Memory:** 128GB unified ✅
- **Architecture:** ARM64 aarch64 ✅

### Software Stack

- **Docker:** 29.1.3 ✅
- **Docker Compose:** v5.0.1 ✅
- **NGC Containers:** Multi-arch support ✅

---

## ⚠️ Known Issues

### 1. Python Version Compatibility

**Issue:** TTS library incompatible with Python 3.12+

```
ERROR: Could not find a version that satisfies the requirement TTS>=0.22.0
TTS 0.22.0 requires Python >=3.9.0,<3.12
```

**Root Cause:**

- NGC PyTorch 25.09-py3 ships with Python 3.12.3
- Coqui TTS (XTTS) requires Python <3.12

**Solution:**

```dockerfile
# Use older NGC image with Python 3.11
FROM nvcr.io/nvidia/pytorch:24.01-py3  # Python 3.11
# NOT: nvcr.io/nvidia/pytorch:25.09-py3  # Python 3.12
```

**Files affected:**

- `docker/xtts/Dockerfile`
- `docker/liveportrait/Dockerfile.arm64`

**Trade-off:**

- CUDA 12.1 instead of 13.0 (acceptable for GB10)
- Slightly older PyTorch (still cu121 support)

---

### 2. WebRTC Signaling Server Not Implemented

**Issue:** Backend WebRTC signaling server referenced in docker-compose but not implemented.

**Status:** Phase 3 work (Sprint 04)

**Workaround:**

```yaml
# Commented out in docker-compose.dgx.yml
# webrtc-signaling:
#   ...
```

**Impact:**

- UI can be tested standalone
- No real video streaming yet
- Connection states work (mock)

---

### 3. Avatar UI Dockerfile Missing

**Issue:** docker-compose.dgx.yml references `ui/avatar-chat/Dockerfile` which doesn't exist.

**Solution:** Run UI with Vite dev server instead:

```bash
cd ui/avatar-chat
npm install
npm run dev
```

**Commented out in docker-compose.dgx.yml:**

```yaml
# avatar-ui:
#   build:
#     context: ../ui/avatar-chat
#     dockerfile: Dockerfile
```

---

### 4. Build Time

**Expected:** 15-30 minutes first time

**Breakdown:**

- NGC PyTorch base image: ~18GB (5-10 min)
- pip install dependencies: 3-5 min
- Model downloads:
  - LivePortrait models: 2-3 GB (3-5 min)
  - XTTS models: 1-2 GB (2-3 min)
  - Whisper models: 500MB-1GB (1-2 min)

**Optimization:** Models cached in Docker volumes (faster subsequent builds)

---

## 🔧 Deployment Steps (Validated)

### 1. Prerequisites Check

```bash
# On DGX Spark
nvidia-smi  # Check GPU
docker --version  # 29.1.3+
docker compose version  # v5.0.1+
```

### 2. Clone Repository

```bash
cd ~
git clone https://github.com/klapom/secretary.git
cd secretary/openclaw-source
```

### 3. Build Services

```bash
cd docker/

# Build all GPU services (15-30 min first time)
docker compose -f docker-compose.dgx.yml --profile avatar up -d --build

# Monitor progress
docker compose -f docker-compose.dgx.yml logs -f
```

### 4. Verify Deployment

```bash
# Check containers running
docker ps

# Expected:
# secretary-liveportrait
# secretary-xtts
# secretary-whisper

# Test health endpoints
curl http://localhost:8081/health  # LivePortrait
curl http://localhost:8082/health  # XTTS
curl http://localhost:8083/health  # Whisper

# Check GPU usage
nvidia-smi
```

### 5. Start UI Dev Server

```bash
cd ../ui/avatar-chat
npm install
npm run dev

# Access: http://localhost:3000
```

---

## 📊 Resource Usage (Expected)

### GPU Memory (VRAM)

```
Service           VRAM    Notes
-------------------------------------
LivePortrait      8GB     Avatar rendering
XTTS              4GB     Voice synthesis
Whisper           2GB     Speech-to-text
-------------------------------------
Total:            14GB    (out of 128GB)
Free:             114GB   (after OS ~9GB)
```

### System RAM

```
Service           RAM     Notes
-------------------------------------
LivePortrait      16-20GB
XTTS              8-12GB
Whisper           4-6GB
OS Overhead       9GB
-------------------------------------
Total:            ~46GB   (out of 128GB)
```

### Disk Space

```
Component         Size    Notes
-------------------------------------
Docker Images     ~40GB   NGC PyTorch base
Models (cached)   ~6GB    LivePortrait, XTTS, Whisper
Logs              ~1GB    Growing over time
-------------------------------------
Total:            ~47GB
```

---

## 🐛 Troubleshooting

### Build fails with "No matching distribution"

**Symptom:**

```
ERROR: No matching distribution found for TTS>=0.22.0
```

**Fix:** Use Python 3.11 container (see Issue #1 above)

---

### Containers exit immediately

```bash
# Check logs
docker compose -f docker-compose.dgx.yml logs <service>

# Common causes:
# 1. Model download failed → Check internet connection
# 2. CUDA not available → Check nvidia-smi
# 3. Out of memory → Check nvidia-smi memory
```

---

### Health check fails

```bash
# Check if service is listening
docker exec secretary-liveportrait curl http://localhost:8081/health

# Check container logs
docker logs secretary-liveportrait --tail 50
```

---

### GPU not detected

```bash
# Verify Docker runtime
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi

# If fails, install NVIDIA Container Toolkit:
# https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/
```

---

## 📝 Lessons Learned

### 1. Always Check Python Versions

NGC containers may have newer Python than your dependencies support. Check `requirements.txt` constraints.

### 2. ARM64 Requires Special Attention

DGX Spark uses ARM Cortex cores (aarch64). Ensure:

- Multi-arch Docker images
- ARM-compatible wheels (e.g., PyTorch)
- No x86-only binaries

### 3. Model Downloads Take Time

First build will be slow. Use Docker volumes to cache models:

```yaml
volumes:
  - liveportrait-models:/app/models
```

### 4. Phase Implementations Sequentially

Don't reference unimplemented services in docker-compose. Comment them out until implemented.

### 5. Test Locally First

Build and test containers on dev machine before deploying to DGX Spark (if possible).

---

## 🚀 Next Steps

### Immediate (Sprint 04 Phase 3)

- [ ] Implement WebRTC signaling server
- [ ] Connect LivePortrait → WebRTC pipeline
- [ ] Route XTTS audio through WebRTC
- [ ] Enable Whisper STT input

### Future Optimizations

- [ ] Multi-stage Docker builds (reduce image size)
- [ ] Model pre-caching in CI/CD
- [ ] Health check improvements (deeper checks)
- [ ] Resource monitoring (Prometheus/Grafana)

---

**Last Updated:** 2026-02-16
**Tested On:** DGX Spark (GB10 Blackwell, 128GB, ARM64, CUDA 12.1)
**Status:** ✅ Containers building successfully with fixes
