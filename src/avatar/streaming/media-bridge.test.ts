/**
 * Media Bridge Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MediaBridge } from "./media-bridge.js";
import type { VideoFrame, AudioChunk } from "./media-bridge.js";

describe("MediaBridge", () => {
  let bridge: MediaBridge;

  beforeEach(() => {
    bridge = new MediaBridge({
      videoFps: 30,
      videoWidth: 512,
      videoHeight: 512,
      audioSampleRate: 16000,
      audioChannels: 1,
      debug: false,
    });
  });

  afterEach(async () => {
    if (bridge) {
      await bridge.stop();
    }
  });

  describe("Lifecycle", () => {
    it("should start media bridge", async () => {
      await bridge.start();
      const metrics = bridge.getMetrics();
      expect(metrics.isStreaming).toBe(true);
    });

    it("should stop media bridge", async () => {
      await bridge.start();
      await bridge.stop();
      const metrics = bridge.getMetrics();
      expect(metrics.isStreaming).toBe(false);
    });

    it("should emit started event", async () => {
      const startedHandler = vi.fn();
      bridge.on("started", startedHandler);
      await bridge.start();
      expect(startedHandler).toHaveBeenCalled();
    });

    it("should emit stopped event", async () => {
      const stoppedHandler = vi.fn();
      bridge.on("stopped", stoppedHandler);
      await bridge.start();
      await bridge.stop();
      expect(stoppedHandler).toHaveBeenCalled();
    });

    it("should not start if already streaming", async () => {
      await bridge.start();
      const metrics1 = bridge.getMetrics();
      await bridge.start(); // Should log warning but not fail
      const metrics2 = bridge.getMetrics();
      expect(metrics1.isStreaming).toBe(metrics2.isStreaming);
    });
  });

  describe("Video Frame Handling", () => {
    it("should push video frames", async () => {
      await bridge.start();

      const frameHandler = vi.fn();
      bridge.on("video-frame", frameHandler);

      const frame: VideoFrame = {
        data: Buffer.alloc(512 * 512 * 4), // RGBA
        width: 512,
        height: 512,
        timestamp: Date.now(),
        format: "RGBA",
      };

      await bridge.pushVideoFrame(frame);

      expect(frameHandler).toHaveBeenCalledWith(frame);
    });

    it("should track video frame metrics", async () => {
      await bridge.start();

      const frame: VideoFrame = {
        data: Buffer.alloc(512 * 512 * 4),
        width: 512,
        height: 512,
        timestamp: Date.now() - 50, // 50ms ago
        format: "RGBA",
      };

      await bridge.pushVideoFrame(frame);

      const metrics = bridge.getMetrics();
      expect(metrics.videoFrames).toBe(1);
      expect(metrics.avgLatency).toBeGreaterThan(0);
    });

    it("should detect dropped frames", async () => {
      await bridge.start();

      // Push first frame
      await bridge.pushVideoFrame({
        data: Buffer.alloc(512 * 512 * 4),
        width: 512,
        height: 512,
        timestamp: Date.now(),
        format: "RGBA",
      });

      // Wait longer than expected interval (should trigger dropped frame)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Push second frame with old timestamp
      await bridge.pushVideoFrame({
        data: Buffer.alloc(512 * 512 * 4),
        width: 512,
        height: 512,
        timestamp: Date.now() - 100, // 100ms latency
        format: "RGBA",
      });

      const metrics = bridge.getMetrics();
      expect(metrics.droppedFrames).toBeGreaterThan(0);
    });

    it("should not push frames when not streaming", async () => {
      const frameHandler = vi.fn();
      bridge.on("video-frame", frameHandler);

      await bridge.pushVideoFrame({
        data: Buffer.alloc(512 * 512 * 4),
        width: 512,
        height: 512,
        timestamp: Date.now(),
        format: "RGBA",
      });

      expect(frameHandler).not.toHaveBeenCalled();
    });
  });

  describe("Audio Handling", () => {
    it("should push audio chunks", async () => {
      await bridge.start();

      const audioHandler = vi.fn();
      bridge.on("audio-chunk", audioHandler);

      const chunk: AudioChunk = {
        data: Buffer.alloc(1024),
        sampleRate: 16000,
        channels: 1,
        timestamp: Date.now(),
        format: "PCM",
      };

      await bridge.pushAudioChunk(chunk);

      expect(audioHandler).toHaveBeenCalledWith(chunk);
    });

    it("should track audio chunk metrics", async () => {
      await bridge.start();

      const chunk: AudioChunk = {
        data: Buffer.alloc(1024),
        sampleRate: 16000,
        channels: 1,
        timestamp: Date.now(),
        format: "PCM",
      };

      await bridge.pushAudioChunk(chunk);

      const metrics = bridge.getMetrics();
      expect(metrics.audioChunks).toBe(1);
    });

    it("should handle incoming audio", async () => {
      await bridge.start();

      const incomingAudioHandler = vi.fn();
      bridge.on("incoming-audio", incomingAudioHandler);

      const chunk: AudioChunk = {
        data: Buffer.alloc(1024),
        sampleRate: 16000,
        channels: 1,
        timestamp: Date.now(),
        format: "PCM",
      };

      bridge.handleIncomingAudio(chunk);

      expect(incomingAudioHandler).toHaveBeenCalledWith(chunk);
    });

    it("should not push audio when not streaming", async () => {
      const audioHandler = vi.fn();
      bridge.on("audio-chunk", audioHandler);

      await bridge.pushAudioChunk({
        data: Buffer.alloc(1024),
        sampleRate: 16000,
        channels: 1,
        timestamp: Date.now(),
        format: "PCM",
      });

      expect(audioHandler).not.toHaveBeenCalled();
    });
  });

  describe("Metrics", () => {
    it("should return current metrics", async () => {
      await bridge.start();

      const metrics = bridge.getMetrics();
      expect(metrics).toHaveProperty("videoFrames");
      expect(metrics).toHaveProperty("audioChunks");
      expect(metrics).toHaveProperty("droppedFrames");
      expect(metrics).toHaveProperty("avgLatency");
      expect(metrics).toHaveProperty("fps");
      expect(metrics).toHaveProperty("isStreaming");
    });

    it("should reset metrics", async () => {
      await bridge.start();

      // Generate some metrics
      await bridge.pushVideoFrame({
        data: Buffer.alloc(512 * 512 * 4),
        width: 512,
        height: 512,
        timestamp: Date.now(),
        format: "RGBA",
      });

      let metrics = bridge.getMetrics();
      expect(metrics.videoFrames).toBe(1);

      // Reset
      bridge.resetMetrics();

      metrics = bridge.getMetrics();
      expect(metrics.videoFrames).toBe(0);
      expect(metrics.audioChunks).toBe(0);
      expect(metrics.droppedFrames).toBe(0);
    });

    it("should calculate FPS", async () => {
      await bridge.start();

      // Push frames at ~30fps
      for (let i = 0; i < 5; i++) {
        await bridge.pushVideoFrame({
          data: Buffer.alloc(512 * 512 * 4),
          width: 512,
          height: 512,
          timestamp: Date.now(),
          format: "RGBA",
        });
        await new Promise((resolve) => setTimeout(resolve, 33)); // ~30fps
      }

      const metrics = bridge.getMetrics();
      // FPS should be close to 30 (allow some variance)
      expect(metrics.fps).toBeGreaterThan(0);
    });
  });

  describe("Performance", () => {
    it("should handle high frame rates", async () => {
      await bridge.start();

      const frameCount = 100;
      const frames: VideoFrame[] = [];

      for (let i = 0; i < frameCount; i++) {
        frames.push({
          data: Buffer.alloc(512 * 512 * 4),
          width: 512,
          height: 512,
          timestamp: Date.now(),
          format: "RGBA",
        });
      }

      // Push all frames rapidly
      const start = Date.now();
      for (const frame of frames) {
        await bridge.pushVideoFrame(frame);
      }
      const duration = Date.now() - start;

      const metrics = bridge.getMetrics();
      expect(metrics.videoFrames).toBe(frameCount);
      expect(duration).toBeLessThan(1000); // Should complete in <1s
    });

    it("should handle large audio chunks", async () => {
      await bridge.start();

      const chunkCount = 50;
      const chunks: AudioChunk[] = [];

      for (let i = 0; i < chunkCount; i++) {
        chunks.push({
          data: Buffer.alloc(16000), // 1 second of audio at 16kHz
          sampleRate: 16000,
          channels: 1,
          timestamp: Date.now(),
          format: "PCM",
        });
      }

      // Push all chunks
      for (const chunk of chunks) {
        await bridge.pushAudioChunk(chunk);
      }

      const metrics = bridge.getMetrics();
      expect(metrics.audioChunks).toBe(chunkCount);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid frame data gracefully", async () => {
      await bridge.start();

      const frameHandler = vi.fn();
      bridge.on("video-frame", frameHandler);

      // Push frame with empty buffer (edge case)
      await bridge.pushVideoFrame({
        data: Buffer.alloc(0),
        width: 0,
        height: 0,
        timestamp: Date.now(),
        format: "RGBA",
      });

      // Should still emit (validation is caller's responsibility)
      expect(frameHandler).toHaveBeenCalled();
    });

    it("should handle invalid audio data gracefully", async () => {
      await bridge.start();

      const audioHandler = vi.fn();
      bridge.on("audio-chunk", audioHandler);

      // Push chunk with empty buffer
      await bridge.pushAudioChunk({
        data: Buffer.alloc(0),
        sampleRate: 16000,
        channels: 1,
        timestamp: Date.now(),
        format: "PCM",
      });

      expect(audioHandler).toHaveBeenCalled();
    });
  });
});
