import { useState, useEffect, useRef, useCallback } from "react";
import SimplePeer from "simple-peer";
import type { ConnectionState } from "../types";

const SIGNALING_URL = import.meta.env.VITE_WEBRTC_URL || "ws://localhost:8080";

export function useWebRTC() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const peerRef = useRef<unknown>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
  }, [localStream]);

  const connect = useCallback(async () => {
    try {
      setConnectionState("connecting");

      // Get user media (microphone)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      setLocalStream(stream);

      // Connect to signaling server
      const ws = new WebSocket(SIGNALING_URL);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        console.log("WebSocket connected");

        // Initialize peer connection
        const peer = new SimplePeer({
          initiator: true,
          stream,
          trickle: false,
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
            ],
          },
        });

        peerRef.current = peer;

        peer.on("signal", (data) => {
          ws.send(JSON.stringify({ type: "offer", data }));
        });

        peer.on("stream", (stream) => {
          console.log("Received remote stream");
          setRemoteStream(stream);
          setConnectionState("connected");
        });

        peer.on("connect", () => {
          console.log("Peer connection established");
          setConnectionState("connected");
        });

        peer.on("error", (err) => {
          console.error("Peer connection error:", err);
          setConnectionState("failed");
          setTimeout(() => {
            setConnectionState("reconnecting");
            connect();
          }, 3000);
        });

        peer.on("close", () => {
          console.log("Peer connection closed");
          setConnectionState("disconnected");
        });

        ws.addEventListener("message", (event) => {
          const message = JSON.parse(event.data);
          if (message.type === "answer") {
            peer.signal(message.data);
          }
        });
      });

      ws.addEventListener("error", (error) => {
        console.error("WebSocket error:", error);
        setConnectionState("failed");
      });

      ws.addEventListener("close", () => {
        console.log("WebSocket closed");
        if (connectionState === "connected" || connectionState === "connecting") {
          setConnectionState("reconnecting");
          reconnectTimeoutRef.current = setTimeout(() => connect(), 3000);
        }
      });
    } catch (error) {
      console.error("Failed to connect:", error);
      setConnectionState("failed");
    }
  }, [connectionState]);

  const disconnect = useCallback(() => {
    cleanup();
    setConnectionState("disconnected");
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    connectionState,
    localStream,
    remoteStream,
    connect,
    disconnect,
  };
}
