/**
 * WebRTC Streaming Server
 *
 * Handles real-time video/audio streaming from avatar to browser clients.
 * Uses WebSocket for signaling and WebRTC for media transport.
 *
 * Architecture:
 * - WebSocket signaling server (connection management, SDP exchange)
 * - WebRTC peer connections (media transport)
 * - Video source: LivePortrait service (30fps)
 * - Audio source: XTTS/Whisper services
 *
 * Performance targets:
 * - End-to-end latency: <200ms
 * - Video: 30fps smooth playback
 * - Audio: Bidirectional, low latency
 */

import type { WebSocket, WebSocketServer } from "ws";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export interface WebRTCConfig {
  /** WebSocket server port for signaling */
  signalingPort: number;
  /** STUN/TURN server configuration */
  iceServers?: RTCIceServer[];
  /** Enable debug logging */
  debug?: boolean;
  /** Maximum number of concurrent clients */
  maxClients?: number;
  /** Video codec preference */
  videoCodec?: "VP8" | "VP9" | "H264";
  /** Audio codec preference */
  audioCodec?: "opus" | "pcmu" | "pcma";
}

export interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface WebRTCPeer {
  id: string;
  ws: WebSocket;
  /** Client metadata */
  metadata?: Record<string, unknown>;
  /** Connection state */
  state: "connecting" | "connected" | "disconnected" | "failed";
  /** Created timestamp */
  createdAt: Date;
}

export interface SignalingMessage {
  type: "offer" | "answer" | "ice-candidate" | "error" | "ping" | "pong";
  peerId?: string;
  data?: unknown;
  error?: string;
}

