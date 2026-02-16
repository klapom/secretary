# Avatar System Integration - OpenClaw Architecture

**Datum:** 2026-02-15
**Status:** Architecture Design
**Kontext:** Integration von LivePortrait/SadTalker in OpenClaw basierend auf ADR-Entscheidungen

---

## 🏗️ Integration abhängig von ADR-01 (Architektur)

### Szenario A: Modularer Monolith (ADR-01 Alternative B)

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Monolith                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Gateway Module                               │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │  │
│  │  │ WhatsApp │  │ Telegram │  │  Slack   │  │ Avatar  │ │  │
│  │  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ Channel │ │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │  │
│  └───────┼─────────────┼─────────────┼──────────────┼───────┘  │
│          │             │             │              │           │
│          └─────────────┴─────────────┴──────────────┘           │
│                           │                                      │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │              Internal Event Bus                           │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │              Agent Runtime Module                         │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐   │  │
│  │  │   LLM    │  │   Context    │  │  Tool Executor   │   │  │
│  │  │ Backend  │  │  Management  │  │                  │   │  │
│  │  └────┬─────┘  └──────────────┘  └──────────────────┘   │  │
│  └───────┼──────────────────────────────────────────────────┘  │
│          │                                                      │
│  ┌───────▼──────────────────────────────────────────────────┐  │
│  │           Avatar Rendering Module                        │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │    STT     │→ │     TTS      │→ │  LivePortrait  │  │  │
│  │  │  (Whisper) │  │    (XTTS)    │  │   Renderer     │  │  │
│  │  └────────────┘  └──────────────┘  └────────┬───────┘  │  │
│  │                                              │          │  │
│  │  ┌──────────────────────────────────────────▼───────┐  │  │
│  │  │        Character Asset Manager                   │  │  │
│  │  │  - Portrait Storage                              │  │  │
│  │  │  - Character Metadata                            │  │  │
│  │  │  - Voice Profiles                                │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
                   ┌───────────────┐
                   │  File Storage │
                   │  - Portraits  │
                   │  - Videos     │
                   │  - Audio      │
                   └───────────────┘
```

**Vorteile:**

- ✅ Einfaches Deployment (ein Prozess)
- ✅ Direkter Zugriff auf alle Module
- ✅ Niedriger Latenz-Overhead
- ✅ Einfaches Character-Management (shared filesystem)

**Code-Struktur:**

```
openclaw/
├── src/
│   ├── gateway/
│   │   ├── channels/
│   │   │   ├── whatsapp.ts
│   │   │   ├── telegram.ts
│   │   │   └── avatar.ts          ← Avatar Channel
│   │   └── index.ts
│   ├── agent/
│   │   ├── runtime.ts
│   │   └── tools/
│   ├── avatar/                     ← Neues Modul
│   │   ├── renderers/
│   │   │   ├── live-portrait.ts
│   │   │   ├── sad-talker.ts
│   │   │   └── rpm.ts
│   │   ├── character-manager.ts
│   │   ├── stt.ts
│   │   ├── tts.ts
│   │   └── index.ts
│   └── storage/
│       └── character-assets.ts
└── characters/                     ← Character Storage
    ├── default/
    │   ├── portrait.jpg
    │   ├── metadata.json
    │   └── voice-profile.bin
    └── cyberpunk-assistant/
        ├── portrait.jpg
        ├── metadata.json
        └── voice-profile.bin
