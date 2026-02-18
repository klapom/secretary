# WebRTC Streaming - Integration Contract

**Version:** 1.0.0
**Date:** 2026-02-17
**Status:** Production-ready

---

## Overview

This document defines the API contract for integrating external services (LivePortrait, XTTS, Whisper)
with the WebRTC streaming system. All integration happens via the `MediaBridge` class.

---

## Quick Start

```typescript
import { createStreamingSystem } from "./src/avatar/streaming/index.js";

const system = await createStreamingSystem({
  webrtc: {
    signalingPort: 8081,
    debug: false,
    maxClients: 10,
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
```

---

## Data Types

### VideoFrame

```typescript
interface VideoFrame {
  /** Raw frame buffer (RGBA: width * height * 4 bytes) */
  data: Buffer;
  /** Frame width in pixels */
  width: number;
  /** Frame height in pixels */
  height: number;
  /** Frame capture timestamp (Unix ms, from Date.now()) */
  timestamp: number;
  /** Pixel format */
  format?: "RGBA" | "YUV" | "JPEG" | "PNG";
}
```

**Standard frame for 512x512 RGBA:**

- `data`: `Buffer.alloc(512 * 512 * 4)` = 1,048,576 bytes (~1 MB)
- `format`: `"RGBA"` (default, used by LivePortrait)
- `timestamp`: `Date.now()` at capture time

### AudioChunk

```typescript
interface AudioChunk {
  /** Raw PCM audio buffer */
  data: Buffer;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of audio channels */
  channels: number;
  /** Chunk timestamp (Unix ms, from Date.now()) */
  timestamp: number;
  /** Audio encoding format */
  format?: "PCM" | "OPUS" | "MP3";
}
```

**Standard 100ms chunk at 16kHz mono PCM:**

- `data`: `Buffer.alloc(1600)` = 1,600 bytes (16000 Hz _ 0.1s _ 1 channel \* 1 byte/sample)
- `sampleRate`: `16000`
- `channels`: `1`
- `format`: `"PCM"`

---

## Integration Point 1: LivePortrait → WebRTC (Video Out)

LivePortrait calls `system.bridge.pushVideoFrame()` each time a rendered frame is ready.

```typescript
// In LivePortrait service, for each generated frame:
const frame: VideoFrame = {
  data: renderedFrameBuffer, // RGBA pixel data from LivePortrait
  width: 512,
  height: 512,
  timestamp: Date.now(),
  format: "RGBA",
};

await system.bridge.pushVideoFrame(frame);
```

**Behavior:**

- Frame is emitted as `"video-frame"` event on the bridge
- Bridge forwards to WebRTC server via `"media-video-frame"` event
- Frames with latency > `(1000/fps) * 1.5` ms are counted as dropped (metrics only, still forwarded)
- No-op if bridge is not started (`start()` not called)

**Target rate:** 30 fps = one call every ~33ms

---

## Integration Point 2: XTTS → WebRTC (Audio Out)

XTTS calls `system.bridge.pushAudioChunk()` for each synthesized audio chunk.

```typescript
// In XTTS service, after synthesizing speech:
const chunk: AudioChunk = {
  data: synthesizedPCMBuffer, // PCM audio from XTTS at 24kHz or resampled to 16kHz
  sampleRate: 16000,
  channels: 1,
  timestamp: Date.now(),
  format: "PCM",
};

await system.bridge.pushAudioChunk(chunk);
```

**Behavior:**

- Chunk is emitted as `"audio-chunk"` event on the bridge
- Bridge forwards to WebRTC server via `"media-audio-chunk"` event
- No-op if bridge is not started

**Note on XTTS sample rate:** XTTS v2 natively synthesizes at 24kHz. Resample to 16kHz before pushing,
or adjust `audioSampleRate` in MediaBridgeConfig to `24000`.

---

## Integration Point 3: WebRTC → Whisper (Audio In)

Incoming audio from the browser microphone arrives via the bridge's `"incoming-audio"` event.

```typescript
// In Whisper service setup:
system.bridge.on("incoming-audio", async (chunk: AudioChunk) => {
  // chunk.sampleRate = 16000 (browser WebRTC standard)
  // chunk.format = "PCM"
  const transcription = await whisperService.transcribe(chunk.data);
  // Handle transcription...
});
```

**Behavior:**

