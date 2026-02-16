# Character Manager Quick Start

## Installation

No additional dependencies needed - uses existing packages:

- `node:sqlite` (Node.js built-in)
- `zod` (already in package.json)
- `express` (already in package.json)

## Initialize Database

### Using CLI

```bash
# Initialize default character
node --import tsx src/characters/cli.ts init

# List characters
node --import tsx src/characters/cli.ts list

# Get active character
node --import tsx src/characters/cli.ts active
```

### Programmatic

```typescript
import { getCharacterDatabase, ensureDefaultCharacter } from "./src/characters";

const db = getCharacterDatabase({
  dbPath: "./data/characters/characters.db",
  assetsDir: "./data/characters/assets",
});

// Initialize default character
ensureDefaultCharacter(db);
```

## Create a Character

### Using API

```bash
curl -X POST http://localhost:3000/api/characters \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "assistant",
    "displayName": "AI Assistant",
    "description": "Helpful AI assistant",
    "personality": "Friendly, professional, and knowledgeable"
  }'
```

### Using CLI

```bash
node --import tsx src/characters/cli.ts create assistant "AI Assistant" "Helpful AI"
```

## Upload Avatar

```bash
curl -X POST http://localhost:3000/api/characters/{id}/upload-avatar \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/avatar.png"
```

## Activate Character

```bash
curl -X POST http://localhost:3000/api/characters/{id}/activate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Integration Example

```typescript
import { getCharacterDatabase } from "./src/characters";

// Get character database
const db = getCharacterDatabase({
  dbPath: "./data/characters/characters.db",
  assetsDir: "./data/characters/assets",
});

// Get active character
const activeCharacter = db.getActiveCharacter();

if (activeCharacter) {
  console.log(`Active: ${activeCharacter.displayName}`);

  // Use with avatar system
  if (activeCharacter.avatarImagePath) {
    await avatarSystem.loadAvatar(activeCharacter.avatarImagePath);
  }

  // Use with voice system
  if (activeCharacter.voiceId) {
    await voiceSystem.setVoice(activeCharacter.voiceId);
  }

  // Use with LLM
  if (activeCharacter.personality) {
    await llm.setSystemPrompt(activeCharacter.personality);
  }
}
```

## File Structure

```
data/
└── characters/
    ├── characters.db          # SQLite database
    ├── characters.db-shm      # Shared memory
    ├── characters.db-wal      # Write-ahead log
    └── assets/
        ├── avatars/           # Avatar images
        │   └── {id}_avatar_{uuid}.png
        └── voices/            # Voice samples
            └── {id}_voice_{uuid}.mp3
```

## Environment Variables

```bash
# Optional - defaults shown
CHARACTER_DB_PATH=./data/characters/characters.db
CHARACTER_ASSETS_DIR=./data/characters/assets
CHARACTER_MAX_AVATAR_SIZE=10485760    # 10MB
CHARACTER_MAX_VOICE_SIZE=52428800     # 50MB
```

## Testing

```bash
# Run tests
pnpm test src/characters/db.test.ts

# Expected output:
# ✓ src/characters/db.test.ts (16 tests) 82ms
# Test Files  1 passed (1)
# Tests       16 passed (16)
```

## Common Operations

### List All Characters

```bash
curl http://localhost:3000/api/characters \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Active Character

```bash
curl http://localhost:3000/api/characters/active \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Update Character

```bash
curl -X PUT http://localhost:3000/api/characters/{id} \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName": "New Name"}'
```

### Delete Character

```bash
curl -X DELETE http://localhost:3000/api/characters/{id} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### Database locked error

- Ensure WAL mode is enabled (automatic)
- Check no other process has exclusive lock
- Verify file permissions

### File upload fails

- Check Content-Type is multipart/form-data
- Verify file size within limits
- Confirm MIME type is supported

### Character not found

- Verify character ID is correct
- Check database file exists
- Run `cli.ts list` to see all characters

### No active character

- Run `cli.ts init` to create default
- Or activate a character: `cli.ts activate {id}`

## Security Notes

- All API endpoints require Bearer authentication
- File uploads validated by MIME type and size
- SQL injection prevented via parameterized queries
- Path traversal prevented via UUID filenames
- Assets deleted when character is removed

## Next Steps

1. **Initialize default character**: `node --import tsx src/characters/cli.ts init`
2. **Upload avatar image**: Use `/api/characters/{id}/upload-avatar`
3. **Upload voice sample**: Use `/api/characters/{id}/upload-voice`
4. **Activate character**: `POST /api/characters/{id}/activate`
5. **Integrate with avatar system**: See INTEGRATION.md

## Support

- Full documentation: See README.md
- Integration guide: See INTEGRATION.md
- API reference: See README.md "API Endpoints" section
- Test examples: See db.test.ts
