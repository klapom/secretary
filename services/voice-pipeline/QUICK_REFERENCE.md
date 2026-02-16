# Voice Pipeline - Quick Reference

## One-Line Commands

```bash
# Start service
cd /home/admin/projects/secretary/openclaw-source/services/voice-pipeline && source venv/bin/activate && python voice_service.py

# Health check
curl http://localhost:8765/health

# Test transcription
curl -X POST http://localhost:8765/stt/transcribe -F "file=@audio.mp3" -F "language=en"
```

## TypeScript Usage

```typescript
import { createVoiceClient } from "./src/services/voice-client";

// Create client
const voice = createVoiceClient("http://localhost:8765");

// Transcribe
const result = await voice.transcribe(audioBuffer, "en");
console.log(result.text);

// Health check
const health = await voice.health();
```

## Service Management

```bash
# Start
./services/voice-pipeline/start.sh

# Status
curl http://localhost:8765/health

# Stop
pkill -f voice_service.py

# Logs (if using systemd)
journalctl -u voice-pipeline -f
```

## API Endpoints

| Endpoint          | Method | Purpose                 |
| ----------------- | ------ | ----------------------- |
| `/health`         | GET    | Service health check    |
| `/`               | GET    | Service info            |
| `/stt/transcribe` | POST   | Transcribe audio        |
| `/tts/synthesize` | POST   | Synthesize speech (501) |
| `/voice/profiles` | GET    | List voice profiles     |
| `/docs`           | GET    | Swagger UI              |

## Supported Languages

`en` `de` `fr` `es` `it` `pt` `nl` `pl` `ru` `ja` `zh`

## Performance Targets

- **Whisper latency:** 0.1s for 3s audio ✅
- **Accuracy:** ~95% ✅
- **Audio quality:** 16kHz+ ✅

## Files & Locations

```
/home/admin/projects/secretary/openclaw-source/
├── services/voice-pipeline/     # Python service
│   ├── voice_service.py         # Main service
│   ├── start.sh                 # Start script
│   └── venv/                    # Virtual env
└── src/services/
    └── voice-client.ts          # TypeScript client
```

## Common Issues

**Port already in use:**

```bash
lsof -i :8765
kill -9 <PID>
```

**Service won't start:**

```bash
cd services/voice-pipeline
source venv/bin/activate
python voice_service.py  # Check error
```

**Audio format error:**

```bash
ffmpeg -i input.m4a -ar 16000 output.wav
```

## Integration Examples

### WhatsApp Voice Message

```typescript
// When voice message received
const audioBuffer = await downloadWhatsAppAudio(messageId);
const result = await voiceClient.transcribe(audioBuffer);
await sendWhatsAppMessage(chatId, result.text);
```

### Multi-language Detection

```typescript
// Auto-detect language
const result = await voiceClient.transcribe(audioBuffer);
console.log(`Detected: ${result.language}`);
```

### With Timestamps

```typescript
const result = await voiceClient.transcribe(audioBuffer, "en", {
  includeSegments: true,
});
result.segments.forEach((seg) => {
  console.log(`${seg.start}s - ${seg.end}s: ${seg.text}`);
});
```

## Production Checklist

- [ ] Service running on port 8765
- [ ] Health check returns 200
- [ ] Test transcription works
- [ ] TypeScript client installed
- [ ] Environment variables set
- [ ] Systemd service configured (optional)
- [ ] Monitoring enabled
- [ ] Logs configured

## Quick Test

```bash
# 1. Start service
cd services/voice-pipeline && ./start.sh

# 2. Test health
curl http://localhost:8765/health

# 3. Run tests
source venv/bin/activate && python test_voice.py

# Expected: 3/3 tests passing
```

## Links

- **Service:** http://localhost:8765
- **API Docs:** http://localhost:8765/docs
- **Health:** http://localhost:8765/health
- **README:** `/services/voice-pipeline/README.md`
- **Integration:** `/services/voice-pipeline/INTEGRATION.md`
