# ADR-11: Conversational Avatar Interface

**Status:** 🟡 Diskussion
**Datum:** 2026-02-15
**Kontext:** Integration eines realistischen Avatar-Interfaces für OpenClaw Bot

---

## Problem Statement

**Anforderung:** Ein realistischer, sprechender Avatar als Frontend-Interface, der:

- Mit Nutzern per Sprache kommuniziert (Voice-to-Voice)
- Natürliche Lippensynchronisation hat
- Eigenes LLM-Backend nutzt (OpenClaw Agent)
- Möglichst realistische visuelle Darstellung
- In Echtzeit reagiert (<500ms Latenz)

**Use Cases:**

- Persönlicher Assistent mit menschlichem Gesicht
- Video-Call-ähnliche Interaktion
- Alternative zu Text-basierten Messaging-Channels
- Erhöhte Engagement durch visuelles Feedback

---

## Technische Anforderungen

### Funktional

- **Voice Input:** Speech-to-Text (STT) Echtzeit
- **LLM Processing:** Integration mit OpenClaw Agent
- **Voice Output:** Text-to-Speech (TTS) mit Emotion
- **Avatar Animation:** Lippensync + Gesichtsausdrücke
- **Video Streaming:** WebRTC oder ähnlich

### Non-Funktional

- **Latenz:** End-to-End <2s (Speech Input → Avatar Response)
- **Quality:** Mindestens 720p Video, 48kHz Audio
- **Ressourcen:** Sollte auf Consumer-Hardware laufen (oder Cloud)
- **Skalierung:** 1-10 concurrent Sessions

---

## Alternative A: LivePortrait + XTTS (Open Source, Echtzeit)

### Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser/Client                          │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐     │
│  │ Microphone │→ │ WebRTC Audio │→ │ Video Player    │     │
│  └────────────┘  └──────────────┘  └─────────────────┘     │
└────────────┬─────────────┬─────────────────┬────────────────┘
             │             │                 │
             ▼             ▼                 ▼
    ┌────────────┐  ┌──────────────┐  ┌─────────────┐
    │ STT Service│  │  WebSocket   │  │Video Stream │
    │  (Whisper) │  │   Gateway    │  │   Server    │
    └─────┬──────┘  └──────┬───────┘  └──────▲──────┘
          │                │                  │
          ▼                ▼                  │
    ┌─────────────────────────────────────────┴──────┐
    │         OpenClaw Agent Runtime                 │
    │  ┌──────────────┐  ┌────────────────────┐    │
    │  │ LLM Backend  │  │  Context Manager   │    │
    │  │ (Claude/GPT) │  │                    │    │
    │  └──────┬───────┘  └────────────────────┘    │
    └─────────┼──────────────────────────────────────┘
              ▼
    ┌──────────────────────────────────────────┐
    │  Avatar Generation Pipeline              │
    │  ┌──────────┐  ┌─────────────┐  ┌──────┐│
    │  │   TTS    │→ │ LivePortrait │→ │Video ││
    │  │  (XTTS)  │  │  Animation   │  │Encode││
    │  └──────────┘  └─────────────┘  └──────┘│
    └──────────────────────────────────────────┘
```

### Stack-Details

**1. Speech-to-Text: Whisper (OpenAI)**

```python
import whisper

model = whisper.load_model("base.en")  # oder "medium" für bessere Qualität

async def transcribe_audio_stream(audio_chunk: bytes) -> str:
    result = model.transcribe(
        audio_chunk,
        language="de",  # oder "en"
        fp16=False  # CPU-kompatibel
    )
    return result["text"]
```

**2. Text-to-Speech: XTTS v2 (Coqui)**

```python
from TTS.api import TTS

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")

async def generate_speech(text: str, reference_audio: str) -> bytes:
    # Voice cloning mit Referenz-Audio
    wav = tts.tts(
        text=text,
        speaker_wav=reference_audio,
        language="de"
    )
    return wav  # Audio bytes
