# Sprint 03 - Avatar System - Foundation

**Sprint:** 03
**Dauer:** 2026-02-16 - 2026-03-02 (2 Wochen)
**Ziel:** Avatar Rendering Infrastructure mit LivePortrait, XTTS, Whisper und WebRTC Streaming

---

## 🎯 Sprint-Ziel

Am Ende dieses Sprints ist die Avatar-Infrastruktur funktional mit LivePortrait-basiertem Rendering (stylized approach), XTTS Voice Synthesis, Whisper STT und WebRTC Streaming. Ein Character Manager ermöglicht das Wechseln zwischen Avataren, und eine Test-UI demonstriert die Funktionalität.

**Success Criteria:**

- [ ] Avatar renders from static image (LivePortrait)
- [ ] Voice synthesis working (XTTS)
- [ ] STT working (Whisper)
- [ ] WebRTC streaming <200ms latency
- [ ] Character Manager functional (config, storage, switching)
- [ ] Simple test UI for avatar demo
- [ ] 80%+ test coverage maintained
- [ ] **Documentation updated** (docs/ and docs-secretary/)

---

## 📋 Features & Tasks

### Feature 1: LivePortrait Integration

**Priority:** 🔴 CRITICAL

**Model:** 🤖 Opus 4.6
- **Rationale:** LivePortrait integration erfordert Research, Python microservice architecture, und komplexe ML model integration. Opus ist besser für unbekannte/experimentelle Technologie.
- **Estimated Cost:** ~$15-20
- **Estimated Time:** 20-25h

**User Story:**
Als Benutzer möchte ich einen animierten Avatar sehen, der von einem statischen Bild gesteuert wird, damit ich eine visuell ansprechende Konversation habe.

**Acceptance Criteria:**

- [ ] AC1: LivePortrait Python microservice läuft stabil
- [ ] AC2: Avatar rendert Emotionen (happy, sad, neutral, surprised)
- [ ] AC3: Face landmarks werden korrekt erkannt
- [ ] AC4: Rendering latency <100ms per frame
- [ ] AC5: TypeScript client kommuniziert mit Python service

**Tasks:**

**Research & Architecture:**
- [ ] Task 1.1: Research LivePortrait Python API (Est: 3h)
  - Model download & setup
  - Input/output format
  - Performance characteristics
- [ ] Task 1.2: Design microservice architecture (Est: 2h)
  - REST vs gRPC vs WebSocket
  - Message format (protobuf vs JSON)
  - Error handling strategy

**Python Microservice:**
- [ ] Task 1.3: Create Python microservice scaffold (Est: 3h)
  - FastAPI or Flask setup
  - LivePortrait model loading
  - Health check endpoint
- [ ] Task 1.4: Implement avatar rendering endpoint (Est: 4h)
  - `/render` POST endpoint
  - Image upload handling
  - Emotion parameter support
- [ ] Task 1.5: Add caching layer (Est: 2h)
  - LRU cache for rendered frames
  - Asset caching strategy

**TypeScript Integration:**
- [ ] Task 1.6: Create TypeScript client (Est: 3h)
  - HTTP client for Python service
  - Type definitions
  - Error handling
- [ ] Task 1.7: Build renderer interface (Est: 2h)
  - Abstract renderer (swap later to hyperrealistic)
  - Emotion mapping
- [ ] Task 1.8: Integration tests (Est: 3h)
  - End-to-end avatar rendering
  - Performance benchmarks

**Implementation Notes:**

```typescript
// TypeScript Interface
interface AvatarRenderer {
  render(params: RenderParams): Promise<RenderedFrame>;
  setEmotion(emotion: Emotion): void;
  cleanup(): Promise<void>;
}

// Python Microservice (FastAPI)
@app.post("/api/render")
async def render_avatar(
    image: UploadFile,
    emotion: str,
    params: RenderParams
) -> RenderedFrame:
    # LivePortrait rendering logic
    pass
```

**Python Microservice Structure:**
```
/src/avatar-service/
  ├── main.py                # FastAPI app
  ├── liveportrait_renderer.py  # LivePortrait integration
  ├── models/
  │   └── liveportrait/      # Model weights
  ├── cache.py               # Frame caching
  └── requirements.txt
```

**Tests:**

- [ ] Unit Tests: LivePortrait model loading, emotion mapping
- [ ] Integration Tests: Full render pipeline
- [ ] Performance Tests: Latency < 100ms

