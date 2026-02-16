# Secretary Avatar System - DGX Container Setup

Docker containerization for GPU-accelerated Avatar System services.

## 🎯 Overview

This setup provides Docker containers for the Secretary Avatar System, optimized for **NVIDIA DGX Spark** with Blackwell GB10 GPU.

**Hardware:**

- **GPU:** NVIDIA GB10 (Blackwell Architecture, sm_121)
- **CUDA:** 13.0 (CUDA Capability 12.1+)
- **Memory:** 128GB Unified (CPU + GPU shared)
- **CPU:** 20 ARM Cortex Cores (aarch64)
- **OS:** Ubuntu 24.04 LTS

**Services:**

- **LivePortrait** - Avatar rendering (8GB VRAM)
- **XTTS** - Voice synthesis (4GB VRAM)
- **Whisper** - Speech-to-text (2GB VRAM)
- **WebRTC Signaling** - Real-time streaming
- **Avatar UI** - React frontend

**GPU Budget:**

```
Normal Mode:  ~9GB OS overhead = 119GB available
Avatar Mode:  +14GB (LivePortrait 8GB + XTTS 4GB + Whisper 2GB) = 105GB free
```

**Docker Profiles:** Services use `profiles: [avatar]` for on-demand GPU activation

---

## 🚀 Quick Start

### Prerequisites

```bash
# 1. NVIDIA GPU with CUDA 12.1+
nvidia-smi

# 2. Docker with NVIDIA GPU support
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi

# 3. Docker Compose v2.x
docker compose version
```

### Build and Run

```bash
cd docker/

# Build all services
docker compose -f docker-compose.dgx.yml build

# Normal Mode: Start non-GPU services only
docker compose -f docker-compose.dgx.yml up -d

# Avatar Mode: Start GPU services (on-demand)
docker compose -f docker-compose.dgx.yml --profile avatar up -d

# View logs
docker compose -f docker-compose.dgx.yml logs -f liveportrait

# Stop all services
docker compose -f docker-compose.dgx.yml down

# Stop avatar services only (free 14GB VRAM)
docker compose -f docker-compose.dgx.yml --profile avatar down
```

**Docker Profile Benefits:**

- GPU services only start when avatar is active
- Frees 14GB VRAM when not needed
- Faster startup (no GPU initialization delay)
- Lower power consumption

---

## 📊 Service Details

### LivePortrait (Port 8081)

**Purpose:** Avatar rendering from character images
**GPU:** 8GB VRAM
**Base Image:** `nvcr.io/nvidia/pytorch:24.01-py3`

**Endpoints:**

- `GET /health` - Health check
- `POST /render` - Render avatar video
- `POST /render-frame` - Render single frame

**Test:**

```bash
curl http://localhost:8081/health
```

### XTTS (Port 8082)

**Purpose:** Voice synthesis (text-to-speech)
**GPU:** 4GB VRAM
**Base Image:** `nvcr.io/nvidia/pytorch:24.01-py3`

**Endpoints:**

- `GET /health` - Health check
- `POST /synthesize` - Generate speech from text
- `POST /synthesize-with-voice-clone` - Voice cloning

**Test:**

```bash
curl http://localhost:8082/health
```

### Whisper (Port 8083)

**Purpose:** Speech-to-text transcription
**GPU:** 2GB VRAM
**Base Image:** `nvidia/cuda:12.1.0-runtime-ubuntu22.04`

**Endpoints:**

- `GET /health` - Health check
- `POST /transcribe` - Transcribe audio to text
- `POST /detect-language` - Detect language

**Test:**

```bash
curl http://localhost:8083/health
```

### WebRTC Signaling (Port 8080)

**Purpose:** Real-time video/audio streaming
**No GPU required**

### Avatar UI (Port 3000)

**Purpose:** React frontend for avatar interaction
**No GPU required**

**Access:** http://localhost:3000

---

## 🔧 Configuration

### GPU Resource Limits

Edit `docker-compose.dgx.yml` to adjust GPU allocation:

```yaml
services:
  liveportrait:
    deploy:
      resources:
        reservations:
          memory: 16G # Adjust based on available RAM
        limits:
          memory: 20G
    shm_size: "4gb" # Shared memory for PyTorch
```

### Environment Variables

```bash
# LivePortrait
CUDA_VISIBLE_DEVICES=0  # GPU index
PYTHONUNBUFFERED=1

# XTTS
COQUI_TOS_AGREED=1  # Accept Coqui TTS terms
```

---

## 🧪 Testing

### Health Checks

```bash
# Check all services
for port in 8081 8082 8083 8080; do
  echo "Checking port $port..."
  curl -f http://localhost:$port/health || echo "FAILED"
done
```

### GPU Monitoring

```bash
# Monitor GPU usage
watch -n 1 nvidia-smi

# Check container GPU access
docker exec secretary-liveportrait nvidia-smi
```

### Performance Testing

```bash
# Test LivePortrait rendering
curl -X POST http://localhost:8081/render \
  -F "character_image=@/path/to/image.png" \
  -o output.mp4

# Test XTTS synthesis
curl -X POST http://localhost:8082/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","language":"en"}' \
  -o speech.wav

# Test Whisper transcription
curl -X POST http://localhost:8083/transcribe \
  -F "audio=@/path/to/audio.wav"
```

---

## 🐛 Troubleshooting

### Issue: Container fails to start

**Solution:** Check GPU availability and CUDA version

```bash
nvidia-smi
docker run --rm --gpus all nvidia/cuda:12.1.0-base-ubuntu22.04 nvidia-smi
```

### Issue: Out of memory errors

**Solution:** Reduce batch size or GPU memory allocation

```yaml
# In docker-compose.dgx.yml
deploy:
  resources:
    limits:
      memory: 12G # Reduce from 20G
```

### Issue: Models not loading

**Solution:** Check model downloads completed

```bash
docker compose -f docker-compose.dgx.yml logs liveportrait | grep "models loaded"
```

### Issue: Slow performance

**Solution:** Ensure GPU is being used

```bash
docker exec secretary-liveportrait python3 -c "import torch; print(torch.cuda.is_available())"
```

---

## 📦 Volume Management

Persistent volumes store downloaded models:

```bash
# List volumes
docker volume ls | grep secretary

# Inspect volume
docker volume inspect docker_liveportrait-models

# Remove volumes (will re-download models)
docker compose -f docker-compose.dgx.yml down -v
```

---

## 🔄 Updates

### Rebuild containers

```bash
# Rebuild specific service
docker compose -f docker-compose.dgx.yml build liveportrait

# Rebuild all
docker compose -f docker-compose.dgx.yml build --no-cache
```

### Update models

```bash
# Remove model volumes and rebuild
docker compose -f docker-compose.dgx.yml down
docker volume rm docker_liveportrait-models docker_xtts-models docker_whisper-models
docker compose -f docker-compose.dgx.yml up --build
```

---

## 📚 Resources

- [NVIDIA Docker Documentation](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/)
- [LivePortrait GitHub](https://github.com/KwaiVGI/LivePortrait)
- [Coqui TTS Documentation](https://docs.coqui.ai/)
- [faster-whisper GitHub](https://github.com/guillaumekln/faster-whisper)

---

## 🔐 Security Notes

- Services run on `localhost` by default (not exposed externally)
- No authentication configured (add nginx reverse proxy for production)
- GPU access limited to container processes
- Shared memory isolated per container

---

**For Sprint 04 progress, see:** [docs-secretary/sprints/SPRINT_04.md](../docs-secretary/sprints/SPRINT_04.md)