```

**3. Avatar Animation: LivePortrait**

```python
from liveportrait import LivePortrait

animator = LivePortrait(
    model_path="checkpoints/liveportrait",
    device="cuda"  # oder "cpu"
)

async def animate_avatar(
    source_image: str,  # Statisches Portraitfoto
    driving_audio: bytes  # TTS-generiertes Audio
) -> bytes:
    video_frames = animator.animate(
        source_image=source_image,
        audio=driving_audio,
        fps=25
    )
    return encode_video(video_frames)  # MP4 oder WebM
```

**4. Integration in OpenClaw**

```typescript
// Neuer Channel: "avatar"
class AvatarChannel implements Channel {
  private whisper: WhisperSTT;
  private xtts: XTTSSTT;
  private livePortrait: LivePortraitAnimator;

  async handleIncomingAudio(audioStream: ReadableStream) {
    // 1. STT
    const text = await this.whisper.transcribe(audioStream);

    // 2. Send to Agent (wie WhatsApp/Telegram)
    const response = await this.sendToAgent({
      sessionId: this.sessionId,
      channel: "avatar",
      content: { type: "text", text },
    });

    // 3. TTS
    const audioResponse = await this.xtts.synthesize(response.content.text, this.userVoiceProfile);

    // 4. Avatar Animation
    const videoStream = await this.livePortrait.animate(this.avatarImage, audioResponse);

    // 5. Stream zurück zu Client
    return videoStream;
  }
}
```

### Vorteile

- ✅ **Vollständige Kontrolle** über alle Komponenten
- ✅ **Open Source** - keine Vendor Lock-in
- ✅ **On-Premise** möglich - keine Cloud-Abhängigkeit
- ✅ **Customization** - eigene Modelle, eigene Avatare
- ✅ **Kosteneffizient** - nur GPU/CPU Kosten, keine API-Gebühren
- ✅ **Privacy** - alle Daten bleiben lokal

### Nachteile

- ❌ **Hardware-Anforderungen** - braucht GPU (min. RTX 3060) für Echtzeit
- ❌ **Setup-Komplexität** - mehrere ML-Modelle orchestrieren
- ❌ **Qualität** - nicht ganz so gut wie kommerzielle Lösungen
- ❌ **Latenz** - 1-3s für komplette Pipeline (akzeptabel)
- ❌ **Wartungsaufwand** - Modell-Updates, Bug-Fixes

### Hardware-Anforderungen

- **CPU:** 8+ Cores (für Whisper + Backend)
- **GPU:** NVIDIA RTX 3060+ (12GB VRAM) für Echtzeit-Animation
- **RAM:** 16GB+
- **Storage:** 20GB für Modelle

### Geschätzte Latenz (RTX 4090)

| Pipeline-Schritt         | Latenz                |
| ------------------------ | --------------------- |
| STT (Whisper base)       | ~200ms (pro 3s Audio) |
| LLM (Claude API)         | 500-2000ms            |
| TTS (XTTS)               | ~500ms (pro Satz)     |
| Animation (LivePortrait) | ~300ms (für 3s Video) |
| **Total**                | **~1.5-3s**           |

### Kosten

- **Entwicklung:** 🟡 Mittel (2-3 Wochen)
- **Hardware (einmalig):** €1,500-3,000 (GPU-Server)
- **Betrieb:** €0 (außer Strom) + LLM API Kosten

---

## Alternative B: D-ID API (Kommerziell, Plug & Play)

### Architektur

```
┌──────────────┐
│   Browser    │
│ (D-ID SDK)   │
└──────┬───────┘
       │ WebRTC
       ▼
┌──────────────────┐
│  D-ID Streaming  │  ← Managed Service
│      API         │
└──────┬───────────┘
       │ Webhook/WebSocket
       ▼