**Related:**

- ADR: ADR-11 Alternative B (Stylized approach with swap path)
- Issues: Avatar rendering performance

---

### Feature 2: XTTS Voice Synthesis

**Priority:** 🔴 CRITICAL

**Model:** 🤖 Sonnet 4.5
- **Rationale:** XTTS ist eine bekannte library mit guter Dokumentation. Sonnet reicht für straightforward integration.
- **Estimated Cost:** ~$5-8
- **Estimated Time:** 12-15h

**User Story:**
Als Benutzer möchte ich dass der Avatar mit natürlicher Stimme spricht, damit die Konversation realistisch wirkt.

**Acceptance Criteria:**

- [ ] AC1: XTTS synthesiert natürliche Sprache
- [ ] AC2: Voice cloning von Reference-Audio funktioniert
- [ ] AC3: Synthesis latency <500ms für 5-Sekunden-Audio
- [ ] AC4: Multiple voices/characters unterstützt
- [ ] AC5: Audio quality > 8kHz (phone quality minimum)

**Tasks:**

**XTTS Setup:**
- [ ] Task 2.1: Install & configure XTTS (Est: 2h)
  - Model download
  - GPU/CPU configuration
  - Voice model training
- [ ] Task 2.2: Create TTS service wrapper (Est: 3h)
  - TypeScript → Python bridge
  - Audio streaming
  - Queue management

**Voice Character System:**
- [ ] Task 2.3: Build character voice manager (Est: 3h)
  - Voice profiles storage
  - Reference audio handling
  - Voice cloning interface
- [ ] Task 2.4: Implement voice switching (Est: 2h)
  - Character → voice mapping
  - Smooth transitions

**Integration:**
- [ ] Task 2.5: Integrate with avatar renderer (Est: 2h)
  - Lip-sync coordination
  - Audio/video sync
- [ ] Task 2.6: Add audio processing (Est: 2h)
  - Normalization
  - Noise reduction (optional)
- [ ] Task 2.7: Tests & optimization (Est: 2h)
  - Latency optimization
  - Quality tests

**Implementation Notes:**

```typescript
// TTS Interface
interface TTSEngine {
  synthesize(text: string, voice: VoiceProfile): Promise<AudioBuffer>;
  cloneVoice(referenceAudio: Buffer): Promise<VoiceProfile>;
  setVoice(voiceId: string): void;
}

// XTTS Integration
class XTTSEngine implements TTSEngine {
  async synthesize(text: string, voice: VoiceProfile) {
    // Call Python XTTS service
    const response = await fetch('/api/tts/synthesize', {
      method: 'POST',
      body: JSON.stringify({ text, voiceId: voice.id })
    });
    return await response.arrayBuffer();
  }
}
```

**Tests:**

- [ ] Unit Tests: Voice profile management
- [ ] Integration Tests: Full TTS pipeline
- [ ] Quality Tests: Audio clarity, naturalness

**Related:**

- Feature 1: LivePortrait (lip-sync coordination)
- Feature 4: Character Manager

---

### Feature 3: Whisper STT

**Priority:** 🟡 IMPORTANT

**Model:** 🤖 Sonnet 4.5
- **Rationale:** Whisper integration ist straightforward. Sonnet reicht.
- **Estimated Cost:** ~$3-5
- **Estimated Time:** 8-10h

**User Story:**
Als Benutzer möchte ich mit dem Avatar sprechen können, damit ich hands-free kommunizieren kann.

**Acceptance Criteria:**

- [ ] AC1: Whisper transkribiert Audio zu Text
- [ ] AC2: Multiple languages unterstützt (EN, DE minimum)
- [ ] AC3: Real-time streaming STT (nicht nur batch)
- [ ] AC4: Latency <1s für 5-Sekunden-Audio
- [ ] AC5: Accuracy >90% für clear speech

**Tasks:**

- [ ] Task 3.1: Install & configure Whisper (Est: 2h)
  - Model selection (base vs large)
  - GPU optimization
- [ ] Task 3.2: Create STT service wrapper (Est: 2h)
  - Audio input handling
  - Streaming support
- [ ] Task 3.3: Implement language detection (Est: 2h)
  - Auto-detect language
  - Language switching
- [ ] Task 3.4: Build WebRTC audio capture (Est: 2h)
  - Microphone input
  - Audio chunking for streaming