```

---

### Szenario B: Microservices (ADR-01 Alternative A/C)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Gateway    │────▶│    NATS      │────▶│   Agent      │
│   Service    │     │   Broker     │     │   Runtime    │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                     │
       │                    │                     │
       │                    ▼                     │
       │         ┌─────────────────────┐         │
       │         │  Message Topics:    │         │
       │         │  - inbound.messages │         │
       │         │  - outbound.messages│         │
       │         │  - avatar.requests  │◀────────┘
       │         └──────────┬──────────┘
       │                    │
       ▼                    ▼
┌─────────────────────────────────────────────┐
│        Avatar Service (Separate Pod)       │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │   STT    │  │   TTS    │  │LivePort- │ │
│  │ Service  │  │ Service  │  │  rait    │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │             │             │        │
│       └─────────────┴─────────────┘        │
│                     │                      │
│       ┌─────────────▼────────────┐         │
│       │  Character Asset Cache   │         │
│       │  (Redis)                 │         │
│       └─────────────┬────────────┘         │
└─────────────────────┼──────────────────────┘
                      │
                      ▼
            ┌──────────────────┐
            │  S3 / MinIO      │
            │  Character Store │
            └──────────────────┘

┌─────────────────────────────────────────────┐
│     Kubernetes Node with GPU                │
│  ┌──────────────────────────────────────┐  │
│  │  Avatar Service Pod                  │  │
│  │  - nodeSelector: gpu=true            │  │
│  │  - resources.limits.nvidia.com/gpu=1 │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Vorteile:**

- ✅ Unabhängiges Scaling (Avatar Service auf GPU-Nodes)
- ✅ Isolation (Avatar-Crash ≠ Gateway-Crash)
- ✅ Technologie-Freiheit (Python für ML, Node für Gateway)
- ✅ Load Balancing (mehrere Avatar-Instanzen)

**Nachteile:**

- ❌ Netzwerk-Latenz (Gateway → Broker → Avatar Service)
- ❌ Komplexeres Asset-Management (S3 statt Filesystem)
- ❌ Höherer Operations-Overhead

---

## 🎨 Character Management System

### Character Asset Structure

```typescript
// src/avatar/types/character.ts
export interface Character {
  id: string;
  name: string;
  description: string;

  // Visual
  portraitUrl: string; // JPG/PNG für LivePortrait
  portraitHash: string; // Cache invalidation
  style: "realistic" | "stylized" | "anime" | "cyberpunk";

  // Audio
  voiceProfile?: {
    referenceAudio: string; // WAV für XTTS voice cloning
    pitch: number; // -12 to +12 semitones
    speed: number; // 0.5 to 2.0
    emotion: "neutral" | "energetic" | "calm";
  };

  // Personality (für LLM)
  systemPrompt?: string;
  personality: {
    traits: string[]; // ['friendly', 'professional', 'witty']
    speechPatterns?: string[]; // ['Max Headroom stutters', 'pauses often']
  };

  // Rendering
  rendererConfig: {
    type: "liveportrait" | "sadtalker" | "wav2lip";
    settings: Record<string, any>;
  };

  // Metadata
  createdBy: string;
  createdAt: Date;
  tags: string[];
}
```

### Character Creation Workflow

```typescript
// src/avatar/character-manager.ts
export class CharacterManager {
  private storage: CharacterStorage;
  private cache: CharacterCache;

  /**
   * Create character from uploaded portrait
   */
  async createFromPortrait(params: {
    name: string;
    portraitFile: File; // JPG/PNG upload
    voiceReferenceFile?: File; // Optional WAV
    style: CharacterStyle;
    personality?: PersonalityConfig;
  }): Promise<Character> {
    // 1. Upload portrait to storage
    const portraitUrl = await this.storage.uploadPortrait(
      params.portraitFile,
      `characters/${params.name}/portrait.jpg`,
    );

    // 2. Extract/create voice profile
    let voiceProfile = null;
    if (params.voiceReferenceFile) {
      voiceProfile = await this.createVoiceProfile(params.voiceReferenceFile);
    }

    // 3. Generate character metadata
    const character: Character = {
      id: generateId(),
      name: params.name,
      description: `Custom character: ${params.name}`,
      portraitUrl,
      portraitHash: await hashFile(params.portraitFile),
      style: params.style,
      voiceProfile,
      personality: params.personality || DEFAULT_PERSONALITY,
      rendererConfig: {
        type: "liveportrait",
        settings: {
          fps: 25,
          resolution: "720p",
          expressiveness: 0.8,
        },
      },
      createdBy: "user",
      createdAt: new Date(),
      tags: [params.style],
    };

    // 4. Save to database
    await this.storage.saveCharacter(character);

    // 5. Pre-warm renderer cache
    await this.cache.preloadCharacter(character);

    return character;
  }