┌─────────────────────┐
│  OpenClaw Gateway   │
│  (Custom Backend)   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────┐
│ OpenClaw Agent  │
│  (Dein LLM)     │
└─────────────────┘
```

### Integration

```typescript
import { DIDClient } from "@d-id/client-sdk";

class DIDIntegration {
  private didClient: DIDClient;

  async startConversation(avatarImageUrl: string) {
    // 1. Create D-ID Stream
    const stream = await this.didClient.streams.create({
      source_url: avatarImageUrl,
      stream_warmup: true,
    });

    // 2. Connect WebSocket für Bidirektionale Kommunikation
    const ws = new WebSocket(stream.session_url);

    ws.on("user_speech", async (text: string) => {
      // 3. Send to OpenClaw
      const response = await this.sendToAgent({
        channel: "did-avatar",
        content: { type: "text", text },
      });

      // 4. Send back to D-ID für Animation
      ws.send({
        type: "speak",
        text: response.content.text,
      });
    });
  }
}
```

### Vorteile

- ✅ **Beste Qualität** - State-of-the-Art Animation
- ✅ **Einfachste Integration** - SDK + API
- ✅ **Niedrige Latenz** - <1s in guten Netzwerken
- ✅ **Keine Hardware** - läuft in Cloud
- ✅ **Schnelle Time-to-Market** - <1 Woche Integration

### Nachteile

- ❌ **Kosten:** $0.20-0.50 pro Minute (kann teuer werden)
- ❌ **Vendor Lock-in** - abhängig von D-ID
- ❌ **Privacy Concerns** - Audio/Video geht durch D-ID Server
- ❌ **Limited Customization** - kann nicht alles anpassen
- ❌ **Netzwerk-Abhängigkeit** - braucht stabile Verbindung

### Kosten

| Nutzung     | Monatliche Kosten |
| ----------- | ----------------- |
| 10h/Monat   | ~$120-300         |
| 100h/Monat  | ~$1,200-3,000     |
| 1000h/Monat | ~$12,000-30,000   |

### Geschätzte Latenz

- **End-to-End:** 800ms-1.5s (optimiert)

---

## Alternative C: Hybrid - HeyGen + Custom LLM Backend

### Architektur

```
┌──────────────┐
│   Browser    │
└──────┬───────┘
       │
┌──────▼──────────────────┐
│  HeyGen Streaming API   │ ← Managed (Video + TTS)
└──────┬──────────────────┘
       │ Real-time Event Stream
       ▼
┌─────────────────────────┐
│  Middleware/Orchestrator │
│   (WebSocket Proxy)     │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│   OpenClaw Agent        │
│   (Custom LLM)          │
└─────────────────────────┘
```

### Integration Pattern

```typescript
class HeyGenOrchestrator {
  async streamConversation(sessionId: string) {
    // 1. Start HeyGen Stream
    const heygenStream = await heygenClient.streaming.start({
      avatar_id: "custom-avatar-id",
      voice_id: "custom-voice-id",
    });

    // 2. Bidirectional Proxy
    const userToAgent = heygenStream.on("user_transcript", async (text) => {
      const agentResponse = await openclawAgent.process({
        sessionId,
        input: text,
      });

      // Send back to HeyGen for rendering
      await heygenStream.task.repeat({
        text: agentResponse.text,
        task_type: "repeat",
      });
    });

    return heygenStream.sessionUrl;
  }
}
```

### Vorteile

- ✅ **Exzellente Qualität** - HeyGen führend in realistischer Animation
- ✅ **Custom LLM Backend** - volle Kontrolle über AI-Logik
- ✅ **Managed Video/TTS** - reduziert eigene Infrastruktur
- ✅ **Moderate Latenz** - ~1-2s

### Nachteile

- ❌ **Höhere Kosten** - ähnlich wie D-ID
- ❌ **Partial Lock-in** - Video-Teil abhängig von HeyGen
- ❌ **Komplexität** - Orchestrierung zwischen HeyGen + OpenClaw

### Kosten

- Ähnlich wie D-ID: $0.15-0.40/Minute
- Plus: OpenClaw Betrieb + LLM API

---

## Alternative D: SadTalker + Offline (Budget-Variante)

### Architektur

```
┌──────────────┐
│   Browser    │
└──────┬───────┘
       │ Upload Audio
       ▼
