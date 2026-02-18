# Setup A - Deployment Status

**Date:** 2026-02-17
**Status:** ✅ FULLY DEPLOYED (STT + TTS Working)

---

## 🟢 Working Services

### 1. XTTS v2 (Coqui TTS) - Port 8082

**Status:** ✅ WORKING (GPU/CUDA, 17 languages)

**Features:**

- 17 languages (EN, DE, FR, ES, IT, PT, PL, NL, CS, AR, TR, RU, HU, KO, JA, ZH-CN, HI)
- Voice cloning support (reference speaker audio)
- Default speaker (espeak-ng generated)
- Two endpoints: standard synthesis + voice clone

**Performance:**

- Model: `tts_models/multilingual/multi-dataset/xtts_v2` (~1.8GB)
- Device: **CUDA** (torch 2.10.0+cu130 — GB10/sm_121 supported!)
- Synthesis time: **0.5-0.7s** (GPU accelerated)
- Audio output: **1-3s** per sentence (natural speech, capped at 240 tokens ≈ 10s)
- GPU note: Pre-install `torch==2.10.0+cu130` before TTS → TTS finds it satisfied → no CPU downgrade

**API Endpoints:**

```bash
# Health check
curl http://localhost:8082/health

# Synthesize English
curl -X POST http://localhost:8082/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","language":"en"}' \
  -o output.wav

# Synthesize German
curl -X POST http://localhost:8082/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Hallo Welt","language":"de"}' \
  -o output.wav

# Voice clone (upload reference audio)
curl -X POST http://localhost:8082/synthesize-with-voice-clone \
  -F "text=Hello world" \
  -F "language=en" \
  -F "speaker_audio=@reference.wav" \
  -o output.wav
```

**Dependency Fixes Applied (8 patches for modern packages):**

1. Rust via rustup (1.82+ for sudachipy/indexmap)
2. `torch==2.10.0+cu130` pre-installed BEFORE TTS (prevents CPU fallback)
3. transformers pinned to `>=4.33.0,<4.43.0` (4.42.4 confirmed working) — versions 4.43+ change attention mask behavior for models where `pad_token_id==eos_token_id`, which is the case for XTTS's internal GPT decoder; this causes the GPT to attend to wrong positions, generating wrong phoneme tokens, and producing 100% unintelligible audio
4. torch.load weights_only=False patch (PyTorch 2.6+ default changed)
5. soundfile patch (torchaudio 2.9+ requires torchcodec, not available on ARM64)
6. numpy upgrade to 1.24.4 (TTS pins 1.22.0 but base container needs 1.24+)

**Speech Generation Parameters (official XTTS defaults):**

- `temperature=0.75, repetition_penalty=10.0, top_k=50, top_p=0.85` (official XTTS defaults)
- `gpt.max_gen_mel_tokens=240` → safety cap at ~10s (prevents runaway generation)
- Speaker: built-in `"Claribel Dervla"` (no reference audio / espeak-ng needed)
- Results: 1-3s audio per sentence, 0.5-0.7s synthesis time ✅

---

### 2. Whisper Large V3 (STT) - Port 8083

**Status:** ✅ PRODUCTION READY (GPU/CUDA)

**Features:**

- 97 languages support (including DE, EN, FR, ES, IT, PT, PL, NL, RU, ZH, JA, KO)
- Full multilingual model — correct German transcription confirmed with real microphone audio
- Automatic language detection
- Translation to English
- Timestamps support
- Optimized for DGX Spark (ARM64)

**Performance:**

- Model: `openai/whisper-large-v3` (~3GB, float16)
- Device: **CUDA** (torch 2.10.0+cu130, dtype: float16)
- Inference: ~0.5-1s per short clip on GPU
- First startup: ~30-60 seconds (model load from cache)

**Why Whisper Large V3 instead of Distil-Whisper:**
Distil-Whisper was tested and found to output English phonetic matches for German speech
instead of transcribing German. Example:

- User says: "Hallo, wie wird denn das Wetter morgen?"
- Distil-Whisper: "Hello, how will then the weather morning?" (English, wrong)
- Whisper Large V3: "Hallo, wie wird denn das Wetter morgen?" (German, correct ✓)
  Root cause: Distil-Whisper is primarily English-optimized; its multilingual quality is
  insufficient for production German STT.

