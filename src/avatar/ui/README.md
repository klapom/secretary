# Avatar System Test UI

Browser-based test interface for the Secretary avatar system, integrating LivePortrait, XTTS/Whisper voice pipeline, character management, and WebRTC streaming.

## Features

- **Character Management**: Select and switch characters with avatar/voice profiles
- **Live Avatar Display**: Real-time video stream from LivePortrait service
- **Emotion Controls**: 7 emotions (neutral, happy, sad, surprised, angry, disgusted, fearful)
- **Text-to-Speech**: Type text and hear it spoken with character voice
- **Speech-to-Text**: Record audio and see real-time transcription
- **Audio Visualization**: Visual feedback during microphone recording
- **Activity Log**: Real-time logging of all system events
- **Keyboard Shortcuts**: Quick access to common actions

## Prerequisites

Before running the UI, ensure these services are running:

1. **Character API** (Port 3000)
   ```bash
   # Start Secretary gateway
   cd /home/admin/projects/secretary/openclaw-source
   pnpm dev
   ```

2. **LivePortrait Service** (Port 8001)
   ```bash
   cd services/liveportrait-avatar
   docker-compose up
   ```

3. **Voice Pipeline** (Port 8765)
   ```bash
   cd services/voice-pipeline
   source venv/bin/activate
   python voice_service.py
   ```

4. **WebRTC Server** (Optional, Port 3000)
   ```bash
   # Integrated with Secretary gateway
   ```

## Quick Start

### Option 1: Using Node.js Server

```bash
cd /home/admin/projects/secretary/openclaw-source/src/avatar/ui

# Start server
node server.js
```

Open browser: http://localhost:3001

### Option 2: Using Python Server

```bash
cd /home/admin/projects/secretary/openclaw-source/src/avatar/ui

# Start Python HTTP server
python3 -m http.server 3001
```

Open browser: http://localhost:3001

### Option 3: Direct File Access

Simply open `index.html` in your browser. Note: CORS restrictions may apply for API calls.

## Configuration

### Environment Variables

```bash
# Optional: Override default ports
PORT=3001
HOST=localhost
```

### URL Parameters

Override API endpoints via URL parameters:

```
http://localhost:3001/?character_api=http://localhost:3000
                       &liveportrait_api=http://localhost:8001
                       &voice_api=http://localhost:8765
                       &token=your_auth_token
                       &debug=true
```

### Authentication

On first load, you'll be prompted for an authentication token. This is used for Character API requests. For localhost testing, you can leave it empty.

To set token via URL:
```
http://localhost:3001/?token=your_bearer_token_here
```

To set token via browser console:
```javascript
localStorage.setItem('auth_token', 'your_token_here');
location.reload();
```

## Usage

### 1. Select Character

- Choose a character from the dropdown
- Character info (name, description, personality) will be displayed
- Character is automatically activated on selection

### 2. Avatar Display

- Click "Start Stream" to connect to avatar video stream
- Avatar will display in the video panel
- Click "Stop Stream" to disconnect

### 3. Emotion Control

Click emotion buttons to change avatar expression:
- 😐 Neutral
- 😊 Happy
- 😢 Sad
- 😮 Surprised
- 😠 Angry
- 🤢 Disgusted
- 😨 Fearful

Adjust intensity slider (0.0 - 1.0) for emotion strength.

### 4. Text-to-Speech

1. Type text in the textarea
2. Select language (English, German, French, Spanish)
3. Click "Speak"
4. Audio will be synthesized and played

### 5. Speech-to-Text

1. Select language for transcription
2. Click "Start Microphone"
3. Grant microphone permissions if prompted
4. Speak into microphone (visualizer shows audio levels)
5. Click "Stop Recording"
6. Transcription appears below

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1-7` | Quick emotion selection (1=Neutral, 2=Happy, etc.) |
| `Space` | Toggle microphone on/off |
| `Ctrl+R` | Reload characters |
| `Ctrl+E` | Toggle emotions panel |
| `Ctrl+L` | Clear activity log |

## Architecture

```
┌─────────────────────────────────────┐
│      Browser UI (HTML/JS/CSS)       │
├─────────────────────────────────────┤
│  Character │ LivePortrait │ Voice   │
│  Manager   │  Manager     │ Manager │
└──────┬──────────┬──────────┬────────┘
       │          │          │
       ▼          ▼          ▼
    :3000      :8001      :8765
   Character  LivePortrait  Voice
     API       Service    Pipeline