┌──────────────────────┐
│  OpenClaw Gateway    │
└──────┬───────────────┘
       │
┌──────▼──────────────────┐
│  SadTalker Pipeline     │
│  ┌─────┐  ┌──────────┐ │
│  │ TTS │→ │SadTalker │ │
│  └─────┘  └──────────┘ │
└──────┬──────────────────┘
       │
       ▼ Rendered Video
┌──────────────┐
│   Browser    │
│ (Video Play) │
└──────────────┘
```

### Charakteristik

- **Nicht-Echtzeit:** User sendet Frage → wartet 5-10s → bekommt Video
- **Offline:** Alles lokal, keine Cloud
- **Günstig:** Nur GPU + Strom

### Vorteile

- ✅ **100% Privacy** - nichts verlässt Server
- ✅ **Niedrige Kosten** - nur Hardware
- ✅ **Einfach** - weniger Moving Parts

### Nachteile

- ❌ **Keine Echtzeit** - 5-15s Verzögerung
- ❌ **Schlechtere UX** - kein fließendes Gespräch
- ❌ **Quality** - nicht so gut wie Alternativen A-C

---

## Vergleichsmatrix

| Kriterium        | Alternative A (LivePortrait) | Alternative B (D-ID) | Alternative C (HeyGen) | Alternative D (SadTalker) |
| ---------------- | ---------------------------- | -------------------- | ---------------------- | ------------------------- |
| **Qualität**     | ⭐⭐⭐ Gut                   | ⭐⭐⭐⭐⭐ Exzellent | ⭐⭐⭐⭐⭐ Exzellent   | ⭐⭐ OK                   |
| **Latenz**       | 🟡 1.5-3s                    | 🟢 <1s               | 🟡 1-2s                | 🔴 5-15s                  |
| **Kosten/Monat** | 💰 €50-150 (GPU)             | 💰💰💰 €500-3000     | 💰💰💰 €400-2500       | 💰 €30-80                 |
| **Privacy**      | 🟢 100% lokal                | 🔴 Cloud-basiert     | 🔴 Cloud-basiert       | 🟢 100% lokal             |
| **Setup**        | 🟡 Mittel                    | 🟢 Einfach           | 🟢 Einfach             | 🟢 Einfach                |
| **Control**      | 🟢 Vollständig               | 🔴 Limited           | 🟡 Partial             | 🟢 Vollständig            |
| **Hardware**     | RTX 3060+                    | Keine                | Keine                  | RTX 2060+                 |
| **Echtzeit**     | ✅ Ja                        | ✅ Ja                | ✅ Ja                  | ❌ Nein                   |

---

## Integration in OpenClaw Architektur

### Modulare Integration (empfohlen)

```typescript
// Neue Komponente: AvatarService
interface AvatarService {
  startSession(config: AvatarConfig): Promise<AvatarSession>;
  processAudio(sessionId: string, audio: Buffer): Promise<VideoStream>;
  endSession(sessionId: string): Promise<void>;
}

// Implementation Variants
class LivePortraitAvatarService implements AvatarService {
  /* ... */
}
class DIDavatarService implements AvatarService {
  /* ... */
}
class HeyGenAvatarService implements AvatarService {
  /* ... */
}

// In OpenClaw Gateway
class Gateway {
  private avatarService: AvatarService;

  constructor(config: GatewayConfig) {
    // Factory Pattern - wähle Implementation
    this.avatarService = AvatarServiceFactory.create(
      config.avatarProvider, // 'liveportrait' | 'did' | 'heygen'
    );
  }

