/**
 * Abstract Avatar Renderer Interface
 * Allows swapping between different rendering backends (LivePortrait → Hyperrealistic)
 */

export enum EmotionType {
  NEUTRAL = "neutral",
  HAPPY = "happy",
  SAD = "sad",
  SURPRISED = "surprised",
  ANGRY = "angry",
  DISGUSTED = "disgusted",
  FEARFUL = "fearful",
}

export interface RenderOptions {
  /** Target emotion to render */
  emotion?: EmotionType;
  /** Emotion intensity (0.0 = subtle, 1.0 = extreme) */
  intensity?: number;
  /** Output image width (optional) */
  width?: number;
  /** Output image height (optional) */
  height?: number;
  /** Output format */
  format?: "png" | "jpg" | "webp";
}

export interface RenderResult {
  /** Rendered image buffer */
  image: Buffer;
  /** Rendering latency in milliseconds */
  latencyMs: number;
  /** Whether GPU was used */
  gpuUsed: boolean;
  /** Metadata about the render */
  metadata: {
    emotion: EmotionType;
    intensity: number;
    width: number;
    height: number;
    modelVersion: string;
  };
}

export interface HealthStatus {
  /** Is the renderer ready to process requests */
  ready: boolean;
  /** GPU availability */
  gpuAvailable: boolean;
  /** GPU device name */
  gpuName?: string;
  /** Model information */
  modelInfo: {
    name: string;
    version: string;
    loaded: boolean;
  };
}

/**
 * Abstract interface for avatar rendering engines
 *
 * Implementations:
 * - LivePortraitRenderer (stylized, current)
 * - HyperrealisticRenderer (future, photorealistic)
 */
export interface IAvatarRenderer {
  /**
   * Initialize the renderer and load models
   */
  initialize(): Promise<void>;

  /**
   * Check renderer health and readiness
   */
  health(): Promise<HealthStatus>;

  /**
   * Render a single frame with specified emotion
   *
   * @param sourceImage Source portrait image
   * @param options Render options (emotion, intensity, etc.)
   * @returns Rendered frame
   */
  renderFrame(sourceImage: Buffer, options?: RenderOptions): Promise<RenderResult>;

  /**
   * Render multiple emotion variations (batch processing)
   * Useful for pre-generating avatar expression sets
   *
   * @param sourceImage Source portrait image
   * @param emotions Array of emotions to render
   * @param intensity Global intensity for all emotions
   * @returns Array of rendered frames
   */
  renderBatch(
    sourceImage: Buffer,
    emotions: EmotionType[],
    intensity?: number,
  ): Promise<RenderResult[]>;

  /**
   * Cleanup and release resources
   */
  cleanup(): Promise<void>;
}

/**
 * Factory for creating avatar renderers
 * Allows runtime selection of rendering backend
 */
export interface IAvatarRendererFactory {
  /**
   * Create a renderer instance
   *
   * @param type Renderer type ('liveportrait' | 'hyperrealistic')
   * @param config Renderer-specific configuration
   */
  create(type: "liveportrait" | "hyperrealistic", config: Record<string, unknown>): IAvatarRenderer;
}

/**
 * Configuration for avatar rendering system
 */
export interface AvatarRenderConfig {
  /** Renderer type to use */
  rendererType: "liveportrait" | "hyperrealistic";
  /** Service base URL */
  serviceUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable performance logging */
  enableLogging?: boolean;
  /** Target rendering latency (ms) */
  targetLatency?: number;
  /** GPU device index (for multi-GPU systems) */
  gpuDevice?: number;
}