  /**
   * Create character from AI-generated image (Midjourney/DALL-E)
   */
  async createFromAIImage(params: {
    name: string;
    imagePrompt: string; // Midjourney/DALL-E prompt
    aiService: "midjourney" | "dalle" | "stable-diffusion";
    voiceConfig?: VoiceConfig;
  }): Promise<Character> {
    // 1. Generate image via AI
    const generatedImage = await this.generateAIImage(params.imagePrompt, params.aiService);

    // 2. Use standard creation flow
    return this.createFromPortrait({
      name: params.name,
      portraitFile: generatedImage,
      style: this.detectStyleFromPrompt(params.imagePrompt),
      personality: this.generatePersonalityFromPrompt(params.imagePrompt),
    });
  }

  /**
   * Generate AI image (integration with image generators)
   */
  private async generateAIImage(prompt: string, service: "midjourney" | "dalle"): Promise<File> {
    switch (service) {
      case "dalle":
        const dalleClient = new OpenAI();
        const response = await dalleClient.images.generate({
          model: "dall-e-3",
          prompt: prompt,
          size: "1024x1024",
          quality: "hd",
        });
        return await downloadImage(response.data[0].url);

      case "midjourney":
        // Via Midjourney API (unofficial or via Discord bot)
        const mjClient = new MidjourneyClient();
        const imageUrl = await mjClient.imagine(prompt);
        return await downloadImage(imageUrl);
    }
  }

  /**
   * Switch character for a session
   */
  async switchCharacter(sessionId: string, characterId: string) {
    const character = await this.storage.getCharacter(characterId);

    // Update session state
    await this.sessions.updateSession(sessionId, {
      activeCharacter: character,
    });

    // Preload character assets
    await this.cache.ensureLoaded(character);

    return character;
  }

  /**
   * List available characters
   */
  async listCharacters(filters?: {
    style?: CharacterStyle;
    tags?: string[];
    createdBy?: string;
  }): Promise<Character[]> {
    return this.storage.queryCharacters(filters);
  }
}
```

---

## 💾 Storage Strategy (abhängig von ADR-04)

### Option A: Monolith mit lokalem Filesystem

```typescript
// src/storage/filesystem-character-storage.ts
export class FilesystemCharacterStorage implements CharacterStorage {
  private basePath = "./characters";

  async uploadPortrait(file: File, path: string): Promise<string> {
    const fullPath = join(this.basePath, path);
    await fs.promises.mkdir(dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, file.buffer);

    return `/characters/${path}`; // Local URL
  }

  async getPortrait(characterId: string): Promise<Buffer> {
    const character = await this.getCharacter(characterId);
    const filePath = join(this.basePath, character.portraitUrl);
    return fs.promises.readFile(filePath);
  }
}
```

**Struktur:**

```
/home/openclaw/
├── characters/
│   ├── default/
│   │   ├── portrait.jpg
│   │   ├── metadata.json
│   │   └── voice-profile.bin
│   ├── cyberpunk-host/
│   │   ├── portrait.jpg
│   │   ├── metadata.json
│   │   └── voice-profile.bin
│   └── retro-assistant/
│       ├── portrait.jpg
│       ├── metadata.json
│       └── voice-profile.bin
```

---

### Option B: Microservices mit S3/MinIO

```typescript
// src/storage/s3-character-storage.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export class S3CharacterStorage implements CharacterStorage {
  private s3: S3Client;
  private bucket = "openclaw-characters";

  async uploadPortrait(file: File, path: string): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: path,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return `https://${this.bucket}.s3.amazonaws.com/${path}`;
  }

  async getPortrait(characterId: string): Promise<Buffer> {
    const character = await this.getCharacter(characterId);
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: character.portraitUrl,
      }),
    );

    return await streamToBuffer(response.Body);
  }
}
```

**Mit Redis Cache:**

```typescript
export class CachedCharacterStorage implements CharacterStorage {
  constructor(
    private underlying: CharacterStorage, // S3
    private cache: Redis,
  ) {}

