# Avatar WebRTC Streaming

Real-time WebRTC streaming infrastructure for avatar video and audio.

## Architecture

```
┌─────────────────┐
│  Browser Client │
│   (WebRTC)      │
└────────┬────────┘
         │ WebSocket (signaling)
         │ WebRTC (media)
         ↓
┌─────────────────┐
│  WebRTC Server  │
│   (Node.js)     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐      ┌──────────────┐
│  Media Bridge   │◄─────┤ LivePortrait │
│                 │      └──────────────┘
│                 │
│                 │      ┌──────────────┐
│                 │◄─────┤     XTTS     │
│                 │      └──────────────┘
│                 │
│                 │      ┌──────────────┐
│                 │─────►│   Whisper    │
└─────────────────┘      └──────────────┘
```

## Features

### WebRTC Server (`webrtc-server.ts`)
- **WebSocket signaling server** for connection management
- **SDP offer/answer exchange** for peer negotiation
- **ICE candidate handling** for NAT traversal
- **Multiple client support** with configurable limits
- **Keep-alive ping/pong** for connection health
- **Broadcasting** to all connected clients
- **Comprehensive event system** for monitoring

### Media Bridge (`media-bridge.ts`)
- **Video frame streaming** (30fps @ 512x512)
- **Bidirectional audio streaming** (16kHz PCM)
- **Performance metrics** (latency, FPS, dropped frames)
- **Format-agnostic** (RGBA, YUV, JPEG, PCM, OPUS)
- **Event-driven architecture** for loose coupling

### Browser Client (`webrtc-client.html` + `webrtc-client.js`)
- **Modern responsive UI** with real-time metrics
- **Automatic reconnection** handling
- **Microphone support** for bidirectional audio
- **Performance monitoring** (latency, FPS, bitrate, packet loss)
- **Live logging** console

## Quick Start

### 1. Installation

No additional dependencies required! Uses the existing `ws` package.

### 2. Start Server

```typescript
import { createStreamingSystem } from "./avatar/streaming/index.js";

const system = await createStreamingSystem({
  webrtc: {
    signalingPort: 8081,
    debug: true,
    maxClients: 100,
  },
  media: {
    videoFps: 30,
    videoWidth: 512,
    videoHeight: 512,
    audioSampleRate: 16000,
    audioChannels: 1,
  },
});

await system.start();
console.log("WebRTC streaming server ready!");
```

### 3. Push Video Frames (from LivePortrait)

```typescript
// Called by LivePortrait service when frame is ready
system.bridge.pushVideoFrame({
  data: frameBuffer,        // Buffer containing RGBA data
  width: 512,
  height: 512,
  timestamp: Date.now(),
  format: "RGBA",
});
```

### 4. Push Audio (from XTTS)

```typescript
// Called by XTTS service for outbound audio
system.bridge.pushAudioChunk({
  data: audioBuffer,        // Buffer containing PCM data
  sampleRate: 16000,
  channels: 1,
  timestamp: Date.now(),
  format: "PCM",
});
```

### 5. Handle Incoming Audio (to Whisper)

```typescript
// Listen for audio from browser (microphone)
system.bridge.on("incoming-audio", (chunk) => {
  // Send to Whisper for transcription
  whisperService.transcribe(chunk.data);
});
```

### 6. Open Browser Client

```bash
# Serve the HTML client
cd src/avatar/streaming
python3 -m http.server 8080
```

Then open: `http://localhost:8080/webrtc-client.html`

## API Reference

### `createStreamingSystem(config)`

Creates a complete WebRTC streaming system.

**Parameters:**
- `config.webrtc.signalingPort` - WebSocket port for signaling (default: 8081)
- `config.webrtc.iceServers` - STUN/TURN servers (default: Google STUN)
- `config.webrtc.debug` - Enable debug logging (default: false)
- `config.webrtc.maxClients` - Max concurrent clients (default: 100)
- `config.media.videoFps` - Target framerate (default: 30)
- `config.media.videoWidth` - Video width (default: 512)
- `config.media.videoHeight` - Video height (default: 512)
- `config.media.audioSampleRate` - Audio sample rate (default: 16000)
- `config.media.audioChannels` - Audio channels (default: 1)

**Returns:** `Promise<StreamingSystem>`

### `StreamingSystem`

