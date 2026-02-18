# Frontend Planning - OpenClaw AI Assistant

**Datum:** 2026-02-15
**Status:** Planning

---

## 🎨 Frontend-Komponenten (Ja, mehrere geplant!)

### Übersicht der UIs

```
OpenClaw Frontend Ecosystem
├── 1. Avatar Chat Interface (WebRTC)      ← Hauptinterface
├── 2. Admin Dashboard                     ← System-Management
├── 3. Character Customization Studio      ← Avatar-Erstellung
├── 4. Message History Viewer              ← Conversation Browser
└── 5. Kill Switch Control Panel           ← Emergency Controls
```

---

## 1️⃣ Avatar Chat Interface (Primary UI)

### Technologie

- **Framework:** React 18 + TypeScript
- **Video:** WebRTC für Avatar-Stream
- **Audio:** Web Audio API für Voice Input
- **Styling:** TailwindCSS

### Features

```tsx
// Main Chat Interface
┌────────────────────────────────────────────────┐
│  OpenClaw Assistant                      [⚙️]  │
├────────────────────────────────────────────────┤
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │                                          │ │
│  │        Avatar Video Stream               │ │
│  │     (LivePortrait Animation)             │ │
│  │                                          │ │
│  │          [Character Badge]               │ │
│  │         Cyberpunk Assistant              │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  Transcript:                                   │
│  ┌──────────────────────────────────────────┐ │
│  │ You: Hello!                              │ │
│  │ Assistant: Hi! How can I help?           │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ [🎤 Hold to Speak]  [⌨️ Type]           │ │
│  └──────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

### Implementation

```tsx
// src/frontend/components/AvatarChat.tsx
import { useEffect, useRef, useState } from "react";
import { useWebRTC } from "../hooks/useWebRTC";

export function AvatarChat() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<Message[]>([]);

  const { startSession, sendAudio } = useWebRTC();

  useEffect(() => {
    // Start Avatar Session
    startSession({
      characterId: "default",
      onVideoStream: (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      },
      onTranscript: (msg) => {
        setTranscript((prev) => [...prev, msg]);
      },
    });
  }, []);

  const handleVoiceInput = async () => {
    setIsRecording(true);

    // Record audio (5s max)
    const audio = await recordAudio(5000);

    // Send to backend
    await sendAudio(audio);

    setIsRecording(false);
    // Avatar responds automatically via WebRTC stream
  };

  return (
    <div className="avatar-chat-container">
      {/* Avatar Video */}
      <div className="video-container">
        <video ref={videoRef} autoPlay playsInline className="avatar-video" />
        <div className="character-badge">Cyberpunk Assistant</div>
      </div>

      {/* Transcript */}
      <div className="transcript">
        {transcript.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <strong>{msg.role}:</strong> {msg.text}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="controls">
        <button
          onMouseDown={handleVoiceInput}
          onMouseUp={() => setIsRecording(false)}
          className={isRecording ? "recording" : ""}
        >
          {isRecording ? "🎤 Listening..." : "🎤 Hold to Speak"}
        </button>

        <button onClick={() => setShowTextInput(true)}>⌨️ Type</button>
      </div>
    </div>
  );
}
```

---

## 2️⃣ Admin Dashboard

### Features

```
┌────────────────────────────────────────────────┐
│  OpenClaw Admin Dashboard            [@admin]  │
├────────────────────────────────────────────────┤
│  System Status                                 │
│  ┌──────────────────────────────────────────┐ │
│  │ ✅ Running  │ Sessions: 3  │ CPU: 45%    │ │
│  │ LLM: ✅     │ Tools: ✅    │ Avatar: ✅  │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  Active Sessions                               │
│  ┌──────────────────────────────────────────┐ │
│  │ Session-123  │ WhatsApp │ 5min    [Kill] │ │
│  │ Session-456  │ Avatar   │ 12min   [Kill] │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  Kill Switch                                   │
│  ┌──────────────────────────────────────────┐ │
│  │ [🚨 EMERGENCY SHUTDOWN]                  │ │
│  │ Status: Ready                            │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  Metrics (Last Hour)                           │
│  ┌──────────────────────────────────────────┐ │
│  │ Messages: 45  │ LLM Tokens: 12.5k       │ │
│  │ Avg Latency: 1.2s │ Errors: 0          │ │
│  └──────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

