# Secretary Avatar Chat UI

React 18 frontend for real-time AI avatar interaction with WebRTC streaming.

## Features

- **Real-time Avatar Streaming** - WebRTC video display with <200ms latency
- **Voice Interaction** - Microphone input with audio level monitoring
- **Character Selection** - Switch between different avatar personalities
- **Connection Management** - Automatic reconnection with visual status
- **Responsive Design** - TailwindCSS styling for all screen sizes

## Tech Stack

- **React 18.3.1** - Modern React with hooks
- **TypeScript 5.4.5** - Type safety
- **Vite 5.3.1** - Fast development server
- **TailwindCSS 3.4.4** - Utility-first styling
- **simple-peer 9.11.1** - WebRTC abstraction
- **@tanstack/react-query** - Data fetching

## Development

```bash
# Install dependencies
npm install

# Start development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run type-check

# Lint
npm run lint
```

## Configuration

### Environment Variables

Create `.env` file:

```bash
VITE_WEBRTC_URL=ws://localhost:8080  # WebRTC signaling server
VITE_API_URL=http://localhost:3001   # Backend API
```

### Proxy Configuration

Vite proxy configured in `vite.config.ts`:

- `/ws` → WebRTC signaling server
- `/api` → Backend API

## Components

### AvatarVideo

WebRTC video display with connection state handling.

```tsx
<AvatarVideo remoteStream={remoteStream} connectionState={connectionState} />
```

### VoiceControls

Microphone recording and connection controls.

```tsx
<VoiceControls
  isRecording={isRecording}
  isConnected={isConnected}
  onStartRecording={startRecording}
  onStopRecording={stopRecording}
  onConnect={connect}
  onDisconnect={disconnect}
/>
```

### CharacterSelector

Dropdown to select avatar character.

```tsx
<CharacterSelector selectedCharacter={selectedCharacter} onSelectCharacter={setSelectedCharacter} />
```

### StatusIndicator

Visual connection status and audio level meter.

```tsx
<StatusIndicator
  connectionState={connectionState}
  isRecording={isRecording}
  audioLevel={audioLevel}
/>
```

## Hooks

### useWebRTC

WebRTC connection management with automatic reconnection.

```tsx
const { connectionState, localStream, remoteStream, connect, disconnect } = useWebRTC();
```

### useAudioStream

Microphone input with audio level monitoring.

```tsx
const { isRecording, audioLevel, startRecording, stopRecording } = useAudioStream();
```

## Architecture

```
src/
├── components/          # React components
│   ├── AvatarVideo.tsx
│   ├── VoiceControls.tsx
│   ├── CharacterSelector.tsx
│   └── StatusIndicator.tsx
├── hooks/               # Custom React hooks
│   ├── useWebRTC.ts
│   └── useAudioStream.ts
├── types/               # TypeScript types
│   └── index.ts
├── App.tsx              # Main application
├── main.tsx             # Entry point
└── index.css            # Global styles
```

## Integration

### Backend Requirements

The UI expects the following backend services:

1. **WebRTC Signaling Server** (ws://localhost:8080)
   - WebSocket endpoint for signaling
   - Handles offer/answer exchange

2. **Avatar API** (http://localhost:3001)
   - Character management
   - Voice synthesis requests

## Performance

- **WebRTC Latency:** <200ms
- **Audio Processing:** Real-time with Web Audio API
- **React 18:** Concurrent rendering for smooth UI

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14.1+

**Note:** Requires WebRTC and getUserMedia support.

## Deployment

```bash
# Build production bundle
npm run build

# Output: dist/
# Serve with nginx, Apache, or static hosting
```

## Sprint 04 Phase 2

This UI is part of Sprint 04 Phase 2. See [SPRINT_04.md](../../docs-secretary/sprints/SPRINT_04.md) for full context.

**Status:** ✅ Components implemented, ready for integration testing.