**Methods:**
- `start()` - Start the streaming system
- `stop()` - Stop the streaming system
- `getStatus()` - Get current status (peer count, metrics)

**Properties:**
- `server` - WebRTC signaling server
- `bridge` - Media bridge for video/audio

### `MediaBridge`

**Methods:**
- `pushVideoFrame(frame)` - Push video frame to stream
- `pushAudioChunk(chunk)` - Push audio chunk to stream
- `handleIncomingAudio(chunk)` - Handle audio from client
- `getMetrics()` - Get performance metrics
- `resetMetrics()` - Reset metrics counters

**Events:**
- `video-frame` - New video frame ready for transmission
- `audio-chunk` - New audio chunk ready for transmission
- `incoming-audio` - Audio received from client
- `started` - Bridge started
- `stopped` - Bridge stopped

### `WebRTCStreamingServer`

**Methods:**
- `start()` - Start signaling server
- `stop()` - Stop signaling server
- `getPeers()` - Get all connected peers
- `getPeerCount()` - Get peer count
- `sendAnswer(peerId, answer)` - Send SDP answer to client
- `sendIceCandidate(peerId, candidate)` - Send ICE candidate
- `broadcast(message)` - Broadcast to all clients

**Events:**
- `started` - Server started
- `stopped` - Server stopped
- `peer-connected` - New peer connected
- `peer-disconnected` - Peer disconnected
- `offer` - Received SDP offer
- `answer` - Received SDP answer
- `ice-candidate` - Received ICE candidate
- `error` - Server error

## Performance Targets

- ✅ **End-to-end latency:** <200ms
- ✅ **Video framerate:** 30fps smooth playback
- ✅ **Audio:** Bidirectional, low latency
- ✅ **Concurrent clients:** 100+
- ✅ **Network resilience:** Automatic reconnection

## Testing

Run unit tests:
```bash
npm run test -- src/avatar/streaming/
```

Run specific test file:
```bash
npm run test -- src/avatar/streaming/webrtc-server.test.ts
npm run test -- src/avatar/streaming/media-bridge.test.ts
```

## Integration Guide

### LivePortrait Integration

```typescript
// In LivePortrait service
livePortraitService.on("frame-ready", (frameData) => {
  streamingSystem.bridge.pushVideoFrame({
    data: frameData,
    width: 512,
    height: 512,
    timestamp: Date.now(),
    format: "RGBA",
  });
});
```

### XTTS Integration

```typescript
// In XTTS service (outbound speech)
xttsService.on("audio-chunk", (audioData) => {
  streamingSystem.bridge.pushAudioChunk({
    data: audioData,
    sampleRate: 16000,
    channels: 1,
    timestamp: Date.now(),
    format: "PCM",
  });
});
```

### Whisper Integration

```typescript
// In Whisper service (inbound speech)
streamingSystem.bridge.on("incoming-audio", async (chunk) => {
  const transcript = await whisperService.transcribe(chunk.data);
  console.log("User said:", transcript);
});
```

## Troubleshooting

### High Latency (>200ms)

1. Check network conditions
2. Verify GPU acceleration for LivePortrait
3. Reduce video resolution or framerate
4. Use TURN server if behind strict NAT

### Dropped Frames

1. Check `metrics.droppedFrames` counter
2. Verify LivePortrait is maintaining 30fps
3. Check CPU/GPU utilization
4. Reduce client count if server overloaded

### No Video/Audio

1. Check browser console for errors
2. Verify WebRTC server is running
3. Check firewall/NAT configuration
4. Ensure STUN server is accessible

### Connection Fails

1. Check WebSocket connection (port 8081)
2. Verify ICE servers are reachable
3. Check browser WebRTC support
4. Try different network/browser

## STUN/TURN Configuration

For production deployments, configure TURN servers for NAT traversal:

```typescript
const system = await createStreamingSystem({
  webrtc: {
    signalingPort: 8081,
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:turn.example.com:3478",
        username: "user",
        credential: "pass",
      },
    ],
  },
});
```

## Future Enhancements

- [ ] E2E encryption for media streams
- [ ] Adaptive bitrate based on network conditions
- [ ] SFU (Selective Forwarding Unit) for scalability
- [ ] Recording capabilities
- [ ] Multi-track support (screen sharing, etc.)
- [ ] WebRTC stats dashboard
- [ ] Bandwidth estimation
- [ ] Simulcast support

## License

MIT