export class WebRTCStreamingServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private peers: Map<string, WebRTCPeer> = new Map();
  private config: Required<WebRTCConfig>;

  constructor(config: WebRTCConfig) {
    super();
    this.config = {
      signalingPort: config.signalingPort,
      iceServers: config.iceServers || [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
      debug: config.debug ?? false,
      maxClients: config.maxClients ?? 100,
      videoCodec: config.videoCodec ?? "VP8",
      audioCodec: config.audioCodec ?? "opus",
    };
  }

  /**
   * Start the WebRTC signaling server
   */
  async start(): Promise<void> {
    if (this.wss) {
      throw new Error("WebRTC server already started");
    }

    const WS = await import("ws");
    this.wss = new WS.WebSocketServer({ port: this.config.signalingPort });

    this.wss.on("connection", (ws: WebSocket) => {
      this.handleNewConnection(ws);
    });

    this.wss.on("error", (error) => {
      this.log("error", "WebSocket server error:", error);
      this.emit("error", error);
    });

    this.log("info", `WebRTC signaling server started on port ${this.config.signalingPort}`);
    this.emit("started", { port: this.config.signalingPort });
  }

  /**
   * Stop the WebRTC server
   */
  async stop(): Promise<void> {
    if (!this.wss) {
      return;
    }

    // Disconnect all peers
    for (const peer of this.peers.values()) {
      this.disconnectPeer(peer.id, "Server shutdown");
    }

    // Close WebSocket server
    await new Promise<void>((resolve) => {
      this.wss!.close(() => {
        this.log("info", "WebRTC signaling server stopped");
        resolve();
      });
    });

    this.wss = null;
    this.emit("stopped");
  }

  /**
   * Handle new WebSocket connection
   */
  private handleNewConnection(ws: WebSocket): void {
    const peerId = randomUUID();

    // Check max clients
    if (this.peers.size >= this.config.maxClients) {
      this.log("warn", `Max clients reached (${this.config.maxClients}), rejecting connection`);
      ws.send(JSON.stringify({
        type: "error",
        error: "Server full",
      } satisfies SignalingMessage));
      ws.close();
      return;
    }

    const peer: WebRTCPeer = {
      id: peerId,
      ws,
      state: "connecting",
      createdAt: new Date(),
    };

    this.peers.set(peerId, peer);
    this.log("info", `New peer connected: ${peerId} (${this.peers.size} total)`);

    // Send initial config to client
    ws.send(JSON.stringify({
      type: "config",
      peerId,
      data: {
        iceServers: this.config.iceServers,
        videoCodec: this.config.videoCodec,
        audioCodec: this.config.audioCodec,
      },
    }));

    // Handle messages
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as SignalingMessage;
        this.handleSignalingMessage(peerId, message);
      } catch (error) {
        this.log("error", `Failed to parse message from ${peerId}:`, error);
        this.sendError(peerId, "Invalid message format");
      }
    });

    // Handle disconnection
    ws.on("close", () => {
      this.disconnectPeer(peerId, "Client disconnected");
    });

    ws.on("error", (error) => {
      this.log("error", `WebSocket error for peer ${peerId}:`, error);
      this.disconnectPeer(peerId, "WebSocket error");
    });

    // Ping/pong for keep-alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) { // OPEN
        ws.send(JSON.stringify({ type: "ping" } satisfies SignalingMessage));
      }
    }, 30000); // 30 seconds

    ws.on("close", () => clearInterval(pingInterval));

    this.emit("peer-connected", peer);
  }

  /**
   * Handle signaling messages
   */
  private handleSignalingMessage(peerId: string, message: SignalingMessage): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      this.log("warn", `Message from unknown peer: ${peerId}`);
      return;
    }

    this.log("debug", `Received ${message.type} from ${peerId}`);

    switch (message.type) {
      case "offer":
        this.handleOffer(peerId, message.data as RTCSessionDescriptionInit);
        break;
      case "answer":
        this.handleAnswer(peerId, message.data as RTCSessionDescriptionInit);
        break;
      case "ice-candidate":
        this.handleIceCandidate(peerId, message.data as RTCIceCandidateInit);
        break;
      case "pong":
        // Keep-alive response
        break;
      default:
        this.log("warn", `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle WebRTC offer from client
   */
  private handleOffer(peerId: string, offer: RTCSessionDescriptionInit): void {
    this.emit("offer", { peerId, offer });
    this.log("debug", `Received offer from ${peerId}`);
  }

  /**
   * Handle WebRTC answer from client
   */
  private handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): void {
    this.emit("answer", { peerId, answer });
    this.log("debug", `Received answer from ${peerId}`);
  }

  /**
   * Handle ICE candidate from client
   */
  private handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    this.emit("ice-candidate", { peerId, candidate });
    this.log("debug", `Received ICE candidate from ${peerId}`);
  }

  /**
   * Send SDP answer to client
   */
  sendAnswer(peerId: string, answer: RTCSessionDescriptionInit): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      this.log("warn", `Cannot send answer to unknown peer: ${peerId}`);
      return;
    }

    peer.ws.send(JSON.stringify({
      type: "answer",
      peerId,
      data: answer,
    } satisfies SignalingMessage));

    peer.state = "connected";
  }

  /**
   * Send ICE candidate to client
   */
  sendIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      this.log("warn", `Cannot send ICE candidate to unknown peer: ${peerId}`);
      return;
    }

    peer.ws.send(JSON.stringify({
      type: "ice-candidate",
      peerId,
      data: candidate,
    } satisfies SignalingMessage));
  }

  /**
   * Send error to client
   */
  private sendError(peerId: string, error: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }

    peer.ws.send(JSON.stringify({
      type: "error",
      error,
    } satisfies SignalingMessage));
  }

  /**
   * Disconnect a peer
   */
  private disconnectPeer(peerId: string, reason?: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }

    this.log("info", `Disconnecting peer ${peerId}${reason ? `: ${reason}` : ""}`);

    peer.state = "disconnected";
    peer.ws.close();
    this.peers.delete(peerId);

    this.emit("peer-disconnected", { peerId, reason });
  }

  /**
   * Get all connected peers
   */
  getPeers(): WebRTCPeer[] {
    return Array.from(this.peers.values());
  }

  /**
   * Get peer count
   */
  getPeerCount(): number {
    return this.peers.size;
  }

  /**
   * Broadcast message to all connected peers
   */
  broadcast(message: Omit<SignalingMessage, "peerId">): void {
    for (const peer of this.peers.values()) {
      if (peer.ws.readyState === 1) { // OPEN
        peer.ws.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Internal logging
   */
  private log(level: "debug" | "info" | "warn" | "error", ...args: unknown[]): void {
    if (level === "debug" && !this.config.debug) {
      return;
    }
    const prefix = `[WebRTC ${level.toUpperCase()}]`;
    console[level === "error" ? "error" : "log"](prefix, ...args);
  }
}

/**
 * Create and start a WebRTC streaming server
 */
export async function createWebRTCServer(config: WebRTCConfig): Promise<WebRTCStreamingServer> {
  const server = new WebRTCStreamingServer(config);
  await server.start();
  return server;
}
