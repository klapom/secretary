/**
 * Avatar Pipeline Orchestrator
 *
 * Connects WebRTC streaming, Whisper STT, XTTS TTS, and LivePortrait
 * into a unified real-time avatar pipeline.
 *
 * Audio pipeline: Browser mic → WebRTC → Whisper STT → (echo for MVP) → XTTS TTS → WebRTC → Browser speaker
 * Video pipeline: Active character image → LivePortrait (10fps) → WebRTC → Browser video
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getCharacterDatabase, type CharacterDatabase } from "../characters/db.js";
import { createStreamingSystem, type StreamingSystem, type AudioChunk } from "./streaming/index.js";

// Service URLs (all local Docker services)
const WHISPER_URL = process.env.WHISPER_URL || "http://localhost:8083";
const XTTS_URL = process.env.XTTS_URL || "http://localhost:8082";
const LIVEPORTRAIT_URL = process.env.LIVEPORTRAIT_URL || "http://localhost:8081";

// LivePortrait rendering rate — ~80ms/frame means max ~12fps, use 10fps to be safe
const VIDEO_FPS = 10;
const VIDEO_FRAME_INTERVAL = 1000 / VIDEO_FPS;

export interface OrchestratorConfig {
  signalingPort?: number;
  characterDbPath?: string;
  characterAssetsDir?: string;
  debug?: boolean;
}

export class AvatarOrchestrator {
  private system: StreamingSystem | null = null;
  private characterDb: CharacterDatabase | null = null;
  private videoLoopTimer: NodeJS.Timeout | null = null;
  private activeCharacterImage: Buffer | null = null;
  private isRunning = false;
  private config: Required<OrchestratorConfig>;
  private audioAccumulator: Buffer[] = [];
  private audioAccumulatorTimeout: NodeJS.Timeout | null = null;

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      signalingPort: config.signalingPort ?? 8086,
      characterDbPath: config.characterDbPath ?? path.join(process.cwd(), "data", "characters.db"),
      characterAssetsDir:
        config.characterAssetsDir ?? path.join(process.cwd(), "data", "character-assets"),
      debug: config.debug ?? false,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.log("Starting avatar orchestrator...");

    // Create streaming system (WebRTC + MediaBridge)
    this.system = await createStreamingSystem({
      webrtc: {
        signalingPort: this.config.signalingPort,
        debug: this.config.debug,
      },
      media: {
        videoFps: VIDEO_FPS,
        videoWidth: 512,
        videoHeight: 512,
        audioSampleRate: 16000,
        audioChannels: 1,
        debug: this.config.debug,
      },
    });

    await this.system.start();

    // Initialize character DB
    this.characterDb = getCharacterDatabase({
      dbPath: this.config.characterDbPath,
      assetsDir: this.config.characterAssetsDir,
    });

    // Set up audio pipeline: incoming audio → STT → TTS → outgoing audio
    this.system.bridge.on("incoming-audio", (chunk: AudioChunk) => {
      this.handleIncomingAudio(chunk);
    });

    // Load active character and start video loop
    await this.loadActiveCharacterImage();
    this.startVideoLoop();

    this.isRunning = true;
    this.log("Avatar orchestrator started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.stopVideoLoop();

    if (this.audioAccumulatorTimeout) {
      clearTimeout(this.audioAccumulatorTimeout);
      this.audioAccumulatorTimeout = null;
    }

    if (this.system) {
      await this.system.stop();
      this.system = null;
    }

    this.isRunning = false;
    this.log("Avatar orchestrator stopped");
  }

  /**
   * Reload the active character image (call after character switch)
   */
  async reloadCharacter(): Promise<void> {
    await this.loadActiveCharacterImage();
    this.log("Character reloaded");
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      hasActiveCharacter: this.activeCharacterImage !== null,
      streaming: this.system?.getStatus() ?? null,
    };
  }

  // --- Audio Pipeline ---

  private handleIncomingAudio(chunk: AudioChunk): void {
    // Accumulate audio chunks, then send to Whisper after a pause (VAD-lite)
    this.audioAccumulator.push(chunk.data);

    // Reset the silence timer — flush after 1.5s of no new chunks
    if (this.audioAccumulatorTimeout) {
      clearTimeout(this.audioAccumulatorTimeout);
    }
    this.audioAccumulatorTimeout = setTimeout(() => {
      void this.flushAudioToSTT();
    }, 1500);
  }

  private async flushAudioToSTT(): Promise<void> {
    if (this.audioAccumulator.length === 0) {
      return;
    }

    const combined = Buffer.concat(this.audioAccumulator);
    this.audioAccumulator = [];

    try {
      const transcript = await this.transcribe(combined);
      if (transcript && transcript.trim().length > 0) {
        this.log(`STT: "${transcript}"`);
        // MVP: echo the transcript back via TTS
        await this.synthesizeAndPush(transcript);
      }
    } catch (err) {
      this.log(`STT error: ${String(err)}`);
    }
  }

  private async transcribe(pcmBuffer: Buffer): Promise<string> {
    // Whisper expects multipart with a file upload
    // The incoming audio is PCM 16kHz — wrap it as WAV for Whisper/librosa
    const wavBuffer = pcmToWav(pcmBuffer, 16000, 1);

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(wavBuffer)], { type: "audio/wav" }),
      "audio.wav",
    );
    formData.append("language", "de");

    const response = await fetch(`${WHISPER_URL}/transcribe`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Whisper returned ${response.status}: ${await response.text()}`);
    }

    const result = (await response.json()) as { text: string };
    return result.text;
  }

  private async synthesizeAndPush(text: string): Promise<void> {
    if (!this.system) {
      return;
    }

    try {
      const response = await fetch(`${XTTS_URL}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: "de" }),
      });

      if (!response.ok) {
        throw new Error(`XTTS returned ${response.status}: ${await response.text()}`);
      }

      // XTTS returns WAV at 24kHz — need to resample to 16kHz
      const wavArrayBuffer = await response.arrayBuffer();
      const wavData = new Uint8Array(wavArrayBuffer);

      // Parse WAV and resample 24kHz → 16kHz
      const pcm24k = parseWavToPCM(wavData);
      const pcm16k = resample(pcm24k, 24000, 16000);

      // Convert float32 samples to 16-bit PCM bytes
      const pcmBytes = float32ToPCM16(pcm16k);

      // Push as a single audio chunk
      await this.system.bridge.pushAudioChunk({
        data: Buffer.from(pcmBytes),
        sampleRate: 16000,
        channels: 1,
        timestamp: Date.now(),
        format: "PCM",
      });

      this.log(`TTS: pushed ${pcmBytes.byteLength} bytes of audio`);
    } catch (err) {
      this.log(`TTS error: ${String(err)}`);
    }
  }

  // --- Video Pipeline ---

  private async loadActiveCharacterImage(): Promise<void> {
    if (!this.characterDb) {
      return;
    }

    const active = this.characterDb.getActiveCharacter();
    if (!active || !active.avatarImagePath) {
      this.log("No active character with avatar image found");
      this.activeCharacterImage = null;
      return;
    }

    try {
      const imgPath = active.avatarImagePath;
      if (fs.existsSync(imgPath)) {
        this.activeCharacterImage = fs.readFileSync(imgPath);
        this.log(`Loaded character image: ${active.displayName} (${imgPath})`);
      } else {
        this.log(`Character image not found: ${imgPath}`);
        this.activeCharacterImage = null;
      }
    } catch (err) {
      this.log(`Failed to load character image: ${String(err)}`);
      this.activeCharacterImage = null;
    }
  }

  private startVideoLoop(): void {
    if (this.videoLoopTimer) {
      return;
    }

    this.videoLoopTimer = setInterval(() => {
      void this.renderAndPushFrame();
    }, VIDEO_FRAME_INTERVAL);
  }

  private stopVideoLoop(): void {
    if (this.videoLoopTimer) {
      clearInterval(this.videoLoopTimer);
      this.videoLoopTimer = null;
    }
  }

  private async renderAndPushFrame(): Promise<void> {
    if (!this.system || !this.activeCharacterImage) {
      return;
    }

    try {
      const formData = new FormData();
      formData.append(
        "source_image",
        new Blob([new Uint8Array(this.activeCharacterImage)], { type: "image/png" }),
        "avatar.png",
      );
      formData.append("expression", "neutral");

      const response = await fetch(`${LIVEPORTRAIT_URL}/api/render`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        // Don't spam logs on repeated failures
        return;
      }

      const jpegBuffer = Buffer.from(await response.arrayBuffer());

      await this.system.bridge.pushVideoFrame({
        data: jpegBuffer,
        width: 512,
        height: 512,
        timestamp: Date.now(),
        format: "JPEG",
      });
    } catch {
      // Network errors during render are expected if LivePortrait is not running
    }
  }

  private log(msg: string): void {
    if (this.config.debug) {
      console.log(`[AvatarOrchestrator] ${msg}`);
    }
  }
}

