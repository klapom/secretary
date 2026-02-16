# LivePortrait Integration Guide

This document explains how to integrate the LivePortrait Avatar Service into the Secretary application.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Secretary Application                     │
│                      (TypeScript/Node.js)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │           Avatar System (src/avatar/)              │    │
│  │                                                     │    │
│  │  ┌──────────────────────────────────────────┐     │    │
│  │  │      IAvatarRenderer (interface)         │     │    │
│  │  └──────────────────┬───────────────────────┘     │    │
│  │                     │                              │    │
│  │         ┌───────────┴────────────┐                │    │
│  │         │                        │                │    │
│  │  ┌──────▼──────┐       ┌────────▼────────┐       │    │
│  │  │ LivePortrait│       │  Hyperrealistic │       │    │
│  │  │  Adapter    │       │    Adapter      │       │    │
│  │  └──────┬──────┘       └────────┬────────┘       │    │
│  └─────────┼─────────────────────────┼───────────────┘    │
│            │                         │                     │
└────────────┼─────────────────────────┼─────────────────────┘
             │ HTTP                    │ HTTP
             │                         │
┌────────────▼───────────┐   ┌────────▼─────────────┐
│  LivePortrait Service  │   │  Hyperrealistic      │
│   (Python/FastAPI)     │   │   Service (Future)   │
│   Port: 8001           │   │   Port: 8002         │
└────────────────────────┘   └──────────────────────┘
```

## Integration Steps

### 1. Start LivePortrait Service

```bash
cd services/liveportrait-avatar
./setup.sh
```

This will:

- Build Docker image with CUDA 12.1
- Download LivePortrait models (~2GB)
- Start the service on port 8001
- Wait for initialization to complete

### 2. Install TypeScript Client

The client is already included in the service directory:

```typescript
// src/avatar/index.ts
import { createLivePortraitRenderer } from "@services/liveportrait-avatar/client";

const renderer = createLivePortraitRenderer(
  "http://localhost:8001",
  30000, // 30s timeout
);

await renderer.initialize();
```

### 3. Use in Avatar System

```typescript
// src/avatar/AvatarManager.ts
import { IAvatarRenderer, EmotionType } from "./IAvatarRenderer";
import { createLivePortraitRenderer } from "@services/liveportrait-avatar/client";

export class AvatarManager {
  private renderer: IAvatarRenderer;

  async initialize(config: AvatarConfig) {
    // Create renderer based on config
    this.renderer = createLivePortraitRenderer(config.livePortraitUrl, config.timeout);

    await this.renderer.initialize();

    // Verify GPU availability
    const health = await this.renderer.health();
    if (!health.gpuAvailable) {
      console.warn("GPU not available - rendering will be slower");
    }
  }

  async renderEmotion(
    characterImage: Buffer,
    emotion: EmotionType,
    intensity: number = 0.7,
  ): Promise<Buffer> {
    const result = await this.renderer.renderFrame(characterImage, {
      emotion,
      intensity,
      format: "png",
      width: 512,
      height: 512,
    });

    console.log(`Rendered ${emotion} in ${result.latencyMs}ms`);
    return result.image;
  }

  async preloadEmotions(characterImage: Buffer): Promise<Map<EmotionType, Buffer>> {
    const emotions = Object.values(EmotionType);

    const results = await this.renderer.renderBatch(characterImage, emotions, 0.7);

    const emotionMap = new Map<EmotionType, Buffer>();
    results.forEach((result, index) => {
      emotionMap.set(emotions[index], result.image);
    });

    return emotionMap;
  }
}
```

### 4. Configuration

Add to your environment variables or config:

```bash
# .env
LIVEPORTRAIT_SERVICE_URL=http://localhost:8001
LIVEPORTRAIT_TIMEOUT=30000
AVATAR_RENDERER_TYPE=liveportrait
```

```typescript
// src/config/avatar.ts
export const avatarConfig = {
  rendererType: process.env.AVATAR_RENDERER_TYPE || "liveportrait",
  serviceUrl: process.env.LIVEPORTRAIT_SERVICE_URL || "http://localhost:8001",
  timeout: parseInt(process.env.LIVEPORTRAIT_TIMEOUT || "30000"),
};
```

## Usage Examples

### Simple Render

```typescript
import { createLivePortraitRenderer, EmotionType } from "@services/liveportrait-avatar/client";

const renderer = createLivePortraitRenderer("http://localhost:8001");
await renderer.initialize();

const characterImage = await fs.readFile("./character.jpg");

const result = await renderer.renderFrame(characterImage, {
  emotion: EmotionType.HAPPY,
  intensity: 0.8,
});

await fs.writeFile("./output.png", result.image);
console.log(`Rendered in ${result.latencyMs}ms`);
```

### Pre-generate Emotion Set

```typescript
const emotions = [EmotionType.NEUTRAL, EmotionType.HAPPY, EmotionType.SAD, EmotionType.SURPRISED];

const results = await renderer.renderBatch(characterImage, emotions, 0.7);

