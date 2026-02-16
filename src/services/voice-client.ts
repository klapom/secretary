/**
 * Voice Pipeline Client
 * TypeScript client for XTTS + Whisper voice service
 */

import type { Readable } from "node:stream";
import { fetch } from "undici";

export interface VoiceServiceConfig {
  baseUrl: string;
  timeout?: number;
}

export interface STTResult {
  text: string;
  language: string;
  confidence: number;
  duration: number;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    confidence: number;
  }>;
}

export interface TTSRequest {
  text: string;
  language?: string;
  voiceId?: string;
  speed?: number;
  emotion?: string;
}

export interface VoiceProfile {
  name: string;
  description?: string;
  language: string;
}

export interface HealthStatus {
  status: string;
  models: {
    whisper: {
      loaded: boolean;
      model: string;
      device: string;
      computeType: string;
    };
    xtts: {
      loaded: boolean;
      status: string;
    };
  };
  gpu: {
    available: boolean;
    deviceCount: number;
    deviceName: string | null;
  };
}

/**
 * Voice Pipeline Client
 */
export class VoiceClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: VoiceServiceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeout = config.timeout || 30000;
  }

  /**
   * Check service health
   */
  async health(): Promise<HealthStatus> {
    const response = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return (await response.json()) as HealthStatus;
  }

  /**
   * Transcribe audio to text (Speech-to-Text)
   */
  async transcribe(
    audio: Buffer | Readable,
    language?: string,
    options: {
      task?: "transcribe" | "translate";
      includeSegments?: boolean;
    } = {},
  ): Promise<STTResult> {
    const formData = new FormData();

    // Convert buffer to blob
    const audioBlob = audio instanceof Buffer ? new Blob([audio]) : audio;
    formData.append("file", audioBlob, "audio.mp3");

    if (language) {
      formData.append("language", language);
    }

    if (options.task) {
      formData.append("task", options.task);
    }

    if (options.includeSegments) {
      formData.append("include_segments", "true");
    }

    const response = await fetch(`${this.baseUrl}/stt/transcribe`, {
      method: "POST",
      body: formData as unknown as BodyInit,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Transcription failed: ${error.detail || response.statusText}`);
    }

    return (await response.json()) as STTResult;
  }

  /**
   * Synthesize speech from text (Text-to-Speech)
   * NOTE: Currently returns 501 - XTTS not implemented yet
   */
  async synthesize(request: TTSRequest): Promise<Buffer> {
    const response = await fetch(`${this.baseUrl}/tts/synthesize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Synthesis failed: ${error.detail || error.message || response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Clone a voice from reference audio
   * NOTE: Requires XTTS implementation
   */
  async cloneVoice(
    name: string,
    referenceAudio: Buffer,
    options: {
      description?: string;
      language?: string;
    } = {},
  ): Promise<VoiceProfile> {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("file", new Blob([referenceAudio]), "reference.wav");

    if (options.description) {
      formData.append("description", options.description);
    }

    if (options.language) {
      formData.append("language", options.language);
    }

    const response = await fetch(`${this.baseUrl}/voice/clone`, {
      method: "POST",
      body: formData as unknown as BodyInit,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Voice cloning failed: ${error.message || response.statusText}`);
    }

    return (await response.json()) as VoiceProfile;
  }

  /**
   * List available voice profiles
   */
  async listVoiceProfiles(): Promise<VoiceProfile[]> {
    const response = await fetch(`${this.baseUrl}/voice/profiles`, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to list voice profiles: ${response.statusText}`);
    }

    const data = (await response.json()) as { profiles: VoiceProfile[] };
    return data.profiles;
  }

  /**
   * Check if service is ready
   */
  async isReady(): Promise<boolean> {
    try {
      const health = await this.health();
      return health.status === "healthy";
    } catch {
      return false;
    }
  }

  /**
   * Get service configuration
   */
  getConfig(): VoiceServiceConfig {
    return {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
    };
  }
}

/**
 * Create voice client instance
 */
export function createVoiceClient(
  baseUrl: string = "http://localhost:8765",
  timeout?: number,
): VoiceClient {
  return new VoiceClient({ baseUrl, timeout });
}

/**
 * Default voice client instance
 */
export const defaultVoiceClient = createVoiceClient();