  async handleAvatarChannel(message: InboundMessage) {
    // Einheitliche Schnittstelle, egal welche Implementation
    const videoResponse = await this.avatarService.processAudio(
      message.sessionId,
      message.audioData,
    );

    return videoResponse;
  }
}
```

### Bezug zu unseren ADRs

**ADR-01 (Architektur):**

- Avatar Service als **eigenständiger Service** (Microservices)
- Oder als **Modul** im Monolithen
- → Empfehlung: Eigenständig wegen GPU-Requirements

**ADR-05 (Message Broker):**

- Audio-Streaming via **WebRTC** (nicht Message Broker)
- LLM-Anfragen weiterhin via Broker
- → Hybrid-Ansatz

**ADR-03 (Sandboxing):**

- Avatar-Service braucht **GPU-Zugriff** (keine Sandbox)
- Isoliert von Tool-Execution
- → Eigener Pod/Container

---

## 🗳️ Empfehlung

### Für MVP / Prototyping

**Alternative B (D-ID API)**

- Schnellste Time-to-Market (1 Woche)
- Minimales Risiko
- Beweise Use Case, bevor große Investment

### Für Production / Scale

**Alternative A (LivePortrait + XTTS)**

- Langfristig günstiger bei >50h/Monat Nutzung
- Volle Kontrolle und Privacy
- Skalierbar mit eigener Infra

### Für Budget-Constrained

**Alternative D (SadTalker)**

- Funktioniert, aber UX leidet
- Gut für Demos, nicht für Production

### Hybrid-Strategie

1. **Phase 1 (Monat 1-2):** D-ID für MVP
2. **Phase 2 (Monat 3-6):** Parallel LivePortrait entwickeln
3. **Phase 3 (Monat 6+):** Migration zu LivePortrait wenn ROI positiv

---

## Implementierungs-Roadmap

### Quick Start (Alternative B - D-ID)

**Woche 1:**

- [ ] D-ID Account + API Keys
- [ ] Avatar erstellen (Custom Photo)
- [ ] SDK Integration in OpenClaw

**Woche 2:**

- [ ] WebSocket Proxy bauen
- [ ] OpenClaw Agent anbinden
- [ ] Testing + Finetuning

**Woche 3:**

- [ ] Frontend (React/Vue)
- [ ] Deployment
- [ ] User Testing

**Aufwand:** 3 Wochen, 1 Developer

### Full Stack (Alternative A - LivePortrait)

**Wochen 1-2:**

- [ ] Hardware Setup (GPU Server)
- [ ] Whisper Integration
- [ ] XTTS Integration

**Wochen 3-4:**

- [ ] LivePortrait Setup
- [ ] Pipeline Orchestrierung
- [ ] Latenz-Optimierung

**Wochen 5-6:**

- [ ] Frontend (WebRTC)
- [ ] OpenClaw Integration
- [ ] Testing

**Aufwand:** 6-8 Wochen, 2 Developers

---

## Offene Fragen

1. **Budget:** Wie viel € pro Monat für Avatar-Service?
2. **Nutzung:** Geschätzte Stunden/Monat?
3. **Privacy:** Ist Cloud-Processing akzeptabel?
4. **Hardware:** Hast du bereits GPU-Server?
5. **Timeline:** Wie schnell soll es live gehen?
6. **Sprache:** Primär Deutsch, Englisch, oder multilingual?

---

## Nächste Schritte

1. **Entscheidung:** Welche Alternative passt zu deinen Constraints?
2. **Proof-of-Concept:** 1-2 Wochen mit gewählter Lösung
3. **Integration Planning:** Wie fügt sich in OpenClaw-Architecture ein?
4. **Resource Planning:** Hardware/API-Budget freigeben

**Was ist deine initiale Präferenz? Oder soll ich eine detaillierte Kosten-Nutzen-Analyse für deine spezifische Situation erstellen?**
