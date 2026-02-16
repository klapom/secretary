/**
 * Media Bridge for WebRTC Streaming
 *
 * Bridges avatar video (LivePortrait) and audio (XTTS/Whisper) to WebRTC streams.
 * Handles frame encoding, audio processing, and RTP packaging.
 */

import { EventEmitter } from "node:events";
import type { WebRTCStreamingServer } from "./webrtc-server.js";

export interface MediaBridgeConfig {
  /** Target video framerate (fps) */
  videoFps?: number;
  /** Video resolution */
  videoWidth?: number;
  videoHeight?: number;
  /** Audio sample rate (Hz) */
  audioSampleRate?: number;
  /** Audio channels */
  audioChannels?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface VideoFrame {
  /** Frame data (RGBA or encoded) */
  data: Buffer;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Frame timestamp (ms) */
  timestamp: number;
  /** Frame format */
  format?: "RGBA" | "YUV" | "JPEG" | "PNG";
}

export interface AudioChunk {
  /** Audio data (PCM or encoded) */
  data: Buffer;
  /** Sample rate (Hz) */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Timestamp (ms) */
  timestamp: number;
  /** Audio format */
  format?: "PCM" | "OPUS" | "MP3";
}

export class MediaBridge extends EventEmitter {
  private config: Required<MediaBridgeConfig>;
  private videoInterval: NodeJS.Timeout | null = null;
  private isStreaming = false;
  private frameCount = 0;
  private audioChunkCount = 0;

  // Performance metrics
  private metrics = {
    videoFrames: 0,
    audioChunks: 0,
    droppedFrames: 0,
    avgLatency: 0,
    lastFrameTime: 0,
  };

  constructor(config: MediaBridgeConfig = {}) {
    super();
    this.config = {
      videoFps: config.videoFps ?? 30,
      videoWidth: config.videoWidth ?? 512,
      videoHeight: config.videoHeight ?? 512,
      audioSampleRate: config.audioSampleRate ?? 16000,
      audioChannels: config.audioChannels ?? 1,
      debug: config.debug ?? false,
    };
  }

  /**
   * Start streaming media
   */
  async start(): Promise<void> {
    if (this.isStreaming) {
      this.log("warn", "Media bridge already streaming");
      return;
    }

    this.isStreaming = true;
    this.frameCount = 0;
    this.audioChunkCount = 0;

    this.log("info", `Media bridge started (${this.config.videoFps}fps, ${this.config.videoWidth}x${this.config.videoHeight})`);
    this.emit("started");
  }

  /**
   * Stop streaming media
   */
  async stop(): Promise<void> {
    if (!this.isStreaming) {
      return;
    }

    this.isStreaming = false;

    if (this.videoInterval) {
      clearInterval(this.videoInterval);
      this.videoInterval = null;
    }

    this.log("info", "Media bridge stopped");
    this.emit("stopped");
  }

  /**
   * Push video frame to stream
   *
   * This should be called by the LivePortrait service when a new frame is ready.
   */
  async pushVideoFrame(frame: VideoFrame): Promise<void> {
    if (!this.isStreaming) {
      this.log("warn", "Cannot push frame: not streaming");
      return;
    }

    const now = Date.now();
    const latency = now - frame.timestamp;

    // Update metrics
    this.metrics.videoFrames++;
    this.metrics.avgLatency = (this.metrics.avgLatency * 0.9) + (latency * 0.1);
    this.metrics.lastFrameTime = now;

    // Check for dropped frames (if time since last frame > expected interval)
    const expectedInterval = 1000 / this.config.videoFps;
    if (this.frameCount > 0 && latency > expectedInterval * 1.5) {
      this.metrics.droppedFrames++;
      this.log("warn", `Potential dropped frame: latency ${latency}ms > ${expectedInterval}ms`);
    }

    this.frameCount++;

    // Emit frame for WebRTC transmission
    this.emit("video-frame", frame);

    this.log("debug", `Video frame ${this.frameCount}: ${frame.width}x${frame.height}, latency: ${latency}ms`);
  }

  /**
   * Push audio chunk to stream
   *
   * This should be called by the XTTS service for outbound audio.
   */
  async pushAudioChunk(chunk: AudioChunk): Promise<void> {
    if (!this.isStreaming) {
      this.log("warn", "Cannot push audio: not streaming");
      return;
    }

    this.audioChunkCount++;
    this.metrics.audioChunks++;

    // Emit audio for WebRTC transmission
    this.emit("audio-chunk", chunk);

    this.log("debug", `Audio chunk ${this.audioChunkCount}: ${chunk.data.length} bytes, ${chunk.sampleRate}Hz`);
  }

  /**
   * Handle incoming audio from client (for Whisper processing)
   */
  handleIncomingAudio(chunk: AudioChunk): void {
    this.emit("incoming-audio", chunk);
    this.log("debug", `Incoming audio: ${chunk.data.length} bytes`);
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      fps: this.calculateCurrentFps(),
      isStreaming: this.isStreaming,
    };
  }

  /**
   * Calculate current FPS
   */
  private calculateCurrentFps(): number {
    const now = Date.now();
    const timeSinceLastFrame = now - this.metrics.lastFrameTime;
    if (timeSinceLastFrame > 0 && this.frameCount > 0) {
      return Math.round(1000 / timeSinceLastFrame);
    }
    return 0;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      videoFrames: 0,
      audioChunks: 0,
      droppedFrames: 0,
      avgLatency: 0,
      lastFrameTime: 0,
    };
  }

  /**
   * Internal logging
   */
  private log(level: "debug" | "info" | "warn" | "error", ...args: unknown[]): void {
    if (level === "debug" && !this.config.debug) {
      return;
    }
    const prefix = `[MediaBridge ${level.toUpperCase()}]`;
    console[level === "error" ? "error" : "log"](prefix, ...args);
  }
}

/**
 * Connect media bridge to WebRTC server
 *
 * This establishes the data flow:
 * LivePortrait → MediaBridge → WebRTC → Browser
 * Browser → WebRTC → MediaBridge → Whisper
 */
export function connectMediaBridge(
  bridge: MediaBridge,
  server: WebRTCStreamingServer,
): void {
  // Forward video frames to WebRTC
  bridge.on("video-frame", (frame: VideoFrame) => {
    // In real implementation, this would encode and send via WebRTC data channel
    // For now, emit for external handling
    server.emit("media-video-frame", frame);
  });

  // Forward audio chunks to WebRTC
  bridge.on("audio-chunk", (chunk: AudioChunk) => {
    // In real implementation, this would encode and send via WebRTC
    server.emit("media-audio-chunk", chunk);
  });

  // Handle incoming audio from WebRTC
  server.on("incoming-audio", (chunk: AudioChunk) => {
    bridge.handleIncomingAudio(chunk);
  });
}

/**
 * Create a media bridge instance
 */
export function createMediaBridge(config?: MediaBridgeConfig): MediaBridge {
  return new MediaBridge(config);
}
