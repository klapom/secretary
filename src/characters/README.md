# Character Management System

## Overview

The Character Management System provides storage and API endpoints for managing character profiles used by the avatar system. Each character profile includes:

- **Profile Information**: Name, display name, description
- **Avatar Assets**: Image files for visual representation
- **Voice Configuration**: Voice samples and voice IDs for TTS
- **Personality**: LLM prompt personality description
- **Metadata**: Extensible JSON metadata

## Architecture

### Storage Layer

- **Database**: SQLite with WAL mode for concurrency
- **Location**: `./data/characters/characters.db`
- **Schema**: See `schema.ts` for table definitions

### File Storage

Assets are stored in the filesystem:

```
./data/characters/assets/
├── avatars/          # Character avatar images
└── voices/           # Voice sample audio files
```

### API Endpoints

All endpoints require authentication (Bearer token).

#### List Characters
```http
GET /api/characters
Authorization: Bearer <token>

Response: 200 OK
{
  "characters": [
    {
      "id": "uuid",
      "name": "secretary",
      "displayName": "Secretary",
      "description": "Professional AI assistant",
      "avatarImagePath": "/path/to/avatar.png",
      "voiceId": "voice_uuid",
      "voiceSamplePath": "/path/to/voice.mp3",
      "personality": "Professional and helpful...",
      "isActive": true,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```

#### Get Active Character
```http
GET /api/characters/active
Authorization: Bearer <token>

Response: 200 OK
{
  "character": { ... }
}
```

#### Get Character by ID
```http
GET /api/characters/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "character": { ... }
}
```

#### Create Character
```http
POST /api/characters
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "my-character",
  "displayName": "My Character",
  "description": "A custom character",
  "personality": "Friendly and enthusiastic"
}

Response: 201 Created
{
  "character": { ... }
}
```

#### Update Character
```http
PUT /api/characters/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "Updated Name",
  "description": "Updated description"
}

Response: 200 OK
{
  "character": { ... }
}
```

#### Delete Character
```http
DELETE /api/characters/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "success": true
}
```

#### Activate Character
```http
POST /api/characters/:id/activate
Authorization: Bearer <token>

Response: 200 OK
{
  "character": { ... }
}
```

#### Upload Avatar Image
```http
POST /api/characters/:id/upload-avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <image file>

Supported formats: PNG, JPEG, WebP
Max size: 10MB

Response: 200 OK
{
  "character": { ... }
}
```

#### Upload Voice Sample
```http
POST /api/characters/:id/upload-voice
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <audio file>

Supported formats: MP3, WAV, OGG, FLAC
Max size: 50MB

Response: 200 OK
{
  "character": { ... }
}
```

## Usage

### Programmatic Access

```typescript
import { getCharacterDatabase } from './characters';

const db = getCharacterDatabase({
  dbPath: './data/characters/characters.db',
  assetsDir: './data/characters/assets',
});

// Create character
const character = db.createCharacter({
  name: 'assistant',
  displayName: 'AI Assistant',
  personality: 'Helpful and professional',
});

// Activate character
db.activateCharacter(character.id);

// Get active character
const active = db.getActiveCharacter();
```

### Default Character

The system automatically creates a default "Secretary" character if no characters exist:

```typescript
import { ensureDefaultCharacter } from './characters';

ensureDefaultCharacter(db);
```

## Integration Points

### Avatar System
- Character profiles provide avatar image paths
- LivePortrait uses avatar images for rendering
- Character switching updates active avatar

### Voice System
- Voice IDs link to XTTS voice models
- Voice samples used for voice cloning
- Character personality influences TTS delivery

### LLM Integration
- Personality field injected into system prompts
- Character metadata used for context
- Active character determines response style

## Testing

Run tests with:

```bash
pnpm test src/characters/db.test.ts
```

## Security Considerations

- All API endpoints require authentication
- File uploads validated by type and size
- SQL injection prevented by parameterized queries
- Path traversal prevented by UUID-based filenames
- Asset deletion on character removal

## Future Enhancements

- [ ] Character versioning and history
- [ ] Character templates library
- [ ] Batch character import/export
- [ ] Character preview/testing mode
- [ ] Voice sample analysis and validation
- [ ] Multi-avatar support per character
- [ ] Character emotion/state management
