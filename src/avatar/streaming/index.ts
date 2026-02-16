/**
 * Avatar WebRTC Streaming - Main Integration Module
 *
 * Provides high-level API for streaming avatar video/audio via WebRTC.
 */

export {
  WebRTCStreamingServer,
  createWebRTCServer,
  type WebRTCConfig,
  type WebRTCPeer,
  type SignalingMessage,
  type RTCIceServer,
} from "./webrtc-server.js";

export {
  MediaBridge,
  createMediaBridge,
  connectMediaBridge,
  type MediaBridgeConfig,
  type VideoFrame,
  type AudioChunk,
} from "./media-bridge.js";

import { createWebRTCServer, type WebRTCConfig } from "./webrtc-server.js";
import { createMediaBridge, connectMediaBridge, type MediaBridgeConfig } from "./media-bridge.js";
import type { WebRTCStreamingServer } from "./webrtc-server.js";
import type { MediaBridge } from "./media-bridge.js";

/**
 * Complete streaming system configuration
 */
export interface StreamingSystemConfig {
  /** WebRTC server config */
  webrtc: WebRTCConfig;
  /** Media bridge config */
  media?: MediaBridgeConfig;
}

/**
 * Streaming system instance
 */
export interface StreamingSystem {
  /** WebRTC signaling server */
  server: WebRTCStreamingServer;
  /** Media bridge for video/audio */
  bridge: MediaBridge;
  /** Start the streaming system */
  start(): Promise<void>;
  /** Stop the streaming system */
  stop(): Promise<void>;
  /** Get system status */
  getStatus(): {
    peerCount: number;
    metrics: ReturnType<MediaBridge["getMetrics"]>;
  };
}

/**
 * Create a complete streaming system
 *
 * @example
 * ```typescript
 * const system = await createStreamingSystem({
 *   webrtc: {
 *     signalingPort: 8081,
 *     debug: true,
 *   },
 *   media: {
 *     videoFps: 30,
 *     videoWidth: 512,
 *     videoHeight: 512,
 *   },
 * });
 *
 * await system.start();
 *
 * // Push video frames from LivePortrait
 * system.bridge.pushVideoFrame({
 *   data: frameBuffer,
 *   width: 512,
 *   height: 512,
 *   timestamp: Date.now(),
 *   format: 'RGBA',
 * });
 *
 * // Push audio from XTTS
 * system.bridge.pushAudioChunk({
 *   data: audioBuffer,
 *   sampleRate: 16000,
 *   channels: 1,
 *   timestamp: Date.now(),
 *   format: 'PCM',
 * });
 * ```
 */
export async function createStreamingSystem(
  config: StreamingSystemConfig,
): Promise<StreamingSystem> {
  const server = await createWebRTCServer(config.webrtc);
  const bridge = createMediaBridge(config.media);

  // Connect bridge to server
  connectMediaBridge(bridge, server);

  return {
    server,
    bridge,
    async start() {
      await bridge.start();
      // Server is already started by createWebRTCServer
    },
    async stop() {
      await bridge.stop();
      await server.stop();
    },
    getStatus() {
      return {
        peerCount: server.getPeerCount(),
        metrics: bridge.getMetrics(),
      };
    },
  };
}