  async getPortrait(characterId: string): Promise<Buffer> {
    // Try cache first
    const cached = await this.cache.getBuffer(`portrait:${characterId}`);
    if (cached) return cached;

    // Fetch from S3
    const portrait = await this.underlying.getPortrait(characterId);

    // Cache for 1 hour
    await this.cache.setex(`portrait:${characterId}`, 3600, portrait);

    return portrait;
  }
}
```

---

## 🔌 Integration mit bestehenden Channels

### Erweiterung des Gateway

```typescript
// src/gateway/channels/avatar.ts
import { Channel } from "./base";
import { AvatarRenderer } from "../../avatar/renderers";
import { CharacterManager } from "../../avatar/character-manager";

export class AvatarChannel implements Channel {
  private renderer: AvatarRenderer;
  private characterManager: CharacterManager;
  private activeSessions = new Map<string, AvatarSession>();

  async initialize() {
    this.characterManager = new CharacterManager();
    this.renderer = new LivePortraitRenderer();
    await this.renderer.initialize();
  }

  /**
   * Start avatar session with specific character
   */
  async startSession(params: {
    userId: string;
    characterId?: string; // Optional, falls nicht: default
  }): Promise<AvatarSessionInfo> {
    // Load character (or use default)
    const character = params.characterId
      ? await this.characterManager.getCharacter(params.characterId)
      : await this.characterManager.getDefaultCharacter();

    // Initialize renderer with character
    const sessionId = generateId();
    const session = await this.renderer.startSession({
      sessionId,
      character,
    });

    this.activeSessions.set(sessionId, {
      userId: params.userId,
      character,
      session,
    });

    return {
      sessionId,
      streamUrl: session.videoStreamUrl,
      character: {
        name: character.name,
        style: character.style,
      },
    };
  }

  /**
   * Handle voice input from user
   */
  async handleVoiceInput(params: { sessionId: string; audioData: Buffer }): Promise<void> {
    const session = this.activeSessions.get(params.sessionId);
    if (!session) throw new Error("Session not found");

    // 1. STT
    const transcript = await this.stt.transcribe(params.audioData);

    // 2. Send to Agent Runtime (via Event Bus oder Message Broker)
    const agentResponse = await this.sendToAgent({
      sessionId: params.sessionId,
      channel: "avatar",
      userId: session.userId,
      content: {
        type: "text",
        text: transcript,
      },
      context: {
        character: session.character.name,
        systemPrompt: session.character.systemPrompt,
      },
    });

    // 3. TTS (mit Character Voice Profile)
    const audioResponse = await this.tts.synthesize(
      agentResponse.content.text,
      session.character.voiceProfile,
    );

    // 4. Render Avatar
    await this.renderer.render({
      sessionId: params.sessionId,
      audio: audioResponse,
      transcript: agentResponse.content.text,
      character: session.character,
    });

    // Video wird automatisch an Client gestreamt
  }

  /**
   * Switch character mid-session
   */
  async switchCharacter(sessionId: string, characterId: string) {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error("Session not found");

    const newCharacter = await this.characterManager.getCharacter(characterId);

    // Update session
    session.character = newCharacter;

    // Reload renderer with new character
    await this.renderer.reloadCharacter(sessionId, newCharacter);

    return newCharacter;
  }
}
```

---

## 🎭 Character Customization API (für Frontend)

### REST API Endpoints

```typescript
// src/api/character-api.ts
import { Router } from "express";

const router = Router();

/**
 * GET /api/characters
 * List all available characters
 */
router.get("/characters", async (req, res) => {
  const characters = await characterManager.listCharacters({
    style: req.query.style,
    tags: req.query.tags?.split(","),
  });

  res.json({ characters });
});

/**
 * POST /api/characters
 * Create new character from uploaded portrait
 */
router.post(
  "/characters",
  upload.fields([
    { name: "portrait", maxCount: 1 },
    { name: "voiceReference", maxCount: 1 },
  ]),
  async (req, res) => {
    const character = await characterManager.createFromPortrait({
      name: req.body.name,
      portraitFile: req.files.portrait[0],
      voiceReferenceFile: req.files.voiceReference?.[0],
      style: req.body.style,
      personality: JSON.parse(req.body.personality || "{}"),
    });

    res.json({ character });
  },
);

