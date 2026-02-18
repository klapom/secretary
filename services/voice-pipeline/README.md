# Voice Pipeline Service

XTTS + Whisper voice pipeline with GPU acceleration for Secretary

## Features

### ✅ Implemented

- **Whisper STT**: Speech-to-text with faster-whisper
- **Multi-language support**: EN, DE, FR, ES, IT, PT, NL, PL, RU, JA, ZH
- **GPU acceleration**: Auto-detects CUDA (currently CPU fallback)
- **Voice Activity Detection**: Automatic silence removal
- **FastAPI server**: RESTful API for integration

### 🚧 In Progress

- **XTTS TTS**: Text-to-speech synthesis
- **Voice cloning**: Clone voices from reference audio
- **GPU optimization**: PyTorch CUDA support for ARM64

## Installation

```bash
cd services/voice-pipeline

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Usage

### Start the service

```bash
source venv/bin/activate
python voice_service.py
```

The service runs on `http://localhost:8765`

### API Endpoints

#### Health Check

```bash
curl http://localhost:8765/health
```

#### Transcribe Audio (STT)

```bash
curl -X POST http://localhost:8765/stt/transcribe \
  -F "file=@audio.mp3" \
  -F "language=en" \
  -F "include_segments=true"
```

Response:

```json
{
  "text": "Hello, this is a test transcription.",
  "language": "en",
  "confidence": 0.95,
  "duration": 1.23,
  "segments": [...]
}
```

#### Synthesize Speech (TTS) - Coming Soon

```bash
curl -X POST http://localhost:8765/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "language": "en",
    "voice_id": "default"
  }'
```

## Integration with Secretary

### TypeScript Client

See `src/services/voice-client.ts` for integration examples.

```typescript
import { VoiceClient } from "./services/voice-client";

const client = new VoiceClient("http://localhost:8765");

// Transcribe audio
const result = await client.transcribe(audioBuffer, "en");
console.log(result.text);

// Synthesize speech (when available)
const audio = await client.synthesize("Hello world", "en");
```

## Performance

### Target Metrics

- **Whisper (base model)**: <1s for 5-second audio
- **XTTS**: <500ms for 5-second audio (when implemented)
- **Audio quality**: >8kHz sample rate
- **Accuracy**: >90% transcription accuracy

### Current Status

- ✅ Whisper: Working on CPU (GPU pending ARM64 CUDA support)
- ⏳ XTTS: Pending installation (Python 3.12 compatibility issue)

## GPU Acceleration

### Status

The system has CUDA 13.0 available, but PyTorch ARM64 builds don't include CUDA by default.

### Options

1. Build PyTorch from source with CUDA support
2. Use CPU for now (still fast enough for most use cases)
3. Use Docker container with pre-built CUDA PyTorch

## Architecture

```
┌─────────────────────────────────────┐
│   TypeScript Application (Secretary)│
│   ┌──────────┐    ┌──────────┐     │
│   │ WhatsApp │    │  Avatar  │     │
│   │ Messages │    │  System  │     │
│   └────┬─────┘    └────┬─────┘     │
│        │               │            │
│        └───────┬───────┘            │
└────────────────┼────────────────────┘
                 │ HTTP/REST
┌────────────────┼────────────────────┐
│                ↓                    │
│   Voice Pipeline Service (Python)   │
│   ┌──────────────┐ ┌─────────────┐ │
│   │   Whisper    │ │    XTTS     │ │
│   │ (STT - GPU)  │ │ (TTS - GPU) │ │
│   └──────────────┘ └─────────────┘ │
└─────────────────────────────────────┘
```

## Troubleshooting

### CUDA not available

- Check: `nvidia-smi` shows GPU
- PyTorch ARM64 may not include CUDA
- Workaround: CPU mode is still functional

### XTTS installation fails

- Coqui TTS requires Python <3.12
- Workaround: Use xtts-streaming-server or alternative TTS

### Audio format errors

- Supported: mp3, wav, m4a, ogg, flac
- Use ffmpeg to convert if needed

## Next Steps

1. ✅ Whisper STT working
2. 🚧 Install XTTS (alternative approach needed)
3. 🚧 GPU optimization for ARM64
4. ⏳ Voice cloning implementation
5. ⏳ Lip-sync coordination with LivePortrait
6. ⏳ Audio streaming pipeline
7. ⏳ Character manager integration

## License

MIT