- Browser captures microphone audio via WebRTC
- WebRTC server emits `"incoming-audio"` event
- Bridge's `handleIncomingAudio()` re-emits as bridge `"incoming-audio"` event
- Whisper listener receives `AudioChunk` and processes

**Note:** Browser WebRTC audio is 16kHz PCM — matches Whisper Large V3's expected input.

---

## WebRTC Server Events

The `system.server` (WebRTCStreamingServer) also emits events for connection lifecycle:

```typescript
// Peer connected (browser opened WebRTC connection)
system.server.on("peer-connected", (peer: WebRTCPeer) => {
  console.log(`Browser connected: ${peer.id}`);
});

// Peer disconnected
system.server.on("peer-disconnected", ({ peerId, reason }) => {
  console.log(`Browser disconnected: ${peerId}, reason: ${reason}`);
});

// WebRTC signaling events (handled internally, but can be observed)
system.server.on("offer", ({ peerId, offer }) => { ... });
system.server.on("answer", ({ peerId, answer }) => { ... });
system.server.on("ice-candidate", ({ peerId, candidate }) => { ... });
```

---

## System Status

```typescript
const status = system.getStatus();
// Returns:
// {
//   peerCount: number,       // Currently connected browser clients
//   metrics: {
//     videoFrames: number,   // Total frames pushed
//     audioChunks: number,   // Total audio chunks pushed
//     droppedFrames: number, // Frames with excessive latency
//     avgLatency: number,    // Rolling average latency (ms), EMA with 0.1 weight
//     lastFrameTime: number, // Unix ms of last video frame
//     fps: number,           // Current instantaneous FPS
//     isStreaming: boolean,  // Whether bridge.start() has been called
//   }
// }
```

---

## Lifecycle

```typescript
// 1. Create system (also starts WebRTC server internally)
const system = await createStreamingSystem(config);

// 2. Start media bridge
await system.start();

// 3. ... push frames and audio, listen for events ...

// 4. Graceful shutdown
await system.stop();
// stop() calls bridge.stop() then server.stop()
// All connected peers are disconnected
```

---

## WebSocket Signaling Protocol (for reference)

The browser client connects to `ws://host:8081` and exchanges these messages:

| Direction       | Message Type    | Payload                                          |
| --------------- | --------------- | ------------------------------------------------ |
| Server → Client | `config`        | `{ peerId, iceServers, videoCodec, audioCodec }` |
| Server → Client | `ping`          | (keep-alive, every 30s)                          |
| Server → Client | `answer`        | `{ peerId, data: RTCSessionDescriptionInit }`    |
| Server → Client | `ice-candidate` | `{ peerId, data: RTCIceCandidateInit }`          |
| Server → Client | `error`         | `{ error: string }`                              |
| Client → Server | `offer`         | `{ data: RTCSessionDescriptionInit }`            |
| Client → Server | `pong`          | (keep-alive response)                            |
| Client → Server | `ice-candidate` | `{ data: RTCIceCandidateInit }`                  |

---

## Configuration Reference

```typescript
interface StreamingSystemConfig {
  webrtc: {
    signalingPort: number; // WebSocket port (e.g., 8081)
    iceServers?: RTCIceServer[]; // Default: Google STUN servers
    debug?: boolean; // Default: false
    maxClients?: number; // Default: 100
    videoCodec?: "VP8" | "VP9" | "H264"; // Default: "VP8"
    audioCodec?: "opus" | "pcmu" | "pcma"; // Default: "opus"
  };
  media?: {
    videoFps?: number; // Default: 30
    videoWidth?: number; // Default: 512
    videoHeight?: number; // Default: 512
    audioSampleRate?: number; // Default: 16000
    audioChannels?: number; // Default: 1
    debug?: boolean; // Default: false
  };
}
```

---

## Test Results (2026-02-17)

| Test Suite              | Tests                   | Status   |
| ----------------------- | ----------------------- | -------- |
| `media-bridge.test.ts`  | 20/20                   | PASS     |
| `webrtc-server.test.ts` | 11/11 active, 4 skipped | PASS     |
| `integration.test.ts`   | 13/13                   | PASS     |
| **Total**               | **44/48**               | **PASS** |

Skipped tests: SDP/ICE signaling tests that require a real browser WebRTC stack
(not available in Node.js test environment).