**Dependency Fixes Applied:**

1. `torch==2.10.0+cu130` pre-installed BEFORE requirements (prevents CPU fallback)
2. transformers pinned to `<5.0.0` (5.x changed Whisper pipeline API)
3. `TORCH_DTYPE = torch.float16` (works correctly on GB10/sm_121 for this model)
4. `max_new_tokens=444` (max_target_positions=448 minus 4 special tokens)
5. FastAPI `Form()` fix for multipart endpoints (language/task params now correctly parsed)

**API Endpoints:**

```bash
# Health check
curl http://localhost:8083/health

# Transcribe audio (German)
curl -X POST http://localhost:8083/transcribe \
  -F "file=@audio.wav" \
  -F "language=de"

# Transcribe with auto-detection
curl -X POST http://localhost:8083/transcribe \
  -F "file=@audio.wav"

# Translate to English
curl -X POST http://localhost:8083/transcribe \
  -F "file=@audio.wav" \
  -F "task=translate"
```

---

### 3. LivePortrait (Avatar Rendering) - Port 8081

**Status:** ✅ WORKING (GPU/CUDA for rendering, ONNX CPU for face detection)

**Features:**

- Single-frame avatar rendering from static portrait image
- Expression control: neutral, happy, sad, surprised
- Intensity multiplier for expression strength
- Source image caching for repeated renders

**Performance:**

- Models: ~500MB PyTorch (.pth) on GPU + InsightFace ONNX (~300MB) on CPU
- Device: **CUDA** (PyTorch pipeline) + **CPU** (ONNX face detection — no ARM64 GPU onnxruntime wheels)
- Render time: **~80ms/frame** after warmup (first frame ~12s due to torch compilation)
- Target FPS: 10fps (100ms interval, safe margin for 80ms render)

**API Endpoints:**

```bash
# Health check
curl http://localhost:8081/health

# Render frame with expression
curl -X POST http://localhost:8081/api/render \
  -F "source_image=@avatar.png" \
  -F "expression=happy" \
  -F "intensity=1.0" \
  -o frame.jpg

# List available expressions
curl http://localhost:8081/expressions
```

**Docker:**

- Container: `secretary-liveportrait`
- Profile: `avatar`
- Models cached in Docker volume (`liveportrait-models`)
- First startup downloads ~800MB from HuggingFace (KlingTeam/LivePortrait)

---

### 4. NVIDIA Canary-1b with NeMo (STT) - Port 8084

**Status:** 🧪 EXPERIMENTAL (NeMo Toolkit v2.0.0rc1)

**Features:**

- 25 languages (DE, BG, HR, CS, DA, NL, EN, ET, FI, FR, EL, HU, IT, LV, LT, MT, PL, PT, RO, SK, SL, ES, SV, RU, UK)
- Translation: EN ↔ DE/FR/ES
- Automatic punctuation and capitalization
- Auto-language detection
- NeMo optimized inference

**Performance:**

- Model: `nvidia/canary-1b` (via NeMo toolkit)
- Device: CPU (GB10 GPU not yet supported)
- First startup: ~60-120 seconds (NeMo model loading)
- Subsequent startups: ~30 seconds

**API Endpoints:**

```bash
# Health check
curl http://localhost:8084/health

# Transcribe German
curl -X POST http://localhost:8084/transcribe \
  -F "file=@audio.wav" \
  -F "language=de" \
  -F "task=transcribe"

# Translate German to English
curl -X POST http://localhost:8084/transcribe \
  -F "file=@audio.wav" \
  -F "language=de" \
  -F "task=translate" \
  -F "target_language=en"
```

---

## ❌ Abandoned: Parler-TTS

**Status:** ❌ ABANDONED - Fundamental incompatibility

**Root Cause:**

- `descript-audio-codec` / `descript-audio-codec-unofficial` (parler-tts deps)
  overwrite the custom torch 2.2.0a0+81ea7a4 with torch 2.10.0
- On ARM64 with pytorch:24.01-py3 base, parler-tts cannot run without breaking the
  pre-installed custom torch build
- XTTS v2 chosen as replacement (similar quality, voice cloning support)

---

## 📊 Service Summary & Port Reference

