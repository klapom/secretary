/**
 * TypeScript client for LivePortrait Avatar Service
 * Provides type-safe interface to Python microservice
 */

import { FormData } from "formdata-node";
import { fileFromPath } from "formdata-node/file-from-path";

export enum EmotionType {
  NEUTRAL = "neutral",
  HAPPY = "happy",
  SAD = "sad",
  SURPRISED = "surprised",
  ANGRY = "angry",
  DISGUSTED = "disgusted",
  FEARFUL = "fearful",
}

export interface RenderRequest {
  /** Source image file path or Buffer */
  sourceImage: string | Buffer;
  /** Target emotion to render */
  emotion?: EmotionType;
  /** Emotion intensity (0.0 = subtle, 1.0 = extreme) */
  intensity?: number;
  /** Output image format (png, jpg, webp) */
  outputFormat?: "png" | "jpg" | "webp";
  /** Output image width (256-1024) */
  width?: number;
  /** Output image height (256-1024) */
  height?: number;
}

export interface RenderResponse {
  /** Path to rendered output image */
  outputPath: string;
  /** Output filename */
  filename: string;
  /** Applied emotion */
  emotion: EmotionType;
  /** Applied intensity */
  intensity: number;
  /** Rendering latency in milliseconds */
  latencyMs: number;
  /** Whether GPU was used for rendering */
  gpuUsed: boolean;
  /** LivePortrait model version */
  modelVersion: string;
  /** Output image width */
  width: number;
  /** Output image height */
  height: number;
}

export interface HealthResponse {
  /** Service status */
  status: "healthy" | "initializing" | "degraded";
  /** GPU availability */
  gpuAvailable: boolean;
  /** GPU device name */
  gpuName?: string;
  /** CUDA version */
  cudaVersion?: string;
  /** Whether LivePortrait model is loaded */
  modelLoaded: boolean;
}

export interface LivePortraitClientConfig {
  /** Base URL of LivePortrait service */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable request logging */
  enableLogging?: boolean;
}

export class LivePortraitClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly enableLogging: boolean;

  constructor(config: LivePortraitClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeout = config.timeout ?? 30000; // 30s default
    this.enableLogging = config.enableLogging ?? false;
  }

  /**
   * Check service health and GPU availability
   */
  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/health", { method: "GET" });
  }

  /**
   * Render avatar with specified emotion
   */
  async render(request: RenderRequest): Promise<RenderResponse> {
    const formData = new FormData();

    // Add source image
    if (typeof request.sourceImage === "string") {
      // File path
      const file = await fileFromPath(request.sourceImage);
      formData.append("source_image", file);
    } else {
      // Buffer
      const blob = new Blob([request.sourceImage]);
      formData.append("source_image", blob, "image.png");
    }

    // Add optional parameters
    if (request.emotion) {
      formData.append("emotion", request.emotion);
    }
    if (request.intensity !== undefined) {
      formData.append("intensity", request.intensity.toString());
    }
    if (request.outputFormat) {
      formData.append("output_format", request.outputFormat);
    }

    return this.request<RenderResponse>("/render", {
      method: "POST",
      body: formData,
    });
  }

  /**
   * Render multiple emotion variations from single source image
   * Useful for pre-generating emotion set for a character
   */
  async renderBatch(
    sourceImage: string | Buffer,
    emotions: EmotionType[],
    intensity: number = 0.7,
  ): Promise<RenderResponse[]> {
    const formData = new FormData();

    // Add source image
    if (typeof sourceImage === "string") {
      const file = await fileFromPath(sourceImage);
      formData.append("source_image", file);
    } else {
      const blob = new Blob([sourceImage]);
      formData.append("source_image", blob, "image.png");
    }

    // Add emotions array
    emotions.forEach((emotion) => {
      formData.append("emotions", emotion);
    });

    formData.append("intensity", intensity.toString());

    return this.request<RenderResponse[]>("/render/batch", {
      method: "POST",
      body: formData,
    });
  }

  /**
   * Download rendered output file
   */
  async downloadOutput(filename: string): Promise<Buffer> {
    const response = await fetch(`${this.baseUrl}/output/${filename}`, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to download output: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Delete rendered output file to free storage
   */
  async deleteOutput(filename: string): Promise<void> {
    await this.request(`/output/${filename}`, { method: "DELETE" });
  }

  /**
   * Get Prometheus metrics
   */
  async getMetrics(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/metrics`, {
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch metrics: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Internal request helper
   */
  private async request<T>(path: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    if (this.enableLogging) {
      console.log(`[LivePortraitClient] ${options.method} ${url}`);
    }

    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LivePortrait API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Wait for service to become healthy with retry logic
   */
  async waitForHealthy(maxAttempts: number = 10, delayMs: number = 2000): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const health = await this.health();
        if (health.status === "healthy" && health.modelLoaded) {
          return true;
        }
      } catch {
        // Service not ready yet
      }

      if (i < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return false;
  }
}

/**
 * Create a LivePortrait client instance
 */
export function createLivePortraitClient(config: LivePortraitClientConfig): LivePortraitClient {
  return new LivePortraitClient(config);
}
