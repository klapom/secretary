/**
 * LivePortrait Renderer Adapter
 * Implements IAvatarRenderer interface using LivePortraitClient
 */

import {
  IAvatarRenderer,
  EmotionType,
  RenderOptions,
  RenderResult,
  HealthStatus,
} from "./IAvatarRenderer";
import { LivePortraitClient, createLivePortraitClient } from "./LivePortraitClient";

export class LivePortraitRendererAdapter implements IAvatarRenderer {
  private client: LivePortraitClient;
  private initialized = false;

  constructor(serviceUrl: string, timeout: number = 30000) {
    this.client = createLivePortraitClient({
      baseUrl: serviceUrl,
      timeout,
      enableLogging: true,
    });
  }

  async initialize(): Promise<void> {
    const isHealthy = await this.client.waitForHealthy(20, 3000);
    if (!isHealthy) {
      throw new Error("LivePortrait service failed to become healthy");
    }
    this.initialized = true;
  }

  async health(): Promise<HealthStatus> {
    const health = await this.client.health();

    return {
      ready: health.status === "healthy" && health.modelLoaded,
      gpuAvailable: health.gpuAvailable,
      gpuName: health.gpuName,
      modelInfo: {
        name: "LivePortrait",
        version: "1.0.0",
        loaded: health.modelLoaded,
      },
    };
  }

  async renderFrame(sourceImage: Buffer, options?: RenderOptions): Promise<RenderResult> {
    if (!this.initialized) {
      throw new Error("Renderer not initialized. Call initialize() first.");
    }

    const response = await this.client.render({
      sourceImage,
      emotion: options?.emotion ?? EmotionType.NEUTRAL,
      intensity: options?.intensity ?? 0.7,
      outputFormat: options?.format ?? "png",
      width: options?.width,
      height: options?.height,
    });

    // Download the rendered image
    const imageBuffer = await this.client.downloadOutput(response.filename);

    // Clean up remote file
    await this.client.deleteOutput(response.filename).catch(() => {
      // Ignore cleanup errors
    });

    return {
      image: imageBuffer,
      latencyMs: response.latencyMs,
      gpuUsed: response.gpuUsed,
      metadata: {
        emotion: response.emotion as EmotionType,
        intensity: response.intensity,
        width: response.width,
        height: response.height,
        modelVersion: response.modelVersion,
      },
    };
  }

  async renderBatch(
    sourceImage: Buffer,
    emotions: EmotionType[],
    intensity: number = 0.7,
  ): Promise<RenderResult[]> {
    if (!this.initialized) {
      throw new Error("Renderer not initialized. Call initialize() first.");
    }

    const responses = await this.client.renderBatch(sourceImage, emotions, intensity);

    const results: RenderResult[] = [];

    for (const response of responses) {
      const imageBuffer = await this.client.downloadOutput(response.filename);

      // Clean up remote file
      await this.client.deleteOutput(response.filename).catch(() => {
        // Ignore cleanup errors
      });

      results.push({
        image: imageBuffer,
        latencyMs: response.latencyMs,
        gpuUsed: response.gpuUsed,
        metadata: {
          emotion: response.emotion as EmotionType,
          intensity: response.intensity,
          width: response.width,
          height: response.height,
          modelVersion: response.modelVersion,
        },
      });
    }

    return results;
  }

  async cleanup(): Promise<void> {
    this.initialized = false;
    // No cleanup needed for HTTP client
  }
}

/**
 * Factory function to create LivePortrait renderer
 */
export function createLivePortraitRenderer(serviceUrl: string, timeout?: number): IAvatarRenderer {
  return new LivePortraitRendererAdapter(serviceUrl, timeout);
}