| Service              | Port | Status          | Device         | Language               |
| -------------------- | ---- | --------------- | -------------- | ---------------------- |
| **LivePortrait**     | 8081 | ✅ Working      | **GPU + CPU**  | Rendering              |
| **XTTS v2**          | 8082 | ✅ Working      | **GPU (CUDA)** | 17 langs               |
| **Whisper Large V3** | 8083 | ✅ Production   | **GPU (CUDA)** | 97 langs               |
| **Canary-NeMo**      | 8084 | 🧪 Experimental | CPU            | 25 langs               |
| **Test UI**          | 8085 | ✅ Working      | Flask          | Manual testing         |
| **WebRTC Signaling** | 8086 | ✅ Working      | TypeScript     | Streaming coordination |

**⚠️ CRITICAL PORT NOTES:**

- WebRTC signaling runs on **port 8086** (NOT 8081) to avoid conflict with LivePortrait
- See `docs/avatar/` for complete system architecture, orchestrator coordination, and integration details

---

## 🐳 Docker Deployment

### Start Services

```bash
cd docker/

# Start TTS + STT (production)
docker compose -f docker-compose.dgx.yml --profile avatar up -d

# Start experimental STT
docker compose -f docker-compose.dgx.yml --profile avatar-experimental up -d canary-nemo

# Start all
docker compose -f docker-compose.dgx.yml --profile avatar --profile avatar-experimental up -d
```

### Check Status

```bash
# Health checks
curl http://localhost:8082/health  # XTTS
curl http://localhost:8083/health  # Whisper Large V3
curl http://localhost:8084/health  # Canary-NeMo

# View logs
docker logs secretary-xtts
docker logs secretary-distil-whisper
docker logs secretary-canary-nemo
```

---

## 🧪 Manual Voice Test UI

A browser-based test UI for end-to-end voice testing (STT → text → TTS).

**Location:** `/home/admin/projects/secretary/stt_tts_test/`

- `server.py` — Flask proxy server (avoids CORS, converts WebM audio)
- `index.html` — Browser UI with microphone capture

**Start:**

```bash
nohup python3 /home/admin/projects/secretary/stt_tts_test/server.py \
  > /tmp/stt_tts_server.log 2>&1 &
```

**Access:** `https://192.168.178.10:8085`
(HTTPS required — browser blocks microphone on plain HTTP for non-localhost IPs)

**Features:**

- Full flow: Mic → STT → transcription → TTS → playback (one click)
- STT only: Mic recording → Whisper transcription
- TTS only: Text input → Sofia Hellen speech
- Live microphone level meter
- Service status badges (STT/TTS health)

**Browser warning:** Self-signed cert — accept in browser (Chrome: type `thisisunsafe`)

**Tested (2026-02-17):**

- German speech → Whisper Large V3 → correct German text ✓
- German text → XTTS Sofia Hellen → natural audio ✓
- Full flow end-to-end ✓

### Stop Services

```bash
docker compose -f docker-compose.dgx.yml down
```

---

## 🎯 Future Work

### High Priority

1. ~~**GPU Support for XTTS**~~ ✅ **DONE** — torch 2.10.0+cu130 pre-installed, synthesis 1.3-2.6s on GB10
2. ~~**GPU Support for Distil-Whisper**~~ ✅ **DONE** — same cu130 approach, inference ~0.2s on GB10
3. ~~**Fix XTTS unintelligible/slow speech**~~ ✅ **DONE** — pinned transformers to `<4.43.0`; using official XTTS defaults (temperature=0.75, etc.), synthesis 0.5-0.7s, audio 1-3s
4. **Test with real microphone audio** — XTTS audio causes Whisper hallucinations; validate STT with real speech

### Low Priority

1. **GPU Support for Canary-NeMo:** Wait for NeMo with GB10/sm_121 support
2. **Model Caching:** Pre-download models at build time for faster cold starts
3. **Optimization:** Quantization, batching

---

## 📝 Key Technical Learnings

### DGX Spark (ARM64) Dependency Hell - Root Causes

1. **Custom torch version:** Base container has `torch 2.2.0a0+81ea7a4` (pre-release)
   - pip treats pre-release local versions as NOT satisfying `torch>=2.x`
   - Any package requiring torch pulls in a NEW torch from PyPI
   - PyPI torch for ARM64 is CPU-only (`+cpu` build)