### Implementation

```tsx
// src/frontend/components/AdminDashboard.tsx
export function AdminDashboard() {
  const { systemStatus, sessions, metrics } = useAdmin();

  const handleEmergencyShutdown = async () => {
    if (confirm("Really shutdown system?")) {
      await fetch("/api/emergency/kill", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          reason: "manual",
          metadata: { source: "admin-ui" },
        }),
      });
    }
  };

  return (
    <div className="admin-dashboard">
      <SystemStatus status={systemStatus} />
      <ActiveSessions sessions={sessions} />

      <div className="kill-switch-panel">
        <button onClick={handleEmergencyShutdown} className="kill-switch-btn">
          🚨 EMERGENCY SHUTDOWN
        </button>
      </div>

      <MetricsPanel metrics={metrics} />
    </div>
  );
}
```

---

## 3️⃣ Character Customization Studio

### Features

```
┌────────────────────────────────────────────────┐
│  Character Studio                              │
├────────────────────────────────────────────────┤
│  Create New Character                          │
│  ┌──────────────────────────────────────────┐ │
│  │                                          │ │
│  │  Method:                                 │ │
│  │  ○ Upload Photo                          │ │
│  │  ● Generate with AI                      │ │
│  │  ○ Use 3D Model                          │ │
│  │                                          │ │
│  │  AI Prompt:                              │ │
│  │  ┌────────────────────────────────────┐ │ │
│  │  │ Cyberpunk assistant, neon colors,  │ │ │
│  │  │ 1980s retro aesthetic, friendly    │ │ │
│  │  └────────────────────────────────────┘ │ │
│  │                                          │ │
│  │  [Generate Character]                    │ │
│  │                                          │ │
│  │  Preview:                                │ │
│  │  ┌────────────────────────────────────┐ │ │
│  │  │                                    │ │ │
│  │  │    [Generated Portrait]            │ │ │
│  │  │                                    │ │ │
│  │  └────────────────────────────────────┘ │ │
│  │                                          │ │
│  │  Voice Profile:                          │ │
│  │  ○ Upload Reference Audio               │ │
│  │  ● Use Default Voice                    │ │
│  │                                          │ │
│  │  [Save Character]                        │ │
│  └──────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

### Implementation

```tsx
// src/frontend/components/CharacterStudio.tsx
export function CharacterStudio() {
  const [method, setMethod] = useState<"upload" | "ai" | "3d">("ai");
  const [aiPrompt, setAiPrompt] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const handleGenerateCharacter = async () => {
    const response = await fetch("/api/characters/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Custom Character",
        imagePrompt: aiPrompt,
        aiService: "dalle", // or 'midjourney'
      }),
    });

    const { character } = await response.json();
    setPreview(character.portraitUrl);
  };

  const handleSave = async () => {
    await fetch("/api/characters", {
      method: "POST",
      body: formData,
    });

    navigate("/characters");
  };

  return (
    <div className="character-studio">
      <h2>Create New Character</h2>

      <div className="method-selector">
        <label>
          <input
            type="radio"
            value="upload"
            checked={method === "upload"}
            onChange={() => setMethod("upload")}
          />
          Upload Photo
        </label>
        {/* ... other methods */}
      </div>

      {method === "ai" && (
        <div className="ai-generator">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe your character..."
          />
          <button onClick={handleGenerateCharacter}>Generate Character</button>
        </div>
      )}

      {preview && (
        <div className="preview">
          <img src={preview} alt="Character Preview" />
        </div>
      )}

      <button onClick={handleSave}>Save Character</button>
    </div>
  );
}
```

---

## 4️⃣ Message History Viewer

### Features

```
┌────────────────────────────────────────────────┐
│  Conversation History                          │
├────────────────────────────────────────────────┤
│  Sessions                      Search: [____]  │
│  ┌──────────────────────────────────────────┐ │
│  │ Today                                    │ │
│  │ ├─ Session-789 (WhatsApp) - 10:30 AM    │ │
│  │ ├─ Session-456 (Avatar)   - 2:15 PM     │ │
│  │                                          │ │
│  │ Yesterday                                │ │
│  │ ├─ Session-123 (Telegram) - 9:00 AM     │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  Messages (Session-789)                        │
│  ┌──────────────────────────────────────────┐ │
│  │ [10:30] You: Check my calendar           │ │
│  │ [10:30] AI: You have 3 meetings today... │ │
│  │ [10:32] You: What's the weather?         │ │
│  │ [10:32] AI: Currently 72°F and sunny...  │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  [Export JSON] [Export CSV] [Delete Session]  │
└────────────────────────────────────────────────┘
```

---

## 5️⃣ Kill Switch Control Panel (Standalone)

### Features

```
┌────────────────────────────────────────────────┐
│  🚨 EMERGENCY CONTROLS                         │
├────────────────────────────────────────────────┤
│  System Status: RUNNING ✅                     │
│  LLM Status:    ENABLED ✅                     │
│  Messaging:     ENABLED ✅                     │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │                                          │ │
│  │     [🚨 EMERGENCY SHUTDOWN]              │ │
│  │                                          │ │
│  │  This will:                              │ │
│  │  • Stop all message processing           │ │
│  │  • Disconnect LLM                        │ │
│  │  • Cancel running tools                  │ │
│  │  • Require manual restart                │ │
│  │                                          │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  Shutdown Reason:                              │
│  ○ Security Incident                           │
│  ○ Runaway Agent                               │
│  ● Manual (User Requested)                     │
│  ○ Emergency                                   │
│                                                │
│  Admin Token: [______________]                 │
│                                                │
│  [ACTIVATE KILL SWITCH]                        │
└────────────────────────────────────────────────┘
```

---

## 📦 Frontend Architecture

```
frontend/
├── src/
│   ├── components/
│   │   ├── AvatarChat/
│   │   │   ├── AvatarChat.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   ├── VoiceInput.tsx
│   │   │   └── Transcript.tsx
│   │   ├── AdminDashboard/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── SystemStatus.tsx
│   │   │   ├── SessionList.tsx
│   │   │   └── KillSwitchPanel.tsx
│   │   ├── CharacterStudio/
│   │   │   ├── Studio.tsx
│   │   │   ├── AIGenerator.tsx
│   │   │   ├── PhotoUpload.tsx
│   │   │   └── Preview.tsx
│   │   └── HistoryViewer/
│   │       ├── Viewer.tsx
│   │       ├── SessionList.tsx
│   │       └── MessageList.tsx
│   ├── hooks/
│   │   ├── useWebRTC.ts
│   │   ├── useAdmin.ts
│   │   ├── useCharacter.ts
│   │   └── useHistory.ts
│   ├── api/
│   │   ├── avatarApi.ts
│   │   ├── adminApi.ts
│   │   ├── characterApi.ts
│   │   └── historyApi.ts
│   ├── App.tsx
│   └── main.tsx
├── public/
├── package.json
└── vite.config.ts
```

---

## 🚀 Deployment (Frontend)

### Development

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Production

```bash
npm run build
# → dist/ folder