- [ ] Task 3.5: Integration tests (Est: 2h)
  - Accuracy tests
  - Latency benchmarks

**Implementation Notes:**

```typescript
interface STTEngine {
  transcribe(audio: AudioBuffer): Promise<Transcription>;
  startStreaming(): ReadableStream<Transcription>;
  setLanguage(lang: string): void;
}

class WhisperSTT implements STTEngine {
  async transcribe(audio: AudioBuffer) {
    const response = await fetch('/api/stt/transcribe', {
      method: 'POST',
      body: audio
    });
    return await response.json();
  }
}
```

**Tests:**

- [ ] Unit Tests: Audio preprocessing
- [ ] Integration Tests: Full STT pipeline
- [ ] Accuracy Tests: Test cases for different accents/languages

**Related:**

- Feature 5: WebRTC Streaming

---

### Feature 4: Character Manager

**Priority:** 🟡 IMPORTANT

**Model:** 🤖 Haiku 4.5
- **Rationale:** Character config management ist straightforward CRUD. Haiku ist ausreichend und kosteneffizient.
- **Estimated Cost:** ~$2-3
- **Estimated Time:** 8-10h

**User Story:**
Als Administrator möchte ich verschiedene Avatar-Characters konfigurieren können, damit ich zwischen Personas wechseln kann.

**Acceptance Criteria:**

- [ ] AC1: Character profiles speicherbar (name, avatar image, voice)
- [ ] AC2: Character switching zur Laufzeit möglich
- [ ] AC3: Asset storage (local files, später cloud-ready)
- [ ] AC4: REST API für character CRUD operations
- [ ] AC5: Default character configuration

**Tasks:**

- [ ] Task 4.1: Design character schema (Est: 1h)
  - Profile structure
  - Asset references
- [ ] Task 4.2: Implement character storage (Est: 3h)
  - SQLite or JSON file storage
  - CRUD operations
- [ ] Task 4.3: Build character API (Est: 2h)
  - GET /characters
  - POST /characters
  - PUT /characters/:id
  - DELETE /characters/:id
- [ ] Task 4.4: Add asset upload handling (Est: 2h)
  - Image upload (avatar source)
  - Voice reference audio upload
- [ ] Task 4.5: Tests (Est: 2h)
  - CRUD operation tests
  - Asset storage tests

**Implementation Notes:**

```typescript
interface CharacterProfile {
  id: string;
  name: string;
  avatarImage: string;  // Path to image
  voiceId: string;      // XTTS voice profile
  personality: string;  // System prompt personality
  created: Date;
  updated: Date;
}

class CharacterManager {
  async create(profile: CharacterProfile): Promise<string>;
  async get(id: string): Promise<CharacterProfile>;
  async update(id: string, updates: Partial<CharacterProfile>): Promise<void>;
  async delete(id: string): Promise<void>;
  async list(): Promise<CharacterProfile[]>;
  async setActive(id: string): Promise<void>;
}
```

**Storage:**
```
/data/characters/
  ├── profiles.json          # Character metadata
  └── assets/
      ├── avatar-1.jpg
      ├── avatar-2.jpg
      └── voices/
          ├── voice-1.wav
          └── voice-2.wav
```

**Tests:**

- [ ] Unit Tests: CRUD operations
- [ ] Integration Tests: Full character lifecycle
- [ ] API Tests: REST endpoints

**Related:**

- Feature 2: XTTS (voice profiles)
- Feature 1: LivePortrait (avatar images)

---

### Feature 5: WebRTC Streaming

**Priority:** 🔴 CRITICAL

**Model:** 🤖 Opus 4.6
- **Rationale:** WebRTC ist komplex mit signaling, ICE, STUN/TURN. Opus ist besser für networking challenges.
- **Estimated Cost:** ~$10-15
- **Estimated Time:** 15-20h

**User Story:**
Als Benutzer möchte ich den Avatar in Echtzeit sehen und mit ihm sprechen, damit die Interaktion natürlich wirkt.

**Acceptance Criteria:**

- [ ] AC1: Video stream (avatar) läuft flüssig (30fps)
- [ ] AC2: Audio bidirectional (user → avatar, avatar → user)
- [ ] AC3: Latency <200ms end-to-end
- [ ] AC4: WebRTC signaling functional
- [ ] AC5: NAT traversal (STUN/TURN optional für MVP)

