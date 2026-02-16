/**
 * Example: WebRTC Avatar Streaming Integration
 *
 * This demonstrates how to integrate the WebRTC streaming system
 * with LivePortrait, XTTS, and Whisper services.
 */

import { createStreamingSystem } from "./index.js";
import type { StreamingSystem } from "./index.js";

/**
 * Example: Complete avatar streaming setup
 */
export async function startAvatarStreaming(): Promise<StreamingSystem> {
  console.log("🚀 Starting Avatar WebRTC Streaming System...");

  // Create streaming system
  const system = await createStreamingSystem({
    webrtc: {
      signalingPort: 8081,
      debug: true,
      maxClients: 100,
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    },
    media: {
      videoFps: 30,
      videoWidth: 512,
      videoHeight: 512,
      audioSampleRate: 16000,
      audioChannels: 1,
      debug: true,
    },
  });

  // Start the system
  await system.start();

  // Log peer connections
  system.server.on("peer-connected", (peer) => {
    console.log(`✅ Client connected: ${peer.id}`);
  });

  system.server.on("peer-disconnected", ({ peerId, reason }) => {
    console.log(`❌ Client disconnected: ${peerId} (${reason || "unknown"})`);
  });

  // Handle incoming audio (from browser microphone → Whisper)
  system.bridge.on("incoming-audio", async (chunk) => {
    console.log(`🎤 Incoming audio: ${chunk.data.length} bytes`);
    // TODO: Send to Whisper service for transcription
    // const transcript = await whisperService.transcribe(chunk.data);
    // console.log("User said:", transcript);
  });

  // Monitor performance metrics
  setInterval(() => {
    const status = system.getStatus();
    const metrics = status.metrics;

    console.log("\n📊 Performance Metrics:");
    console.log(`  Clients: ${status.peerCount}`);
    console.log(`  Video Frames: ${metrics.videoFrames}`);
    console.log(`  Audio Chunks: ${metrics.audioChunks}`);
    console.log(`  FPS: ${metrics.fps}`);
    console.log(`  Avg Latency: ${Math.round(metrics.avgLatency)}ms`);
    console.log(`  Dropped Frames: ${metrics.droppedFrames}`);
  }, 5000);

  console.log("✅ WebRTC streaming server started on port 8081");
  console.log("📱 Open browser client: http://localhost:8080/webrtc-client.html");

  return system;
}

/**
 * Example: LivePortrait integration
 *
 * This shows how LivePortrait would push video frames to the streaming system.
 */
export function integrateWithLivePortrait(system: StreamingSystem): void {
  console.log("🎭 Integrating with LivePortrait...");

  // Simulate LivePortrait service
  // In real implementation, this would be the actual LivePortrait service
  const mockLivePortrait = {
    on(event: string, handler: (frame: unknown) => void) {
      if (event === "frame-ready") {
        // Simulate 30fps frame generation
        setInterval(() => {
          const frameData = Buffer.alloc(512 * 512 * 4); // RGBA
          // In real implementation, this would be actual rendered frame data
          handler({
            data: frameData,
            width: 512,
            height: 512,
            timestamp: Date.now(),
            format: "RGBA",
          });
        }, 1000 / 30); // 30fps
      }
    },
  };

  // Connect LivePortrait to streaming system
  mockLivePortrait.on("frame-ready", (frame: any) => {
    system.bridge.pushVideoFrame(frame);
  });

  console.log("✅ LivePortrait integration complete");
}

/**
 * Example: XTTS integration
 *
 * This shows how XTTS would push audio chunks for avatar speech.
 */
export function integrateWithXTTS(system: StreamingSystem): void {
  console.log("🔊 Integrating with XTTS...");

  // Simulate XTTS service
  const mockXTTS = {
    on(event: string, handler: (chunk: unknown) => void) {
      if (event === "audio-chunk") {
        // Simulate periodic audio generation (when avatar speaks)
        setInterval(() => {
          const audioData = Buffer.alloc(1024); // PCM audio
          handler({
            data: audioData,
            sampleRate: 16000,
            channels: 1,
            timestamp: Date.now(),
            format: "PCM",
          });
        }, 100); // 10Hz chunks
      }
    },
  };

  // Connect XTTS to streaming system
  mockXTTS.on("audio-chunk", (chunk: any) => {
    system.bridge.pushAudioChunk(chunk);
  });

  console.log("✅ XTTS integration complete");
}

/**
 * Example: Whisper integration
 *
 * This shows how incoming audio from browser is sent to Whisper.
 */
export function integrateWithWhisper(system: StreamingSystem): void {
  console.log("👂 Integrating with Whisper...");

  // Simulate Whisper service
  const mockWhisper = {
    async transcribe(audioData: Buffer): Promise<string> {
      // In real implementation, this would call Whisper API
      return "Mock transcription";
    },
  };

  // Connect incoming audio to Whisper
  system.bridge.on("incoming-audio", async (chunk) => {
    try {
      const transcript = await mockWhisper.transcribe(chunk.data);
      console.log(`📝 Transcription: "${transcript}"`);
      // TODO: Process transcript (send to LLM, etc.)
    } catch (error) {
      console.error("Whisper transcription error:", error);
    }
  });

  console.log("✅ Whisper integration complete");
}

/**
 * Example: Complete system startup
 */
export async function main(): Promise<void> {
  try {
    // Start streaming system
    const system = await startAvatarStreaming();

    // Integrate with avatar services
    integrateWithLivePortrait(system);
    integrateWithXTTS(system);
    integrateWithWhisper(system);

    console.log("\n🎉 Avatar streaming system fully operational!");
    console.log("\n📋 Next steps:");
    console.log("  1. Open http://localhost:8080/webrtc-client.html in browser");
    console.log("  2. Click 'Connect' button");
    console.log("  3. Allow microphone access (for bidirectional audio)");
    console.log("  4. Watch real-time video/audio streaming!");

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n\n👋 Shutting down...");
      await system.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Failed to start avatar streaming:", error);
    process.exit(1);
  }
}

// Run example if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