# Serve via Backend
# src/api/static.ts
app.use(express.static('frontend/dist'));
```

---

## 🎨 Design System (TailwindCSS)

```typescript
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        "claw-dark": "#1a1a2e",
        "claw-accent": "#00d9ff",
        "claw-danger": "#ff006e",
        "claw-success": "#06ffa5",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
};
```

---

## 📱 Mobile Responsive

```tsx
// Responsive Design
<div className="
  grid
  grid-cols-1
  md:grid-cols-2
  lg:grid-cols-3
  gap-4
">
  {/* Responsive Grid */}
</div>

// Mobile-First Avatar Chat
<div className="
  flex
  flex-col
  h-screen
  max-w-4xl
  mx-auto
">
  {/* Mobile-Optimized */}
</div>
```

---

## ✅ Frontend Roadmap

| Phase       | Features              | Aufwand        |
| ----------- | --------------------- | -------------- |
| **Phase 1** | Avatar Chat Interface | 1 Woche        |
| **Phase 2** | Admin Dashboard       | 3-4 Tage       |
| **Phase 3** | Character Studio      | 1 Woche        |
| **Phase 4** | History Viewer        | 2-3 Tage       |
| **Phase 5** | Kill Switch Panel     | 1 Tag          |
| **Total**   |                       | **3-4 Wochen** |

---

**Status:** ✅ Designed
**Priority:** Avatar Chat (Phase 1) → Admin Dashboard (Phase 2)
**Optional:** History Viewer, Character Studio (later)
