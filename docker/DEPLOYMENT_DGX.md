# DGX Spark Deployment Guide

Quick guide to deploy and test the Avatar System on DGX Spark (192.168.178.10).

---

## Prerequisites

```bash
# 1. SSH access to DGX Spark
ssh admin@192.168.178.10

# 2. Verify Docker + NVIDIA runtime
docker run --rm --gpus all nvidia/cuda:13.0.0-base-ubuntu24.04 nvidia-smi

# 3. Verify CUDA 13.0
nvcc --version  # Should show CUDA 13.0
```

---

## Option 1: Quick Test (Avatar Services Only)

Deploy only the GPU avatar services to test WebRTC streaming.

### Step 1: Copy Docker files to DGX Spark

From your local machine:

```bash
# Copy docker-compose.dgx.yml and all Dockerfiles
scp -r docker/ admin@192.168.178.10:~/secretary-avatar/

# Or use rsync for faster sync
rsync -avz --progress docker/ admin@192.168.178.10:~/secretary-avatar/
```

### Step 2: SSH to DGX Spark and start services

```bash
ssh admin@192.168.178.10
cd ~/secretary-avatar

# Start avatar services (GPU required)
docker compose -f docker-compose.dgx.yml --profile avatar up -d

# Monitor logs
docker compose -f docker-compose.dgx.yml logs -f liveportrait
docker compose -f docker-compose.dgx.yml logs -f xtts
docker compose -f docker-compose.dgx.yml logs -f whisper

# Check GPU usage
watch -n 1 nvidia-smi
```

### Step 3: Verify services are running

```bash
# Check health endpoints
curl http://192.168.178.10:8081/health  # LivePortrait
curl http://192.168.178.10:8082/health  # XTTS
curl http://192.168.178.10:8083/health  # Whisper
curl http://192.168.178.10:8080/health  # WebRTC Signaling (if implemented)
```

### Step 4: Start UI dev server locally

On your local machine:

```bash
cd ui/avatar-chat

# Install dependencies (first time only)
npm install

# Start dev server (uses .env.development with DGX IP)
npm run dev

# Open in browser
open http://localhost:3000
```

**Expected behavior:**

- UI loads at http://localhost:3000
- Click "Connect" → WebSocket connects to DGX Spark (192.168.178.10:8080)
- Avatar video streams from DGX Spark
- Voice controls work (mic → DGX Spark → avatar response)

---

## Option 2: Full Stack Deployment

Deploy everything (backend + avatar services + UI).

### Step 1: Copy entire Secretary codebase

```bash
# From local machine
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude 'services/voice-pipeline/models' \
  ~/projects/secretary/openclaw-source/ \
  admin@192.168.178.10:~/secretary/
```

### Step 2: Build and deploy on DGX Spark

```bash
ssh admin@192.168.178.10
cd ~/secretary

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start Docker services (avatar + backend)
cd docker/
docker compose -f docker-compose.dgx.yml --profile avatar up -d

# Start Gateway (Secretary backend)
cd ..
npm run gateway
```

### Step 3: Deploy UI as static site (Nginx)

```bash
# Build UI for production
cd ui/avatar-chat
npm install
npm run build

# Copy dist/ to Nginx web root
sudo cp -r dist/* /var/www/html/avatar-chat/

# Or serve with Docker
docker run -d \
  -p 3000:80 \
  -v $(pwd)/dist:/usr/share/nginx/html \
  nginx:alpine
```

**Access:** http://192.168.178.10:3000

---

## Troubleshooting

### Issue: Services not starting

```bash
# Check Docker logs
docker compose -f docker-compose.dgx.yml logs

# Check GPU availability
nvidia-smi

# Check port conflicts
netstat -tulpn | grep -E '8080|8081|8082|8083|3000|3001'
```

### Issue: Out of VRAM

```bash
# Check memory usage
nvidia-smi

# Stop GPU services
docker compose -f docker-compose.dgx.yml --profile avatar down

# Start one service at a time
docker compose -f docker-compose.dgx.yml up liveportrait -d
docker compose -f docker-compose.dgx.yml up xtts -d
docker compose -f docker-compose.dgx.yml up whisper -d
```

### Issue: WebRTC connection fails

**Check 1: WebSocket connection**

```bash
# From browser console (F12)
# Should see: WebSocket connected to ws://192.168.178.10:8080
```

**Check 2: Firewall**

```bash
# On DGX Spark, open ports
sudo ufw allow 8080/tcp  # WebRTC signaling
sudo ufw allow 8081/tcp  # LivePortrait
sudo ufw allow 8082/tcp  # XTTS
sudo ufw allow 8083/tcp  # Whisper
sudo ufw allow 3000/tcp  # UI (if serving from DGX)
sudo ufw allow 3001/tcp  # Gateway API
```

**Check 3: CORS issues**

```bash
# If browser shows CORS errors, add to WebRTC signaling server:
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, POST, OPTIONS
```

### Issue: Models not downloading

```bash
# Check volume mounts
docker volume ls | grep secretary

# Manually download models
docker exec -it secretary-liveportrait bash
cd /models
# Download LivePortrait models here

docker exec -it secretary-xtts bash
cd /models
# Download XTTS models here
```

---

## Performance Monitoring

```bash
# GPU utilization
watch -n 1 nvidia-smi

# Docker stats
docker stats

# Network traffic
iftop -i eth0

# System resources
htop
```

---

## Stopping Services

```bash
# Stop avatar services only (frees 14GB VRAM)
docker compose -f docker-compose.dgx.yml --profile avatar down

# Stop all services
docker compose -f docker-compose.dgx.yml down

# Remove volumes (models will be re-downloaded)
docker compose -f docker-compose.dgx.yml down -v
```

---

## Quick Reference

**DGX Spark:** 192.168.178.10

**Ports:**

- 3000: Avatar Chat UI
- 3001: Gateway API
- 8080: WebRTC Signaling
- 8081: LivePortrait API
- 8082: XTTS API
- 8083: Whisper API

**GPU Budget:**

- LivePortrait: 8GB VRAM
- XTTS: 4GB VRAM
- Whisper: 2GB VRAM
- **Total:** 14GB VRAM (105GB free on 128GB system)

**Useful Commands:**

```bash
# Health checks
for port in 8080 8081 8082 8083; do curl -f http://192.168.178.10:$port/health && echo " ✅ Port $port OK" || echo " ❌ Port $port FAILED"; done

# GPU memory
nvidia-smi --query-gpu=memory.used,memory.free --format=csv

# Restart services
docker compose -f docker-compose.dgx.yml --profile avatar restart
```

---

**For detailed troubleshooting, see:** [docker/README.md](./README.md)
