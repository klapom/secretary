# Voice Pipeline Integration Guide

Integration of XTTS + Whisper voice pipeline with Secretary

## Quick Start

### 1. Start the Voice Service

```bash
cd services/voice-pipeline
source venv/bin/activate
python voice_service.py
```

Service runs on `http://localhost:8765`

### 2. Use in TypeScript

```typescript
import { createVoiceClient } from "./src/services/voice-client";

const voiceClient = createVoiceClient("http://localhost:8765");

// Check if service is ready
const isReady = await voiceClient.isReady();
console.log("Voice service ready:", isReady);

// Transcribe audio
const audioBuffer = fs.readFileSync("audio.mp3");
const result = await voiceClient.transcribe(audioBuffer, "en", {
  includeSegments: true,
});

console.log("Transcription:", result.text);
console.log("Confidence:", result.confidence);
```

## Integration Points

### 1. WhatsApp Voice Messages

Integrate with WhatsApp channel to transcribe voice messages:

```typescript
// In src/channels/whatsapp/handler.ts
import { defaultVoiceClient } from "../../services/voice-client";

async function handleVoiceMessage(message: WhatsAppVoiceMessage) {
  // Download audio
  const audioBuffer = await downloadAudio(message.mediaUrl);

  // Transcribe
  const result = await defaultVoiceClient.transcribe(audioBuffer, "en");

  // Send back transcription
  await sendMessage(message.from, `🎤 Transcription: ${result.text}`);
}
```

### 2. Avatar System (LivePortrait)

Coordinate with LivePortrait for lip-sync:

```typescript
// In avatar system
import { defaultVoiceClient } from "../services/voice-client";

async function synthesizeSpeech(text: string, language: string) {
  // When XTTS is ready:
  // const audioBuffer = await defaultVoiceClient.synthesize({
  //   text,
  //   language,
  //   voiceId: 'default'
  // });

  // For now, use existing node-edge-tts
  const audioBuffer = await edgeTTS(text, language);

  // Send to LivePortrait for lip-sync
  await livePortrait.animateWithAudio(audioBuffer);

  return audioBuffer;
}
```

### 3. Multi-language Support

The service supports multiple languages:

```typescript
const SUPPORTED_LANGUAGES = ["en", "de", "fr", "es", "it", "pt", "nl", "pl", "ru", "ja", "zh"];

// Auto-detect language
const result = await voiceClient.transcribe(audioBuffer);
console.log("Detected language:", result.language);

// Force specific language
const resultDE = await voiceClient.transcribe(audioBuffer, "de");
```

## Environment Configuration

Add to `.env`:

```bash
# Voice Pipeline Service
VOICE_SERVICE_URL=http://localhost:8765
VOICE_SERVICE_TIMEOUT=30000

# Whisper Configuration
WHISPER_MODEL=base  # tiny, base, small, medium, large
WHISPER_DEVICE=cpu  # cpu or cuda (when available)

# TTS Configuration (when XTTS is ready)
TTS_PROVIDER=xtts  # xtts, edge, elevenlabs, openai
TTS_VOICE_ID=default
```

## Production Deployment

### Systemd Service

```bash
# Copy service file
sudo cp services/voice-pipeline/voice-pipeline.service /etc/systemd/system/

# Enable and start
sudo systemctl enable voice-pipeline
sudo systemctl start voice-pipeline

# Check status
sudo systemctl status voice-pipeline

# View logs
sudo journalctl -u voice-pipeline -f
```

### Docker Deployment (Alternative)

Create `services/voice-pipeline/Dockerfile`:

```dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY voice_service.py .

# Expose port
EXPOSE 8765

# Run service
CMD ["python", "voice_service.py"]
```

Build and run:

```bash
docker build -t voice-pipeline services/voice-pipeline
docker run -p 8765:8765 voice-pipeline
```

## Performance Optimization

### Current Performance (CPU mode)

- Whisper base: ~0.1s for 3s audio
- Latency: <1s total (download + transcribe + response)

### With GPU (when available)

- Expected: 10x faster
- Whisper: <0.01s for 3s audio
- XTTS: <0.5s for 5s audio

## Monitoring

### Health Checks

```bash
# Basic health check
curl http://localhost:8765/health

# Check from TypeScript
const health = await voiceClient.health();
console.log('GPU available:', health.gpu.available);
console.log('Whisper loaded:', health.models.whisper.loaded);
```

### Metrics

Add to monitoring system:

- Transcription latency
- Success/error rates
- Audio quality metrics
- GPU utilization (when available)

## Troubleshooting

### Service won't start

```bash
# Check logs
journalctl -u voice-pipeline -n 50

# Check port
lsof -i :8765

# Test manually
cd services/voice-pipeline
source venv/bin/activate
python voice_service.py
```

### Transcription errors

```bash
# Check audio format
ffprobe audio.mp3

# Convert if needed
ffmpeg -i input.m4a -ar 16000 -ac 1 output.wav
```

### Connection timeouts

Increase timeout in client:

```typescript
const voiceClient = createVoiceClient("http://localhost:8765", 60000);
```

## Next Steps

- [ ] XTTS integration (Python 3.11 or alternative)
- [ ] GPU acceleration for ARM64
- [ ] Voice cloning implementation
- [ ] Streaming support for real-time transcription
- [ ] Audio quality enhancement pipeline
- [ ] Lip-sync coordination with LivePortrait

## API Documentation

Full API docs available at:

- Swagger UI: `http://localhost:8765/docs`
- ReDoc: `http://localhost:8765/redoc`
