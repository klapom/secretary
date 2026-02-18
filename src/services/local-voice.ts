/**
 * Local voice services adapter for DGX Spark Docker services.
 * - STT: Whisper Large V3 on port 8083
 * - TTS: XTTS v2 on port 8082
 */

import { execFile } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_STT_URL = "http://localhost:8083";
const DEFAULT_TTS_URL = "http://localhost:8082";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LANGUAGE = "de";

export interface LocalSTTConfig {
  url?: string;
  language?: string;
  timeoutMs?: number;
}

export interface LocalTTSConfig {
  url?: string;
  speakerId?: string;
  language?: string;
  timeoutMs?: number;
}

export interface LocalSTTResult {
  text: string;
  language?: string;
}

/**
 * Transcribe audio using local Whisper service.
 * Sends audio as multipart form data to POST /transcribe.
 */
export async function localTranscribe(
  audioBuffer: Buffer,
  config: LocalSTTConfig = {},
): Promise<LocalSTTResult> {
  const url = config.url ?? DEFAULT_STT_URL;
  const language = config.language ?? DEFAULT_LANGUAGE;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(audioBuffer)], { type: "audio/ogg" }),
    "audio.ogg",
  );
  formData.append("language", language);

  const response = await fetch(`${url}/transcribe`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Whisper STT failed (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as { text: string; language?: string };
  return { text: result.text, language: result.language };
}

/**
 * Synthesize speech using local XTTS service.
 * Sends JSON to POST /synthesize, returns WAV audio buffer.
 */
export async function localSynthesize(text: string, config: LocalTTSConfig = {}): Promise<Buffer> {
  const url = config.url ?? DEFAULT_TTS_URL;
  const language = config.language ?? DEFAULT_LANGUAGE;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body: Record<string, unknown> = { text, language };
  if (config.speakerId) {
    body.speaker_id = config.speakerId;
  }

  const response = await fetch(`${url}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`XTTS TTS failed (${response.status}): ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Convert WAV buffer to OGG/Opus using ffmpeg.
 * WhatsApp requires audio/ogg; codecs=opus for voice notes.
 */
export async function convertWavToOggOpus(wavBuffer: Buffer): Promise<Buffer> {
  const tempDir = mkdtempSync(path.join(tmpdir(), "voice-conv-"));
  const inputPath = path.join(tempDir, "input.wav");
  const outputPath = path.join(tempDir, "output.ogg");
  try {
    writeFileSync(inputPath, wavBuffer);
    await execFileAsync("ffmpeg", [
      "-i",
      inputPath,
      "-c:a",
      "libopus",
      "-b:a",
      "64k",
      "-vn",
      "-y",
      outputPath,
    ]);
    return readFileSync(outputPath);
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Check if local STT service is available.
 */
export async function isLocalSTTAvailable(config: LocalSTTConfig = {}): Promise<boolean> {
  const url = config.url ?? DEFAULT_STT_URL;
  try {
    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if local TTS service is available.
 */
export async function isLocalTTSAvailable(config: LocalTTSConfig = {}): Promise<boolean> {
  const url = config.url ?? DEFAULT_TTS_URL;
  try {
    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
