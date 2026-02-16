# Local Testing with DGX Spark Backend

Quick guide to test Avatar Chat UI locally with DGX Spark (192.168.178.10) running the backend services.

---

## Setup (One-time)

### 1. Deploy Docker services to DGX Spark

```bash
# Copy Docker files to DGX Spark
scp -r docker/ admin@192.168.178.10:~/secretary-avatar/

# SSH to DGX Spark
ssh admin@192.168.178.10

# Build and start services
cd ~/secretary-avatar
docker compose -f docker-compose.dgx.yml --profile avatar up --build -d

# Verify services are healthy
curl http://localhost:8081/health  # LivePortrait
curl http://localhost:8082/health  # XTTS
curl http://localhost:8083/health  # Whisper
curl http://localhost:8080/health  # WebRTC signaling
```

### 2. Check firewall on DGX Spark

```bash
# Still on DGX Spark SSH session
sudo ufw allow 8080/tcp  # WebRTC
sudo ufw allow 8081/tcp  # LivePortrait
sudo ufw allow 8082/tcp  # XTTS
sudo ufw allow 8083/tcp  # Whisper
sudo ufw allow 3001/tcp  # Gateway API (if running)

# Verify firewall status
sudo ufw status
```

---

## Testing (Every time)

### 1. Start UI dev server locally

```bash
# On your local machine
cd /home/admin/projects/secretary/openclaw-source/ui/avatar-chat

# Install dependencies (first time only)
npm install

# Start dev server (uses .env.development with DGX IP)
npm run dev
```

**Output:**

```
VITE v5.3.1  ready in 234 ms

➜  Local:   http://localhost:3000/
➜  Network: http://192.168.178.x:3000/
```

### 2. Open browser

```bash
# Open UI
open http://localhost:3000

# Or manually navigate to:
http://localhost:3000
```

### 3. Test Avatar Chat

1. **UI loads** → Should see "Secretary Avatar Chat" with gradient header
2. **Status:** "Disconnected" (gray dot)
3. **Character Selector:** Shows "Alex" by default
4. **Video area:** Shows "Click Connect to start"
5. **Click "Connect" button** →
   - Status changes to "Connecting..." (yellow pulsing dot)
   - Console (F12) shows: `WebSocket connected to ws://192.168.178.10:8080`
   - Video area shows loading spinner
   - Status changes to "Connected" (green dot)
   - Avatar video streams in video area
6. **Click "Start Recording"** →
   - Button turns red with pulsing animation
   - Audio level meter appears
   - Speak into mic → meter shows audio levels
7. **Click "Stop Recording"** →
   - Recording stops
   - Avatar should respond with voice (if backend configured)
8. **Character Selector** →
   - Click dropdown → Shows Alex, Emma, James
   - Select different character → Avatar switches (if backend supports)
9. **Click "Disconnect"** →
   - Video stops
   - Status returns to "Disconnected"

---

## Debugging

### Check browser console (F12)

**Expected logs:**

```
WebSocket connected
Peer connection established
Received remote stream
```

**Common errors:**

**1. `WebSocket connection failed`**

- Check DGX Spark is reachable: `ping 192.168.178.10`
- Check port 8080 is open on DGX Spark: `telnet 192.168.178.10 8080`
- Check WebRTC signaling service is running on DGX Spark

**2. `Failed to connect: NotAllowedError`**

- Browser blocked microphone access
- Click address bar icon → Allow microphone

**3. `CORS error`**

- WebRTC signaling server needs CORS headers
- Add to signaling server:
  ```javascript
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, OPTIONS
  ```

### Check DGX Spark services

```bash
# SSH to DGX Spark
ssh admin@192.168.178.10

# Check Docker containers
docker ps

# Check logs
docker compose -f ~/secretary-avatar/docker-compose.dgx.yml logs -f

# Check GPU usage
nvidia-smi

# Test health endpoints from DGX Spark
curl http://localhost:8081/health
curl http://localhost:8082/health
curl http://localhost:8083/health
curl http://localhost:8080/health
```

### Network debugging

```bash
# From local machine, test DGX Spark connectivity
ping 192.168.178.10

# Test WebSocket (use wscat)
npm install -g wscat
wscat -c ws://192.168.178.10:8080

# Test HTTP endpoints
curl http://192.168.178.10:8081/health
curl http://192.168.178.10:8082/health
curl http://192.168.178.10:8083/health
```

---

## Performance Testing

### Measure latency

Open browser console (F12) and paste:

```javascript
// Measure WebRTC video latency
const video = document.querySelector("video");
const latency = video.currentTime - performance.now() / 1000;
console.log("Video latency:", latency * 1000, "ms");

// Monitor audio levels
setInterval(() => {
  const audioLevel = document.querySelector('[style*="width"]');
  if (audioLevel) {
    console.log("Audio level:", audioLevel.style.width);
  }
}, 100);
```

**Target latency:** <200ms for WebRTC video

### Monitor GPU on DGX Spark

```bash
ssh admin@192.168.178.10
watch -n 1 nvidia-smi
```

**Expected VRAM usage:**

- LivePortrait: ~8GB
- XTTS: ~4GB
- Whisper: ~2GB
- **Total:** ~14GB

---

## Environment Variables

**File:** `ui/avatar-chat/.env.development`

```bash
VITE_WEBRTC_URL=ws://192.168.178.10:8080
VITE_API_URL=http://192.168.178.10:3001
VITE_LIVEPORTRAIT_URL=http://192.168.178.10:8081
VITE_XTTS_URL=http://192.168.178.10:8082
VITE_WHISPER_URL=http://192.168.178.10:8083
```

**To change backend IP:**

```bash
# Edit .env.development
nano .env.development

# Restart Vite dev server
npm run dev
```

---

## Known Issues

### Issue: Video not showing

**Possible causes:**

1. WebRTC signaling server not implemented yet → Phase 3 work
2. Peer connection failed → Check browser console
3. No remote stream → Backend not sending video

**Workaround:**

- For now, UI shows connection states correctly
- Actual video streaming requires backend implementation (Phase 3)

### Issue: No audio response

**Possible causes:**

1. XTTS not synthesizing voice
2. Audio routing not configured
3. Backend pipeline incomplete

**Note:** Full voice pipeline requires Phase 3 (Multi-Channel Integration)

---

## Next Steps

**Current status:** UI ✅ complete, Backend 🔄 pending

**To fully test:**

1. Implement WebRTC signaling server (Phase 3)
2. Connect LivePortrait → XTTS → Whisper pipeline
3. Route audio through WebRTC peer connection
4. Test end-to-end voice interaction

**Quick win:** Deploy now to see UI + connection logic working!

---

**For DGX deployment, see:** [docker/DEPLOYMENT_DGX.md](../../docker/DEPLOYMENT_DGX.md)