2. **Package version conflicts (2024→2026 API changes):**
   - `transformers 4.43+` changed attention mask behavior for models where `pad_token_id==eos_token_id` → breaks XTTS (see section below)
   - `torch.load` default changed to `weights_only=True` in PyTorch 2.6+
   - `torchaudio 2.9+` requires `torchcodec` (not available on ARM64)
   - `numpy 1.24+` ABI incompatibility with numpy 1.22.0

3. **Rust requirement:** `sudachipy 0.6.10` (Japanese NLP, TTS dep) needs Rust 1.82+
   - apt `rustc` is only 1.75 on Ubuntu 22.04
   - Solution: use rustup to install latest stable Rust

### Parler-TTS vs XTTS

- **Parler-TTS**: Newer, simpler prompt-based API, but deps update torch → CPU-only
- **XTTS v2**: Voice cloning, 17 languages, works with patches, older but stable

### FastAPI Multipart Form Fields

- **Problem:** Text fields sent as multipart form data (`-F "language=de"`) are silently ignored if declared as plain `Optional[str] = None` in a FastAPI endpoint that also receives `File(...)`
- **Root cause:** FastAPI only reads multipart form fields when declared with `Form()`
- **Fix:** Use `Form(None)` and import `Form` from fastapi:
  ```python
  from fastapi import FastAPI, UploadFile, File, Form
  language: Optional[str] = Form(None)
  ```

### transformers Cache Format Incompatibility

- A model cached by transformers 5.x cannot be loaded by transformers 4.x
- Symptom: `'list' object has no attribute 'keys'` on pipeline load
- Fix: Delete the cached model directory and let it re-download with the correct version
  ```bash
  docker run --rm -v <volume>:/models alpine sh -c "rm -rf /models/<model-name>"
  ```

### XTTS Root Cause: transformers Attention Mask Change (4.43+)

- **Root cause of unintelligible audio:** `transformers >= 4.43.0` changed attention mask behavior for models where `pad_token_id == eos_token_id`. XTTS uses exactly this configuration in its internal GPT decoder.
- **Effect:** With transformers 4.43+, the GPT attends to wrong token positions → generates wrong phoneme tokens → produces 100% unintelligible audio. Identical behavior on CPU and GPU (not a hardware/precision issue).
- **Fix:** Pin transformers to `>=4.33.0,<4.43.0` (4.42.4 confirmed working).
- **Before fix:** Audio 9-25s, completely unintelligible regardless of parameters tuned.
- **After fix:** Audio 1-3s (natural length), clear speech, 0.5-0.7s synthesis on GPU.

**Parameters that were tried before finding the root cause (do NOT use):**

- `temperature=0.1, repetition_penalty=15.0` — caused degraded quality; not the right fix
- `do_sample=False` — produces fixed-length output regardless of text content
- espeak-ng as speaker reference — out-of-distribution for voice cloning, bad quality

**Correct parameters (official XTTS defaults, with <4.43.0):**

- `temperature=0.75, repetition_penalty=10.0, top_k=50, top_p=0.85`
- `model.gpt.max_gen_mel_tokens=240` — safety cap at ~10s
- Built-in speaker `"Claribel Dervla"` (no reference audio needed)
- Result: 1-3s audio per sentence, 0.5-0.7s synthesis time on GPU

### XTTS Synthetic Audio vs. Whisper STT

- Distil-Whisper hallucinations when transcribing XTTS-generated audio are NOT a GPU/precision problem
- Confirmed: CPU and GPU produce identical hallucinated output with XTTS audio
- Confirmed: Distil-Whisper works correctly with espeak-ng audio (~0.2s, accurate result)
- XTTS synthetic speech has spectral characteristics that confuse Whisper's encoder

---

**Last Updated:** 2026-02-17 (Session 4 — STT upgraded to Whisper Large V3; German transcription confirmed working with real microphone audio via browser WebM)
**Services Tested:** XTTS (GPU, DE synthesis, Sofia Hellen, split_sentences=False), Whisper Large V3 (GPU, German microphone audio ✓), Canary-NeMo (buggy, experimental)
