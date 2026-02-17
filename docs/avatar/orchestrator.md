# Pipeline Orchestrator

The Pipeline Orchestrator (`src/avatar/orchestrator.ts`) coordinates all Avatar System services into a cohesive real-time interaction pipeline.

## Purpose

The orchestrator:

1. **Routes messages** from LLM through STT/TTS/rendering pipeline
2. **Synchronizes** video (avatar) and audio (speech) streams
3. **Handles errors** with graceful fallbacks
4. **Manages WebRTC** signaling and media streaming
5. **Controls expression** mapping from LLM outputs to avatar emotions

## Service Coordination

```
TypeScript Orchestrator (src/avatar/orchestrator.ts)
    ├─ LivePortrait (8081)    — Render avatar frames
    ├─ XTTS (8082)            — Synthesize speech
    ├─ Whisper (8083)         — Transcribe user speech
    └─ WebRTC (8086)          — Stream video/audio to browser
```

## Port Reference

| Service              | Port     | Role                       |
| -------------------- | -------- | -------------------------- |
| LivePortrait         | 8081     | Avatar rendering           |
| XTTS                 | 8082     | Voice synthesis            |
| Whisper              | 8083     | Speech recognition         |
| Canary-NeMo          | 8084     | Alt. STT (experimental)    |
| Test UI              | 8085     | Manual testing             |
| **WebRTC Signaling** | **8086** | **Streaming coordination** |

**Critical:** WebRTC signaling uses port **8086**, NOT 8081. This avoids conflict with LivePortrait rendering service.

## Architecture

### Audio Pipeline

```
User Microphone (Browser)
    ↓ WebRTC Audio Track
WebRTC Signaling (8086)
    ↓
Orchestrator
    ↓
Whisper STT (8083)
    ↓ Transcription
LLM Processing
    ↓ Response
XTTS (8082)
    ↓ Audio Stream
Orchestrator
    ↓
WebRTC Audio Track
    ↓
Browser Speaker
```

### Video Pipeline

```
LLM Emotion Output
    ↓
Orchestrator (emotion → expression mapping)
    ↓
LivePortrait (8081)
    ↓ Render frame
Orchestrator (caching)
    ↓
WebRTC Video Track (8086)
    ↓
Browser Video Display
```

## Implementation

### File Location

```
src/avatar/orchestrator.ts
```

### Core Responsibilities

#### 1. Emotion Mapping

Maps LLM-generated emotions to LivePortrait expressions:

```typescript
interface EmotionMap {
  happy: "happy";
  sad: "sad";
  neutral: "neutral";
  surprised: "surprised";
  [key: string]: string;
}
```

**Strategy:**

- Extract emotion from LLM system prompt or tool output
- Default to `neutral` if not specified
- Apply intensity multiplier for expression strength

#### 2. STT Pipeline (Microphone Input)

```typescript
async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: "audio/wav" }));
  formData.append("language", "de"); // or auto-detect

  const response = await fetch("http://localhost:8083/transcribe", {
    method: "POST",
    body: formData,
  });

  const { text } = await response.json();
  return text;
}
```

#### 3. TTS Pipeline (Voice Synthesis)

```typescript
async function synthesizeAudio(text: string): Promise<ArrayBuffer> {
  const response = await fetch("http://localhost:8082/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: "de" }),
  });

  return await response.arrayBuffer(); // PCM audio
}
```

#### 4. Avatar Rendering Pipeline

```typescript
async function renderAvatar(
  sourceImage: ArrayBuffer,
  expression: string,
  intensity: number = 1.0,
): Promise<ArrayBuffer> {
  const formData = new FormData();
  formData.append("source_image", new Blob([sourceImage]));
  formData.append("expression", expression);
  formData.append("intensity", intensity);

  const response = await fetch("http://localhost:8081/api/render", {
    method: "POST",
    body: formData,
  });

  return await response.arrayBuffer(); // JPEG frame
}
```

#### 5. WebRTC Media Control