**Tasks:**

**WebRTC Server:**
- [ ] Task 5.1: Setup WebRTC server (Est: 3h)
  - Node.js + simple-peer or mediasoup
  - Signaling server (WebSocket)
- [ ] Task 5.2: Implement video streaming (Est: 4h)
  - Avatar frames → RTP stream
  - Frame rate control (30fps)
- [ ] Task 5.3: Implement audio streaming (Est: 4h)
  - Bidirectional audio
  - Echo cancellation
  - Audio mixing

**Client Integration:**
- [ ] Task 5.4: Build WebRTC client (Est: 3h)
  - Browser-based client
  - getUserMedia() for microphone
  - Video display element
- [ ] Task 5.5: Add latency optimization (Est: 2h)
  - Buffer tuning
  - Jitter buffer
- [ ] Task 5.6: Integration tests (Est: 3h)
  - End-to-end latency tests
  - Network simulation tests

**Implementation Notes:**

```typescript
// Server
class WebRTCServer {
  async createSession(sessionId: string): Promise<RTCPeerConnection>;
  async addVideoTrack(track: MediaStreamTrack): void;
  async addAudioTrack(track: MediaStreamTrack): void;
  on(event: 'data', handler: (data: any) => void): void;
}

// Client
class WebRTCClient {
  async connect(signalingUrl: string): Promise<void>;
  getVideoElement(): HTMLVideoElement;
  startMicrophone(): Promise<MediaStream>;
  on(event: 'transcription', handler: (text: string) => void): void;
}
```

**Architecture:**
```
Browser (WebRTC Client)
   ↓ WebSocket signaling
WebRTC Server
   ↓ Video frames
LivePortrait Service
   ↓ Audio
XTTS Service
   ↓ STT
Whisper Service
```

**Tests:**

- [ ] Unit Tests: Signaling protocol
- [ ] Integration Tests: Full streaming pipeline
- [ ] Performance Tests: Latency < 200ms

**Related:**

- Feature 1: LivePortrait (video source)
- Feature 2: XTTS (audio source)
- Feature 3: Whisper (audio input)

---

### Feature 6: Simple Test UI

**Priority:** 🟢 NICE TO HAVE

**Model:** 🤖 Haiku 4.5
- **Rationale:** Einfache HTML/JS UI für testing. Haiku reicht.
- **Estimated Cost:** ~$1-2
- **Estimated Time:** 4-6h

**User Story:**
Als Entwickler möchte ich eine einfache Test-UI haben, damit ich das Avatar-System schnell testen kann.

**Acceptance Criteria:**

- [ ] AC1: Browser-based UI läuft
- [ ] AC2: Character selection dropdown
- [ ] AC3: Video display für Avatar
- [ ] AC4: Microphone input button
- [ ] AC5: Text-to-speech test button

**Tasks:**

- [ ] Task 6.1: Create HTML/JS frontend (Est: 2h)
  - Video display
  - Audio controls
  - Character selector
- [ ] Task 6.2: Add WebRTC client integration (Est: 2h)
  - Connect to WebRTC server
  - Display avatar stream
- [ ] Task 6.3: Add test controls (Est: 2h)
  - Manual emotion trigger
  - TTS test input
  - STT visualization

**Implementation Notes:**

```html
<!-- Simple Test UI -->
<!DOCTYPE html>
<html>
<head>
  <title>Avatar Test UI</title>
</head>
<body>
  <h1>Avatar System Test</h1>

  <select id="character-select">
    <option value="default">Default Character</option>
  </select>

  <video id="avatar-video" autoplay></video>

  <button id="start-mic">Start Microphone</button>
  <input id="tts-input" placeholder="Type text to speak">
  <button id="tts-speak">Speak</button>

  <div id="transcription"></div>
</body>
</html>
```

**Tests:**

- [ ] Manual Tests: UI functionality
- [ ] E2E Tests: Full user journey

---

## 🚫 Out of Scope

- ❌ Hyperrealistic avatar (Plan: Switch in Sprint 05-06)
- ❌ Cloud deployment (Keep local for MVP)
- ❌ Multi-user support (Single user for now)
- ❌ Advanced character AI (Keep simple personality system)
- ❌ Mobile app (Browser only for MVP)

---

## 🔗 CI/CD Improvement

**Last CI Status:** ✅ Passed (Sprint 02)