/**
 * POST /api/characters/generate
 * Generate character from AI prompt
 */
router.post("/characters/generate", async (req, res) => {
  const { name, prompt, aiService, voiceConfig } = req.body;

  const character = await characterManager.createFromAIImage({
    name,
    imagePrompt: prompt,
    aiService,
    voiceConfig,
  });

  res.json({ character });
});

/**
 * PUT /api/sessions/:sessionId/character
 * Switch character for active session
 */
router.put("/sessions/:sessionId/character", async (req, res) => {
  const { characterId } = req.body;

  const character = await avatarChannel.switchCharacter(req.params.sessionId, characterId);

  res.json({ character });
});

/**
 * GET /api/characters/:id/preview
 * Generate preview video of character
 */
router.get("/characters/:id/preview", async (req, res) => {
  const character = await characterManager.getCharacter(req.params.id);

  // Generate 3-second preview
  const previewVideo = await renderer.render({
    sessionId: "preview",
    audio: await tts.synthesize("Hello! I am your assistant."),
    transcript: "Hello! I am your assistant.",
    character,
  });

  res.set("Content-Type", "video/mp4");
  res.send(previewVideo.data);
});
```

---

## 🖼️ Frontend Integration

### React Component

```tsx
// frontend/src/components/AvatarChat.tsx
import { useEffect, useState, useRef } from "react";
import { CharacterSelector } from "./CharacterSelector";

export function AvatarChat() {
  const [sessionId, setSessionId] = useState<string>();
  const [character, setCharacter] = useState<Character>();
  const [isRecording, setIsRecording] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Start session with default character
    fetch("/api/avatar/start", { method: "POST" })
      .then((res) => res.json())
      .then(({ sessionId, streamUrl, character }) => {
        setSessionId(sessionId);
        setCharacter(character);

        // Connect video stream (WebRTC oder HLS)
        connectVideoStream(streamUrl, videoRef.current);
      });
  }, []);

  const handleVoiceInput = async () => {
    setIsRecording(true);
    const audio = await recordAudio(5000); // 5 seconds max

    await fetch(`/api/avatar/${sessionId}/speak`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: audio,
    });

    setIsRecording(false);
    // Avatar responds automatically via video stream
  };

  const handleCharacterChange = async (newCharacterId: string) => {
    const response = await fetch(`/api/sessions/${sessionId}/character`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: newCharacterId }),
    });

    const { character } = await response.json();
    setCharacter(character);
  };

  return (
    <div className="avatar-chat">
      <div className="character-info">
        <CharacterSelector current={character} onChange={handleCharacterChange} />
      </div>

      <div className="video-container">
        <video ref={videoRef} autoPlay className="avatar-video" />

        <div className="character-badge">
          {character?.name} ({character?.style})
        </div>
      </div>

      <div className="controls">
        <button
          onClick={handleVoiceInput}
          disabled={isRecording}
          className={isRecording ? "recording" : ""}
        >
          {isRecording ? "🎤 Listening..." : "🎤 Speak"}
        </button>
      </div>
    </div>
  );
}
```

### Character Selector

```tsx
// frontend/src/components/CharacterSelector.tsx
export function CharacterSelector({
  current,
  onChange,
}: {
  current: Character;
  onChange: (characterId: string) => void;
}) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    fetch("/api/characters")
      .then((res) => res.json())
      .then(({ characters }) => setCharacters(characters));
  }, []);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("portrait", file);
    formData.append("name", "My Custom Character");
    formData.append("style", "realistic");

    const response = await fetch("/api/characters", {
      method: "POST",
      body: formData,
    });

    const { character } = await response.json();
    setCharacters([...characters, character]);
    onChange(character.id);
  };

  return (
    <div className="character-selector">
      <select value={current.id} onChange={(e) => onChange(e.target.value)}>
        {characters.map((char) => (
          <option key={char.id} value={char.id}>
            {char.name} ({char.style})
          </option>
        ))}
      </select>

      <button onClick={() => setShowUpload(true)}>+ Upload Character</button>

      {showUpload && (
        <CharacterUploadModal onUpload={handleUpload} onClose={() => setShowUpload(false)} />
      )}
    </div>
  );
}
```

---

## 📊 Performance Considerations

### Caching Strategy

```typescript
export class CharacterCache {
  private portraitCache = new LRU<string, Buffer>({ max: 10 }); // 10 portraits
  private modelCache = new Map<string, LoadedModel>();

