# LivePortrait Avatar Rendering Service

LivePortrait is the core avatar rendering engine for the Secretary Assistant. It transforms a static portrait image into an animated avatar capable of expressing emotions in real-time.

## Service Details

- **Port:** 8081
- **Container:** `secretary-liveportrait`
- **Profile:** `avatar` (Docker Compose)
- **Technology:** Python + PyTorch + LivePortrait (KlingTeam)

## Features

### Avatar Animation

- Single static image as source
- Face landmark detection via InsightFace (ONNX, CPU)
- PyTorch rendering pipeline (GPU-accelerated)
- ~80ms per frame rendering time (after warmup)

### Emotion/Expression Control

Four built-in expressions:

- **neutral** — Default, calm demeanor
- **happy** — Smiling, friendly
- **sad** — Concerned, empathetic
- **surprised** — Alert, engaged

Expression intensity can be controlled via a `0.0-1.0` multiplier.

## Performance

| Metric             | Value  | Notes                                         |
| ------------------ | ------ | --------------------------------------------- |
| **Render latency** | ~80ms  | Per frame, GPU (CUDA)                         |
| **First frame**    | ~12s   | Torch model compilation, cached after         |
| **Target FPS**     | 10fps  | 100ms intervals (safe margin for 80ms render) |
| **Model size**     | ~500MB | PyTorch .pth files                            |
| **Face detection** | ~300MB | InsightFace ONNX (CPU, no ARM64 GPU wheels)   |

## API Endpoints

### Health Check

```bash
curl http://localhost:8081/health
```

Response:

```json
{ "status": "ok" }
```

### Render Avatar Frame

```bash
curl -X POST http://localhost:8081/api/render \
  -F "source_image=@portrait.jpg" \
  -F "expression=happy" \
  -F "intensity=1.0" \
  -o output.jpg
```

**Parameters:**

- `source_image` (file) — Portrait image (JPEG/PNG)
- `expression` (string) — One of: `neutral`, `happy`, `sad`, `surprised`
- `intensity` (float, optional) — Expression strength 0.0-1.0 (default: 1.0)

**Response:** Binary JPEG image

### List Available Expressions

```bash
curl http://localhost:8081/expressions
```

Response:

```json
{
  "expressions": ["neutral", "happy", "sad", "surprised"],
  "intensities": { "min": 0.0, "max": 1.0 }
}
```

## Docker Deployment

### Start Service

```bash
cd /home/admin/projects/secretary/openclaw-source/docker/
docker compose -f docker-compose.dgx.yml --profile avatar up -d secretary-liveportrait
```

### Check Logs

```bash
docker logs secretary-liveportrait -f
```

### Stop Service

```bash
docker compose -f docker-compose.dgx.yml down
```

## Docker Volume

Models are cached in a Docker volume:

- **Volume name:** `liveportrait-models`
- **Mounted as:** `/app/models` in container
- **Contents:** ~800MB of pre-downloaded LivePortrait models from HuggingFace (KlingTeam/LivePortrait)

First startup will download models from HuggingFace (~3-5 minutes). Subsequent startups use the cache.

## Technical Implementation

### Architecture

```
Input Image (source_image)
    ↓
InsightFace ONNX (CPU)
    ↓ Face landmarks
LivePortrait PyTorch (GPU)
    ↓ Rendering pipeline
Output Frame (JPEG)
```

### GPU Support

- **PyTorch models:** GPU-accelerated via CUDA (`torch==2.10.0+cu130`)
- **InsightFace face detection:** CPU-only (no ARM64 GPU ONNX wheels available)
- **Device:** DGX Spark ARM64 (GB10/sm_121 supported via torch 2.10.0+cu130)

### Dockerfile

Located at `docker/liveportrait/Dockerfile.arm64`:

Key points:

1. **PyTorch pre-install:** `torch==2.10.0+cu130` before LivePortrait (prevents CPU fallback)
2. **Base image:** `nvcr.io/nvidia/pytorch:24.01-py3` (NGC container with CUDA 13.0)
3. **Model caching:** Volume mount at `/app/models`
4. **First-run warmup:** Service auto-warms up on startup

## Known Issues & Workarounds

### Issue 1: Cold Start Latency (~12 seconds)

**Symptom:** First render request takes ~12 seconds.

**Cause:** PyTorch model compilation and CUDA kernel loading on first GPU use.

**Workaround:** Service automatically warms up on startup. If manual warmup needed:

```bash
# Send a dummy render request after container starts
curl -X POST http://localhost:8081/api/render \
  -F "source_image=@dummy.jpg" \
  -F "expression=neutral" \
  -o /dev/null
```

### Issue 2: Face Detection Failures

**Symptom:** Render fails with "No face detected" error.

**Cause:** InsightFace ONNX cannot reliably detect faces in non-standard images (cartoon, very small, very low quality).

**Solution:** Use clear portrait photos with face centered and well-lit.

## Integration with Orchestrator

The TypeScript Orchestrator (`src/avatar/orchestrator.ts`) handles:

1. **Emotion Sequencing:** Maps LLM-generated emotions to LivePortrait expressions
2. **Frame Caching:** Caches rendered frames to avoid re-rendering identical expressions
3. **Error Handling:** Falls back to `neutral` expression on render failures
4. **WebRTC Streaming:** Pushes rendered frames to MediaBridge for browser playback

Example orchestrator usage:

```typescript
const renderer = new LivePortraitRenderer("http://localhost:8081");
const frame = await renderer.render({
  sourceImage: portraitBuffer,
  expression: "happy",
  intensity: 0.8,
});
// Frame is binary JPEG, ready for WebRTC streaming
```

## Performance Optimization

### Caching Strategy

- **Source image caching:** Once uploaded, portrait is cached in memory to avoid re-upload
- **Expression caching:** Rendered frames are cached by (image_hash, expression, intensity)
- **Warm-up:** Service pre-warms on startup with a dummy render

### Throughput

At 10fps target (100ms intervals):

- Rendering: 80ms ✅
- Orchestrator overhead: ~10-15ms
- **Total: ~90-95ms** ← Safe margin before next frame due

## Next Steps

- **Hyperrealistic Path:** Plan transition from stylized (LivePortrait) to hyperrealistic avatars (Sprint 05-06)
- **Multiple Source Images:** Support avatar switching via Character Manager
- **Lip-Sync Coordination:** Sync avatar mouth movement with XTTS audio (future enhancement)

## Related Documentation

- [Avatar System Overview](./README.md) — Full pipeline architecture
- [Service Status](../docker/SETUP_A_STATUS.md) — Deployment & technical learnings
- [Orchestrator](./orchestrator.md) — Pipeline coordination (TypeScript)