// Save all variations
for (let i = 0; i < results.length; i++) {
  await fs.writeFile(`./output_${emotions[i]}.png`, results[i].image);
}
```

### Emotion Caching Strategy

```typescript
class EmotionCache {
  private cache = new Map<string, Buffer>();

  async getOrRender(
    renderer: IAvatarRenderer,
    characterId: string,
    emotion: EmotionType,
    intensity: number,
  ): Promise<Buffer> {
    const key = `${characterId}_${emotion}_${intensity}`;

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const characterImage = await loadCharacterImage(characterId);
    const result = await renderer.renderFrame(characterImage, {
      emotion,
      intensity,
    });

    this.cache.set(key, result.image);
    return result.image;
  }

  async preloadCharacter(renderer: IAvatarRenderer, characterId: string): Promise<void> {
    const characterImage = await loadCharacterImage(characterId);
    const emotions = Object.values(EmotionType);

    const results = await renderer.renderBatch(characterImage, emotions, 0.7);

    results.forEach((result, index) => {
      const key = `${characterId}_${emotions[index]}_0.7`;
      this.cache.set(key, result.image);
    });
  }
}
```

## Performance Optimization

### 1. Warm-up on Startup

```typescript
async function warmupRenderer(renderer: IAvatarRenderer) {
  console.log("Warming up renderer...");

  // Create dummy image
  const canvas = createCanvas(512, 512);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#888";
  ctx.fillRect(0, 0, 512, 512);
  const dummyImage = canvas.toBuffer();

  // Warm-up render
  await renderer.renderFrame(dummyImage, {
    emotion: EmotionType.NEUTRAL,
  });

  console.log("Renderer warmed up");
}
```

### 2. Connection Pooling

The LivePortraitClient uses HTTP/2 keep-alive by default for connection reuse.

### 3. Batch Processing

When rendering multiple emotions, always use `renderBatch()` instead of multiple `renderFrame()` calls:

```typescript
// ❌ Slow - multiple HTTP requests
for (const emotion of emotions) {
  await renderer.renderFrame(image, { emotion });
}

// ✅ Fast - single batch request
await renderer.renderBatch(image, emotions);
```

### 4. Pre-generation

Pre-render common emotions during character creation:

```typescript
async function onCharacterCreated(character: Character) {
  const emotionCache = new EmotionCache();
  await emotionCache.preloadCharacter(renderer, character.id);
}
```

## Migration to Hyperrealistic

When ready to migrate to hyperrealistic rendering:

```typescript
// Old code
const renderer = createLivePortraitRenderer("http://localhost:8001");

// New code - just swap the renderer!
const renderer = createHyperrealisticRenderer("http://localhost:8002");

// Everything else stays the same thanks to IAvatarRenderer interface
await renderer.initialize();
const result = await renderer.renderFrame(image, { emotion });
```

## Monitoring

### Health Checks

```typescript
setInterval(async () => {
  const health = await renderer.health();

  if (!health.ready) {
    console.error("Renderer not ready!");
    // Alert or fallback logic
  }
}, 30000); // Check every 30s
```

### Metrics

```typescript
import { createLivePortraitClient } from "@services/liveportrait-avatar/client";

const client = createLivePortraitClient({ baseUrl: "http://localhost:8001" });
const metrics = await client.getMetrics();

// Parse Prometheus metrics
// liveportrait_requests_total
// liveportrait_request_duration_seconds
// liveportrait_errors_total
```

## Troubleshooting

### Service Not Ready

```typescript
const client = createLivePortraitClient({ baseUrl: "http://localhost:8001" });

if (!(await client.waitForHealthy(20, 3000))) {
  throw new Error("LivePortrait service failed to start");
}
```

### GPU Memory Issues

Reduce batch size or image resolution:

```typescript
const result = await renderer.renderFrame(image, {
  emotion: EmotionType.HAPPY,
  width: 256, // Smaller resolution
  height: 256,
});
```

### Connection Timeouts

Increase timeout for slow GPUs:

```typescript
const renderer = createLivePortraitRenderer(
  "http://localhost:8001",
  60000, // 60s timeout
);
```

## Testing

```typescript
import { describe, it, expect } from "@jest/globals";

describe("Avatar Integration", () => {
  let renderer: IAvatarRenderer;

  beforeAll(async () => {
    renderer = createLivePortraitRenderer("http://localhost:8001");
    await renderer.initialize();
  });

  it("should render happy emotion", async () => {
    const image = await fs.readFile("./test-portrait.jpg");

    const result = await renderer.renderFrame(image, {
      emotion: EmotionType.HAPPY,
      intensity: 0.7,
    });

    expect(result.image).toBeInstanceOf(Buffer);
    expect(result.latencyMs).toBeLessThan(100);
    expect(result.metadata.emotion).toBe(EmotionType.HAPPY);
  });

  afterAll(async () => {
    await renderer.cleanup();
  });
});
```

## Next Steps

1. Integrate into character creation workflow
2. Add emotion caching layer
3. Implement real-time streaming with WebRTC
4. Add speech-to-emotion mapping (text → emotion)
5. Profile and optimize for target latency
6. Plan migration to hyperrealistic renderer
