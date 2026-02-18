export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "failed"
  | "reconnecting";

export interface Character {
  id: string;
  name: string;
  imageUrl: string;
  voiceId?: string;
}

export interface WebRTCConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
}

export interface AudioStreamConfig {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}