**Improvements for this sprint:**
- [ ] Add avatar rendering performance tests to CI
- [ ] Add Python microservice to CI pipeline
- [ ] Monitor WebRTC latency in CI

---

## 📚 Patterns (aus BEST_PRACTICE.md)

**Zu beachten:**

- ✅ Microservices: Python services für ML models, TypeScript für business logic
- ✅ Abstraction: Renderer interface erlaubt späteren swap zu hyperrealistic
- ✅ Performance First: Target <200ms latency für real-time feeling
- ❌ Anti-Pattern: Nicht zu früh optimieren - MVP first, dann optimize

---

## 🔄 Dependencies & Blockers

**Dependencies:**

- [x] Sprint 02 Complete (Security & Code Organization) ✅
- [ ] LivePortrait model download (3-5 GB)
- [ ] XTTS model download (1-2 GB)
- [ ] Whisper model download (500 MB - 3 GB)

**Potential Blockers:**

- ⚠️  Python environment setup (conda/venv conflicts)
- ⚠️  GPU availability (CUDA required for reasonable performance)
- ⚠️  Model download time (slow internet)
- ⚠️  WebRTC NAT traversal (may need STUN/TURN server)

---

## 📊 Sprint Metrics (wird automatisch aktualisiert)

### Velocity

- **Planned Story Points:** ~75h
- **Completed:** - (wird am Ende gefüllt)

### Time Tracking

| Feature                    | Estimated | Actual |
| -------------------------- | --------- | ------ |
| LivePortrait Integration   | 25h       | -      |
| XTTS Voice Synthesis       | 15h       | -      |
| Whisper STT                | 10h       | -      |
| Character Manager          | 10h       | -      |
| WebRTC Streaming           | 20h       | -      |
| Test UI                    | 6h        | -      |
| **TOTAL**                  | **86h**   | -      |

---

## 🔍 Persona Review Findings (End of Sprint)

### 🏗️ Senior Architekt

**CRITICAL:** [Auto-Fix via Hook]
**IMPORTANT:** [Auto-Fix via Hook]
**NICE TO HAVE:** → docs/TECHNICAL_DEBT.md

### 🧪 Senior Tester

**CRITICAL:** [Auto-Fix via Hook]
**IMPORTANT:** [Auto-Fix via Hook]
**NICE TO HAVE:** → docs/TECHNICAL_DEBT.md

### 💻 Senior Developer

**CRITICAL:** [Auto-Fix via Hook]
**IMPORTANT:** [Auto-Fix via Hook]
**NICE TO HAVE:** → docs/TECHNICAL_DEBT.md

### 🔒 Senior Security Engineer

**CRITICAL:** [Auto-Fix via Hook]
**IMPORTANT:** [Auto-Fix via Hook]
**NICE TO HAVE:** → docs/TECHNICAL_DEBT.md

**Hinweis:** Findings werden automatisch von Post-Sprint Hook verarbeitet.

---

## 📚 Documentation Updates (Ende des Sprints)

### docs-secretary/ (Planning Docs) ✅

- [ ] Sprint file marked complete
- [ ] BEST_PRACTICE.md updated with avatar learnings
- [ ] ADRs updated if architecture changed
- [ ] Use cases updated for avatar interactions

### docs/ (System Docs) - If Applicable ✅

- [ ] **New features documented:**
  - [ ] Created `docs/avatar/liveportrait.md`
  - [ ] Created `docs/avatar/tts.md`
  - [ ] Created `docs/avatar/stt.md`
  - [ ] Created `docs/avatar/character-manager.md`
  - [ ] Created `docs/avatar/webrtc.md`
  - [ ] Added to docs index
- [ ] **API changes:**
  - [ ] Updated OpenAPI spec with avatar endpoints
  - [ ] WebRTC signaling protocol documented

### What Docs Were Updated?

- Avatar system architecture
- Character management API
- WebRTC streaming setup
- Performance optimization guide

### Links to New/Updated Docs:

- docs-secretary/architecture/avatar-system.md
- docs/avatar/README.md
- docs/api/avatar-endpoints.md

## 📝 Sprint Retrospective (Ende)

### What went well? 👍

- (Am Ende ausfüllen)

### What could be improved? 🤔

- (Am Ende ausfüllen)

### Learnings → BEST_PRACTICE.md

- (Am Ende ausfüllen)

**Status:** 🟡 In Progress