```typescript
async function initializeWebRTC(sessionId: string): Promise<RTCPeerConnection> {
  const pc = new RTCPeerConnection();

  // Add video track for avatar
  const videoTrack = await navigator.mediaDevices.getDisplayMedia({ video: true });
  pc.addTrack(videoTrack);

  // Add audio track for speech
  const audioTrack = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(audioTrack);

  // Connect signaling server
  const signalingSocket = new WebSocket(`ws://localhost:8086/signaling/${sessionId}`);
  signalingSocket.addEventListener("message", async (event) => {
    const offer = JSON.parse(event.data);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signalingSocket.send(JSON.stringify(answer));
  });

  return pc;
}
```

## Error Handling

The orchestrator implements graceful degradation:

| Error                    | Fallback                             |
| ------------------------ | ------------------------------------ |
| LivePortrait unavailable | Render cached frame or default image |
| XTTS unavailable         | Use TTS backup or text-only fallback |
| Whisper unavailable      | Text input mode (no microphone)      |
| WebRTC connection lost   | Buffered audio/video, auto-reconnect |

Example:

```typescript
async function renderAvatarWithFallback(expression: string) {
  try {
    return await renderAvatar(sourceImage, expression);
  } catch (err) {
    console.warn("LivePortrait failed, using cached frame");
    return cachedFrames[expression] || cachedFrames.neutral;
  }
}
```

## Performance Considerations

### Latency Budget (10fps target, 100ms per frame)

| Step                  | Budget       | Actual                 |
| --------------------- | ------------ | ---------------------- |
| Whisper transcription | 1s           | 0.5-1s ✅              |
| LLM processing        | variable     | depends on model       |
| XTTS synthesis        | 1s           | 0.5-0.7s ✅            |
| LivePortrait render   | 100ms        | ~80ms ✅               |
| WebRTC overhead       | 10ms         | 5-15ms ✅              |
| **Total**             | **variable** | **acceptable for MVP** |

### Optimization Strategies

1. **Async Processing:** All services called concurrently where possible
2. **Caching:** Avatar frames cached by (expression, intensity) tuple
3. **Batch Processing:** Send multiple frames to WebRTC in batches
4. **Connection Pooling:** Reuse HTTP connections to microservices

## Development & Testing

### Manual Testing

Use the test UI at https://192.168.178.10:8085:

1. **STT Test:** Record voice → Whisper transcription
2. **TTS Test:** Type text → XTTS audio playback
3. **Full Pipeline:** Speak → recognize → synthesize → play

### Integration Testing

Run end-to-end tests:

```bash
npm run test:orchestrator
```

Tests validate:

- All service endpoints healthy
- Emotion mapping works correctly
- Error fallbacks activate properly
- WebRTC signaling protocol correct

## Configuration

### Environment Variables

```bash
# Service endpoints (defaults shown)
LIVEPORTRAIT_URL=http://localhost:8081
XTTS_URL=http://localhost:8082
WHISPER_URL=http://localhost:8083
WEBRTC_SIGNALING_PORT=8086

# Avatar settings
DEFAULT_AVATAR_IMAGE=/data/avatars/default.jpg
DEFAULT_EXPRESSION=neutral
EXPRESSION_INTENSITY=1.0

# Language settings
DEFAULT_LANGUAGE=de  # German
FALLBACK_LANGUAGE=en # English
```

### Character Manager Integration

The orchestrator works with Character Manager (`src/characters/db.ts`) to:

1. Load character avatars and voices
2. Switch characters at runtime
3. Apply personality to LLM prompts

```typescript
const character = await characterManager.get(activeCharacterId);
const avatar = await renderAvatar(character.avatarImage, "happy");
const speech = await synthesizeAudio(responseText, character.voiceId);
```

## Related Documentation

- [Avatar System Overview](./README.md) — Full architecture
- [LivePortrait Details](./liveportrait.md) — Avatar rendering service
- [Service Status](../docker/SETUP_A_STATUS.md) — Technical learnings & deployment
- [Character Manager](../concepts/characters.md) — Avatar management
- [WebRTC Implementation](../concepts/webrtc.md) — Streaming details