```

## File Structure

```
src/avatar/ui/
├── index.html          # Main UI layout
├── styles.css          # Styling
├── config.js          # Configuration
├── logger.js          # Logging utility
├── character.js       # Character management
├── liveportrait.js    # LivePortrait integration
├── voice.js           # TTS/STT integration
├── webrtc.js          # WebRTC client
├── app.js             # Main application
├── server.js          # HTTP server
└── README.md          # This file
```

## API Integration

### Character API

```javascript
// Load characters
GET /api/characters
Authorization: Bearer <token>

// Get active character
GET /api/characters/active

// Activate character
POST /api/characters/:id/activate
```

### LivePortrait API

```javascript
// Health check
GET http://localhost:8001/health

// Render emotion
POST http://localhost:8001/render
Content-Type: multipart/form-data
{
  source_image: File,
  emotion: string,
  intensity: number
}
```

### Voice Pipeline API

```javascript
// TTS - Synthesize speech
POST http://localhost:8765/tts/synthesize
{
  text: string,
  language: string,
  voice_id: string
}

// STT - Transcribe audio
POST http://localhost:8765/stt/transcribe
Content-Type: multipart/form-data
{
  file: File,
  language: string
}
```

## Troubleshooting

### Service Connection Issues

**Character API shows "Offline":**
- Verify Secretary gateway is running on port 3000
- Check authentication token is set
- Open browser console for error details

**LivePortrait shows "Offline":**
- Verify Docker container is running: `docker ps | grep liveportrait`
- Check service health: `curl http://localhost:8001/health`
- Ensure GPU is available (or CPU fallback enabled)

**Voice Pipeline shows "Offline":**
- Verify Python service is running: `curl http://localhost:8765/health`
- Check virtual environment is activated
- View logs in terminal where service was started

### CORS Issues

If running UI from `file://` protocol:
- Use Node.js server instead (`node server.js`)
- Or configure CORS headers on backend services

### Microphone Access

**Permission Denied:**
- Browser must be served over HTTPS or localhost
- Check browser microphone permissions in settings
- Try different browser (Chrome/Firefox recommended)

**No Audio Visualizer:**
- Check microphone is not muted
- Verify correct microphone is selected in browser
- Check browser console for errors

### WebRTC Issues

**Video not displaying:**
- WebRTC implementation may be incomplete
- Check browser console for WebRTC errors
- Verify signaling server is running
- Try refreshing page

## Development

### Running in Development Mode

```bash
# Enable debug logging
http://localhost:3001/?debug=true
```

### Modifying Configuration

Edit `config.js` to change:
- API endpoints
- Timeouts
- Feature flags
- Default values

### Adding New Features

1. Create new module file (e.g., `myfeature.js`)
2. Add script tag to `index.html`
3. Initialize in `app.js`
4. Add UI elements to `index.html`
5. Style in `styles.css`

## Testing

### Manual Testing Checklist

- [ ] Character selection loads and displays
- [ ] Emotion buttons change active state
- [ ] Intensity slider updates value
- [ ] TTS synthesizes and plays audio
- [ ] STT records and transcribes speech
- [ ] Audio visualizer shows during recording
- [ ] Activity log displays events
- [ ] Keyboard shortcuts work
- [ ] Error messages display correctly
- [ ] All service status indicators update

### Browser Compatibility

Tested on:
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

Requirements:
- WebRTC support
- Web Audio API
- MediaRecorder API
- Fetch API
- ES6+ JavaScript

## Performance

**Recommendations:**
- Use Chrome/Edge for best WebRTC performance
- GPU acceleration improves LivePortrait rendering
- Microphone: 16kHz sample rate recommended
- Video: 512x512 resolution default

## Security

**Important Notes:**
- Authentication token stored in localStorage
- HTTPS recommended for production
- Microphone access requires user permission
- CORS must be configured for API access

## Future Enhancements

- [ ] WebRTC video streaming integration
- [ ] Real-time lip-sync with TTS
- [ ] Multiple character preview
- [ ] Emotion presets and sequencing
- [ ] Recording and playback
- [ ] Performance metrics dashboard
- [ ] Mobile responsive design
- [ ] Voice activity detection visualization

## Support

For issues or questions:
1. Check activity log for errors
2. Open browser console (F12)
3. Verify all services are running
4. Review service logs
5. Report issues to team lead

## License

See main Secretary project license.
