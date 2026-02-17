/**
 * Avatar System Integration Tests
 *
 * End-to-end testing of:
 * - LivePortrait → WebRTC video streaming
 * - XTTS → WebRTC audio streaming
 * - WebRTC → Whisper inbound audio
 * - Full conversation loop
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { StreamingSystem } from "./index.js";
import type { VideoFrame, AudioChunk } from "./media-bridge.js";
import { createStreamingSystem } from "./index.js";

describe("Avatar System Integration Tests", () => {
  let streamingSystem: StreamingSystem;
  const TEST_PORT = 18081; // Use high port to avoid conflict with LivePortrait (8081)

  beforeAll(async () => {
    // Create streaming system for testing
    streamingSystem = await createStreamingSystem({
      webrtc: {
        signalingPort: TEST_PORT,
        debug: false,
        maxClients: 10,
      },
      media: {
        videoFps: 30,
        videoWidth: 512,
        videoHeight: 512,
        audioSampleRate: 16000,
        audioChannels: 1,
        debug: false,
      },
    });

    await streamingSystem.start();
  });

  afterAll(async () => {
    if (streamingSystem) {
      await streamingSystem.stop();
    }
  });

  describe("Integration Point Tests", () => {
    describe("LivePortrait → WebRTC", () => {
      it("should accept video frames from LivePortrait", async () => {
        const mockFrame: VideoFrame = {
          data: Buffer.alloc(512 * 512 * 4), // RGBA
          width: 512,
          height: 512,
          timestamp: Date.now(),
          format: "RGBA",
        };

        const frameHandler = vi.fn();
        streamingSystem.bridge.on("video-frame", frameHandler);

        await streamingSystem.bridge.pushVideoFrame(mockFrame);

        expect(frameHandler).toHaveBeenCalledWith(mockFrame);
      });

      it("should maintain 30fps video stream", async () => {
        const frameCount = 90; // 3 seconds at 30fps
        const startTime = Date.now();

        for (let i = 0; i < frameCount; i++) {
          const frame: VideoFrame = {
            data: Buffer.alloc(512 * 512 * 4),
            width: 512,
            height: 512,
            timestamp: Date.now(),
            format: "RGBA",
          };

          await streamingSystem.bridge.pushVideoFrame(frame);

          // Wait for ~33ms (30fps)
          await new Promise((resolve) => setTimeout(resolve, 33));
        }

        const duration = Date.now() - startTime;
        const actualFps = (frameCount / duration) * 1000;

        // Allow 10% variance
        expect(actualFps).toBeGreaterThan(27);
        expect(actualFps).toBeLessThan(33);
      });

      it("should track dropped frames", async () => {
        const metrics = streamingSystem.bridge.getMetrics();
        const initialDropped = metrics.droppedFrames;

        // Push frame with old timestamp (simulating latency)
        const lateFrame: VideoFrame = {
          data: Buffer.alloc(512 * 512 * 4),
          width: 512,
          height: 512,
          timestamp: Date.now() - 200, // 200ms old
          format: "RGBA",
        };

        await streamingSystem.bridge.pushVideoFrame(lateFrame);

        const newMetrics = streamingSystem.bridge.getMetrics();
        expect(newMetrics.droppedFrames).toBeGreaterThan(initialDropped);
      });
    });

    describe("XTTS → WebRTC", () => {
      it("should accept audio chunks from XTTS", async () => {
        const mockChunk: AudioChunk = {
          data: Buffer.alloc(1024),
          sampleRate: 16000,
          channels: 1,
          timestamp: Date.now(),
          format: "PCM",
        };

        const audioHandler = vi.fn();
        streamingSystem.bridge.on("audio-chunk", audioHandler);

        await streamingSystem.bridge.pushAudioChunk(mockChunk);

        expect(audioHandler).toHaveBeenCalledWith(mockChunk);
      });

      it("should handle continuous audio stream", async () => {
        const chunkCount = 50; // ~5 seconds of audio
        const chunkSize = 1600; // 100ms chunks at 16kHz

        for (let i = 0; i < chunkCount; i++) {
          const chunk: AudioChunk = {
            data: Buffer.alloc(chunkSize),
            sampleRate: 16000,
            channels: 1,
            timestamp: Date.now(),
            format: "PCM",
          };

          await streamingSystem.bridge.pushAudioChunk(chunk);

          // Wait 100ms between chunks
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const metrics = streamingSystem.bridge.getMetrics();
        // Allow small variance due to timing
        expect(metrics.audioChunks).toBeGreaterThanOrEqual(chunkCount);
        expect(metrics.audioChunks).toBeLessThanOrEqual(chunkCount + 2);
      });
    });

    describe("WebRTC → Whisper", () => {
      it("should emit incoming audio events", async () => {
        const mockIncomingAudio: AudioChunk = {
          data: Buffer.alloc(1600),
          sampleRate: 16000,
          channels: 1,
          timestamp: Date.now(),
          format: "PCM",
        };

        const incomingHandler = vi.fn();
        streamingSystem.bridge.on("incoming-audio", incomingHandler);

        streamingSystem.bridge.handleIncomingAudio(mockIncomingAudio);

        expect(incomingHandler).toHaveBeenCalledWith(mockIncomingAudio);
      });
    });
  });

  describe("Performance Validation", () => {
    it("should achieve <200ms WebRTC latency", async () => {
      const frame: VideoFrame = {
        data: Buffer.alloc(512 * 512 * 4),
        width: 512,
        height: 512,
        timestamp: Date.now(),
        format: "RGBA",
      };

      const startTime = Date.now();
      await streamingSystem.bridge.pushVideoFrame(frame);
      const latency = Date.now() - startTime;

      // Local push should be <5ms
      expect(latency).toBeLessThan(5);

      // Check average latency from metrics
      const metrics = streamingSystem.bridge.getMetrics();
      if (metrics.avgLatency > 0) {
        expect(metrics.avgLatency).toBeLessThan(200);
      }
    });

    it("should maintain consistent FPS under load", async () => {
      const frameCount = 300; // 10 seconds at 30fps
      const expectedDuration = 10000; // 10 seconds in ms

      const startTime = Date.now();

      for (let i = 0; i < frameCount; i++) {
        const frame: VideoFrame = {
          data: Buffer.alloc(512 * 512 * 4),
          width: 512,
          height: 512,
          timestamp: Date.now(),
          format: "RGBA",
        };

        await streamingSystem.bridge.pushVideoFrame(frame);
        await new Promise((resolve) => setTimeout(resolve, 33));
      }

      const actualDuration = Date.now() - startTime;

      // Allow 5% variance
      expect(actualDuration).toBeGreaterThan(expectedDuration * 0.95);
      expect(actualDuration).toBeLessThan(expectedDuration * 1.05);
    });

    it("should handle concurrent video and audio", async () => {
      const duration = 3000; // 3 seconds
      const startTime = Date.now();

      const videoPromise = (async () => {
        while (Date.now() - startTime < duration) {
          const frame: VideoFrame = {
            data: Buffer.alloc(512 * 512 * 4),
            width: 512,
            height: 512,
            timestamp: Date.now(),
            format: "RGBA",
          };
          await streamingSystem.bridge.pushVideoFrame(frame);
          await new Promise((resolve) => setTimeout(resolve, 33));
        }
      })();

      const audioPromise = (async () => {
        while (Date.now() - startTime < duration) {
          const chunk: AudioChunk = {
            data: Buffer.alloc(1600),
            sampleRate: 16000,
            channels: 1,
            timestamp: Date.now(),
            format: "PCM",
          };
          await streamingSystem.bridge.pushAudioChunk(chunk);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      })();

      await Promise.all([videoPromise, audioPromise]);

      const metrics = streamingSystem.bridge.getMetrics();
      expect(metrics.videoFrames).toBeGreaterThan(0);
      expect(metrics.audioChunks).toBeGreaterThan(0);
    });
  });

  describe("Data Quality Validation", () => {
    it("should preserve video frame dimensions", async () => {
      const frame: VideoFrame = {
        data: Buffer.alloc(512 * 512 * 4),
        width: 512,
        height: 512,
        timestamp: Date.now(),
        format: "RGBA",
      };

      const receivedFrames: VideoFrame[] = [];
      streamingSystem.bridge.on("video-frame", (f) => receivedFrames.push(f));

      await streamingSystem.bridge.pushVideoFrame(frame);

      expect(receivedFrames).toHaveLength(1);
      expect(receivedFrames[0].width).toBe(512);
      expect(receivedFrames[0].height).toBe(512);
      expect(receivedFrames[0].format).toBe("RGBA");
    });

    it("should preserve audio sample rate", async () => {
      const chunk: AudioChunk = {
        data: Buffer.alloc(1600),
        sampleRate: 16000,
        channels: 1,
        timestamp: Date.now(),
        format: "PCM",
      };

      const receivedChunks: AudioChunk[] = [];
      streamingSystem.bridge.on("audio-chunk", (c) => receivedChunks.push(c));

      await streamingSystem.bridge.pushAudioChunk(chunk);

      expect(receivedChunks).toHaveLength(1);
      expect(receivedChunks[0].sampleRate).toBe(16000);
      expect(receivedChunks[0].channels).toBe(1);
      expect(receivedChunks[0].format).toBe("PCM");
    });
  });

  describe("System Metrics", () => {
    it("should provide accurate status information", async () => {
      const status = streamingSystem.getStatus();

      expect(status).toHaveProperty("peerCount");
      expect(status).toHaveProperty("metrics");
      expect(status.metrics).toHaveProperty("videoFrames");
      expect(status.metrics).toHaveProperty("audioChunks");
      expect(status.metrics).toHaveProperty("fps");
      expect(status.metrics).toHaveProperty("avgLatency");
      expect(status.metrics).toHaveProperty("isStreaming");
    });

    it("should track peer connections", async () => {
      const initialStatus = streamingSystem.getStatus();
      expect(initialStatus.peerCount).toBe(0);

      // Note: In real scenario, WebSocket clients would connect
      // For now, just verify the metric exists
      expect(typeof initialStatus.peerCount).toBe("number");
    });
  });
});
