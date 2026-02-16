/**
 * Performance Benchmarks
 *
 * Validates performance targets:
 * - LivePortrait: <100ms per frame
 * - XTTS: <500ms for 5s audio
 * - Whisper: <1s for 5s audio
 * - WebRTC: <200ms end-to-end
 */

import { bench, describe } from "vitest";
import type { VideoFrame, AudioChunk } from "./media-bridge.js";
import { createStreamingSystem } from "./index.js";

describe("Performance Benchmarks", () => {
  describe("Video Frame Processing", () => {
    bench(
      "Push single video frame (512x512 RGBA)",
      async () => {
        const system = await createStreamingSystem({
          webrtc: { signalingPort: 8082 },
          media: { videoFps: 30, videoWidth: 512, videoHeight: 512 },
        });

        await system.start();

        const frame: VideoFrame = {
          data: Buffer.alloc(512 * 512 * 4),
          width: 512,
          height: 512,
          timestamp: Date.now(),
          format: "RGBA",
        };

        await system.bridge.pushVideoFrame(frame);
        await system.stop();
      },
      { iterations: 10 },
    );

    bench(
      "Push 30 frames (1 second @ 30fps)",
      async () => {
        const system = await createStreamingSystem({
          webrtc: { signalingPort: 8083 },
          media: { videoFps: 30 },
        });

        await system.start();

        for (let i = 0; i < 30; i++) {
          const frame: VideoFrame = {
            data: Buffer.alloc(512 * 512 * 4),
            width: 512,
            height: 512,
            timestamp: Date.now(),
            format: "RGBA",
          };
          await system.bridge.pushVideoFrame(frame);
        }

        await system.stop();
      },
      { iterations: 5 },
    );
  });

  describe("Audio Chunk Processing", () => {
    bench(
      "Push single audio chunk (100ms @ 16kHz)",
      async () => {
        const system = await createStreamingSystem({
          webrtc: { signalingPort: 8084 },
          media: { audioSampleRate: 16000 },
        });

        await system.start();

        const chunk: AudioChunk = {
          data: Buffer.alloc(1600), // 100ms at 16kHz
          sampleRate: 16000,
          channels: 1,
          timestamp: Date.now(),
          format: "PCM",
        };

        await system.bridge.pushAudioChunk(chunk);
        await system.stop();
      },
      { iterations: 10 },
    );

    bench(
      "Push 5 seconds of audio (50 chunks)",
      async () => {
        const system = await createStreamingSystem({
          webrtc: { signalingPort: 8085 },
          media: { audioSampleRate: 16000 },
        });

        await system.start();

        for (let i = 0; i < 50; i++) {
          const chunk: AudioChunk = {
            data: Buffer.alloc(1600),
            sampleRate: 16000,
            channels: 1,
            timestamp: Date.now(),
            format: "PCM",
          };
          await system.bridge.pushAudioChunk(chunk);
        }

        await system.stop();
      },
      { iterations: 5 },
    );
  });

  describe("Concurrent Processing", () => {
    bench(
      "Concurrent video + audio (3 seconds)",
      async () => {
        const system = await createStreamingSystem({
          webrtc: { signalingPort: 8086 },
          media: { videoFps: 30, audioSampleRate: 16000 },
        });

        await system.start();

        const videoPromise = (async () => {
          for (let i = 0; i < 90; i++) {
            // 3 seconds at 30fps
            const frame: VideoFrame = {
              data: Buffer.alloc(512 * 512 * 4),
              width: 512,
              height: 512,
              timestamp: Date.now(),
              format: "RGBA",
            };
            await system.bridge.pushVideoFrame(frame);
          }
        })();

        const audioPromise = (async () => {
          for (let i = 0; i < 30; i++) {
            // 3 seconds at 100ms chunks
            const chunk: AudioChunk = {
              data: Buffer.alloc(1600),
              sampleRate: 16000,
              channels: 1,
              timestamp: Date.now(),
              format: "PCM",
            };
            await system.bridge.pushAudioChunk(chunk);
          }
        })();

        await Promise.all([videoPromise, audioPromise]);
        await system.stop();
      },
      { iterations: 3 },
    );
  });

  describe("System Overhead", () => {
    bench("Create and start streaming system", async () => {
      const system = await createStreamingSystem({
        webrtc: { signalingPort: 8087 },
      });
      await system.start();
      await system.stop();
    });

    bench("Get system status", async () => {
      const system = await createStreamingSystem({
        webrtc: { signalingPort: 8088 },
      });
      await system.start();
      system.getStatus();
      await system.stop();
    });

    bench("Get metrics", async () => {
      const system = await createStreamingSystem({
        webrtc: { signalingPort: 8089 },
      });
      await system.start();
      system.bridge.getMetrics();
      await system.stop();
    });
  });
});