// --- Audio utility functions ---

/** Wrap raw PCM 16-bit mono data into a minimal WAV container */
function pcmToWav(pcmBuffer: Buffer, sampleRate: number, channels: number): Buffer {
  const bytesPerSample = 2; // 16-bit
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  // RIFF header
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);

  // fmt chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  header.writeUInt16LE(channels * bytesPerSample, 32);
  header.writeUInt16LE(bytesPerSample * 8, 34);

  // data chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/** Parse a WAV file and return raw float32 PCM samples */
function parseWavToPCM(wav: Uint8Array): Float32Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

  // Find data chunk
  let offset = 12; // skip RIFF header
  while (offset < wav.byteLength - 8) {
    const chunkId = String.fromCharCode(
      wav[offset],
      wav[offset + 1],
      wav[offset + 2],
      wav[offset + 3],
    );
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === "data") {
      offset += 8;
      // Assume 16-bit PCM
      const sampleCount = chunkSize / 2;
      const samples = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        samples[i] = view.getInt16(offset + i * 2, true) / 32768;
      }
      return samples;
    }
    offset += 8 + chunkSize;
  }

  return new Float32Array(0);
}

/** Simple linear resampling */
function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) {
    return input;
  }

  const ratio = fromRate / toRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const frac = srcIndex - srcIndexFloor;

    if (srcIndexFloor + 1 < input.length) {
      output[i] = input[srcIndexFloor] * (1 - frac) + input[srcIndexFloor + 1] * frac;
    } else {
      output[i] = input[srcIndexFloor] ?? 0;
    }
  }

  return output;
}

/** Convert float32 samples to 16-bit PCM buffer */
function float32ToPCM16(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s * 32767, true);
  }
  return buffer;
}

/** Create and start the avatar orchestrator */
export async function startAvatarOrchestrator(
  config?: OrchestratorConfig,
): Promise<AvatarOrchestrator> {
  const orchestrator = new AvatarOrchestrator(config);
  await orchestrator.start();
  return orchestrator;
}
