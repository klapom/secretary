/**
 * WebRTC Server Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WebRTCStreamingServer } from "./webrtc-server.js";
import WebSocket from "ws";

describe("WebRTCStreamingServer", () => {
  let server: WebRTCStreamingServer;
  const testPort = 8081;

  beforeEach(async () => {
    server = new WebRTCStreamingServer({
      signalingPort: testPort,
      debug: false,
      maxClients: 10,
    });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe("Server Lifecycle", () => {
    it("should start signaling server", async () => {
      await server.start();
      expect(server.getPeerCount()).toBe(0);
    });

    it("should stop signaling server", async () => {
      await server.start();
      await server.stop();
      expect(server.getPeerCount()).toBe(0);
    });

    it("should emit started event", async () => {
      const startedHandler = vi.fn();
      server.on("started", startedHandler);

      await server.start();
      expect(startedHandler).toHaveBeenCalledWith({ port: testPort });
    });

    it("should emit stopped event", async () => {
      const stoppedHandler = vi.fn();
      server.on("stopped", stoppedHandler);

      await server.start();
      await server.stop();
      expect(stoppedHandler).toHaveBeenCalled();
    });

    it("should throw if started twice", async () => {
      await server.start();
      await expect(server.start()).rejects.toThrow("already started");
    });
  });

  describe("Client Connections", () => {
    it("should accept client connections", async () => {
      await server.start();

      const peerConnectedHandler = vi.fn();
      server.on("peer-connected", peerConnectedHandler);

      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.on("open", resolve));

      // Wait for connection to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(peerConnectedHandler).toHaveBeenCalled();
      expect(server.getPeerCount()).toBe(1);

      client.close();
    });

    it("should handle client disconnections", async () => {
      await server.start();

      const peerDisconnectedHandler = vi.fn();
      server.on("peer-disconnected", peerDisconnectedHandler);

      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.on("open", resolve));
      await new Promise((resolve) => setTimeout(resolve, 100));

      client.close();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(peerDisconnectedHandler).toHaveBeenCalled();
      expect(server.getPeerCount()).toBe(0);
    });

    it("should reject connections when server is full", async () => {
      // Create server with max 1 client
      server = new WebRTCStreamingServer({
        signalingPort: testPort,
        maxClients: 1,
      });
      await server.start();

      // Connect first client (should succeed)
      const client1 = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client1.on("open", resolve));
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(server.getPeerCount()).toBe(1);

      // Connect second client (should be rejected)
      const client2 = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client2.on("open", resolve));

      // Wait for rejection
      await new Promise((resolve) => {
        client2.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === "error") {
            resolve(undefined);
          }
        });
      });

      expect(server.getPeerCount()).toBe(1);

      client1.close();
      client2.close();
    });
  });

  describe("Signaling Messages", () => {
    it("should receive offer from client", async () => {
      await server.start();

      const offerHandler = vi.fn();
      server.on("offer", offerHandler);

      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.on("open", resolve));

      // Wait for config message
      await new Promise((resolve) => {
        client.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === "config") {
            resolve(undefined);
          }
        });
      });

      // Send offer
      const offer = {
        type: "offer",
        sdp: "fake-sdp",
      };
      client.send(JSON.stringify({ type: "offer", data: offer }));

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(offerHandler).toHaveBeenCalled();

      client.close();
    });

    it("should send answer to client", async () => {
      await server.start();

      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.on("open", resolve));

      let peerId: string | undefined;

      // Wait for config message and get peerId
      await new Promise((resolve) => {
        client.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === "config") {
            peerId = message.peerId;
            resolve(undefined);
          }
        });
      });

      // Send answer
      const answer = { type: "answer", sdp: "fake-sdp" };
      server.sendAnswer(peerId!, answer as RTCSessionDescriptionInit);

      // Verify answer received
      await new Promise((resolve) => {
        client.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === "answer") {
            expect(message.data).toEqual(answer);
            resolve(undefined);
          }
        });
      });

      client.close();
    });

    it("should handle ICE candidates", async () => {
      await server.start();

      const iceCandidateHandler = vi.fn();
      server.on("ice-candidate", iceCandidateHandler);

      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.on("open", resolve));

      // Wait for config
      await new Promise((resolve) => {
        client.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === "config") {
            resolve(undefined);
          }
        });
      });

      // Send ICE candidate
      const candidate = {
        candidate: "candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host",
        sdpMLineIndex: 0,
        sdpMid: "0",
      };
      client.send(JSON.stringify({ type: "ice-candidate", data: candidate }));

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(iceCandidateHandler).toHaveBeenCalled();

      client.close();
    });

    it("should handle ping/pong", async () => {
      await server.start();

      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.on("open", resolve));

      // Wait for ping
      await new Promise((resolve) => {
        client.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === "ping") {
            // Send pong
            client.send(JSON.stringify({ type: "pong" }));
            resolve(undefined);
          }
        });
      });

      client.close();
    });
  });

  describe("Broadcasting", () => {
    it("should broadcast to all clients", async () => {
      await server.start();

      const clients: WebSocket[] = [];

      // Connect 3 clients
      for (let i = 0; i < 3; i++) {
        const client = new WebSocket(`ws://localhost:${testPort}`);
        await new Promise((resolve) => client.on("open", resolve));
        clients.push(client);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(server.getPeerCount()).toBe(3);

      // Broadcast message
      const broadcastMessage = { type: "test-broadcast", data: "hello" };
      server.broadcast(broadcastMessage);

      // Verify all clients received broadcast
      const receivedCount = await Promise.all(
        clients.map((client) => {
          return new Promise((resolve) => {
            client.on("message", (data) => {
              const message = JSON.parse(data.toString());
              if (message.type === "test-broadcast") {
                resolve(1);
              }
            });
            // Timeout after 1 second
            setTimeout(() => resolve(0), 1000);
          });
        }),
      );

      expect(receivedCount.filter(Boolean).length).toBe(3);

      clients.forEach((client) => client.close());
    });
  });

  describe("Peer Management", () => {
    it("should get all peers", async () => {
      await server.start();

      const clients: WebSocket[] = [];

      // Connect 2 clients
      for (let i = 0; i < 2; i++) {
        const client = new WebSocket(`ws://localhost:${testPort}`);
        await new Promise((resolve) => client.on("open", resolve));
        clients.push(client);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const peers = server.getPeers();
      expect(peers).toHaveLength(2);
      expect(peers[0]).toHaveProperty("id");
      expect(peers[0]).toHaveProperty("state");
      expect(peers[0]).toHaveProperty("createdAt");

      clients.forEach((client) => client.close());
    });

    it("should track peer count", async () => {
      await server.start();
      expect(server.getPeerCount()).toBe(0);

      const client = new WebSocket(`ws://localhost:${testPort}`);
      await new Promise((resolve) => client.on("open", resolve));
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(server.getPeerCount()).toBe(1);

      client.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(server.getPeerCount()).toBe(0);
    });
  });
});