  async preloadCharacter(character: Character) {
    // 1. Cache portrait
    const portrait = await storage.getPortrait(character.id);
    this.portraitCache.set(character.id, portrait);

    // 2. Preload LivePortrait model if not cached
    if (!this.modelCache.has(character.rendererConfig.type)) {
      const model = await loadModel(character.rendererConfig.type);
      this.modelCache.set(character.rendererConfig.type, model);
    }

    // 3. Warm up voice model
    if (character.voiceProfile) {
      await tts.loadVoiceProfile(character.voiceProfile);
    }
  }

  async getPortrait(characterId: string): Promise<Buffer> {
    let portrait = this.portraitCache.get(characterId);
    if (!portrait) {
      portrait = await storage.getPortrait(characterId);
      this.portraitCache.set(characterId, portrait);
    }
    return portrait;
  }
}
```

### Lazy Loading

```typescript
// Nur laden wenn tatsächlich genutzt
export class LazyCharacterLoader {
  async ensureCharacterLoaded(characterId: string) {
    if (cache.has(characterId)) return;

    // Background loading
    this.preloadCharacter(characterId).catch((err) => {
      logger.warn("Character preload failed", { characterId, err });
    });
  }
}
```

---

## 🔄 Migration von einem Character System

### Datenbank-Schema (wenn ADR-04 → PostgreSQL)

```sql
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  portrait_url VARCHAR(500) NOT NULL,
  portrait_hash VARCHAR(64),
  style VARCHAR(50),
  voice_profile_url VARCHAR(500),
  system_prompt TEXT,
  personality JSONB,
  renderer_config JSONB,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  tags TEXT[]
);

CREATE INDEX idx_characters_style ON characters(style);
CREATE INDEX idx_characters_tags ON characters USING GIN(tags);

CREATE TABLE session_characters (
  session_id UUID REFERENCES sessions(id),
  character_id UUID REFERENCES characters(id),
  activated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (session_id, character_id)
);
```

---

## 🎯 Zusammenfassung: Wie passt es ins System?

### Antwort abhängig von deiner ADR-01 Wahl:

| Aspekt                | Monolith (ADR-01-B)    | Microservices (ADR-01-A/C)     |
| --------------------- | ---------------------- | ------------------------------ |
| **Avatar Service**    | Modul im Monolithen    | Separater Service auf GPU-Node |
| **Character Storage** | Lokales Filesystem     | S3/MinIO + Redis Cache         |
| **Integration**       | Direkter Function Call | Message Broker (NATS)          |
| **Deployment**        | Single Binary          | Kubernetes Pod                 |
| **Skalierung**        | Vertical (mehr GPU)    | Horizontal (mehr Pods)         |
| **Latenz**            | <100ms overhead        | ~200-500ms overhead            |
| **Komplexität**       | 🟢 Niedrig             | 🟡 Mittel                      |

### Meine Empfehlung:

**Start: Modularer Monolith (ADR-01-B)**

- Avatar als Modul
- Lokaler Filesystem Storage
- 3 Wochen Entwicklung

**Später: Microservices (wenn nötig)**

- Avatar Service auslagern
- S3 + Redis
- Horizontal scaling

**Character Customization funktioniert in BEIDEN Fällen identisch:**

- Upload Portrait → API
- Generiere via AI → API
- Switch Character → API
- Gleicher Code, nur Storage-Layer austauschen

---

**Soll ich dir einen konkreten 3-Wochen-Sprint-Plan erstellen, der Character-Customization + Avatar-Integration kombiniert?** 🚀
