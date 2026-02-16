# Character System Integration Guide

## Overview

This document describes how to integrate the Character Management System with the Avatar and Voice subsystems.

## Architecture Integration

```
┌─────────────────────────────────────────┐
│         Character Manager               │
│  - Profile Storage (SQLite)             │
│  - Asset Management                     │
│  - Active Character Tracking            │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌──────────────┐  ┌──────────────┐
│ Avatar System│  │ Voice System │
│ (LivePortrait│  │ (XTTS)       │
│  + Rendering)│  │              │
└──────────────┘  └──────────────┘
```

## Avatar System Integration

### Character Avatar Loading

```typescript
import { getCharacterDatabase } from '../characters';

// Get active character
const db = getCharacterDatabase(config);
const activeCharacter = db.getActiveCharacter();

if (activeCharacter?.avatarImagePath) {
  // Load avatar image for LivePortrait
  const avatarImage = await loadImage(activeCharacter.avatarImagePath);

  // Initialize LivePortrait with character avatar
  await livePortrait.initialize({
    sourceImage: avatarImage,
    // ... other config
  });
}
```

### Character Switching

When a character is activated via API:

```typescript
// Character switch event handler
async function onCharacterActivated(characterId: string) {
  const character = db.getCharacterById(characterId);

  if (!character?.avatarImagePath) {
    throw new Error('Character has no avatar image');
  }

  // Reload avatar in LivePortrait
  await livePortrait.switchAvatar(character.avatarImagePath);

  // Update voice system
  if (character.voiceId) {
    await tts.switchVoice(character.voiceId);
  }

  // Update LLM system prompt
  await llm.updateSystemPrompt(character.personality || DEFAULT_PERSONALITY);
}
```

## Voice System Integration

### Voice Sample Registration

When a voice sample is uploaded:

```typescript
// After voice upload via API
async function onVoiceSampleUploaded(characterId: string, samplePath: string) {
  const character = db.getCharacterById(characterId);

  if (!character) {
    throw new Error('Character not found');
  }

  // Register voice with XTTS
  const voiceId = await xtts.registerVoice({
    name: character.name,
    samplePath: samplePath,
    metadata: {
      characterId: character.id,
      displayName: character.displayName,
    },
  });

  // Update character with voice ID
  db.updateCharacterVoice(character.id, samplePath, voiceId);
}
```

### Active Voice Selection

```typescript
// Get active character's voice
const activeCharacter = db.getActiveCharacter();

if (activeCharacter?.voiceId) {
  await xtts.setActiveVoice(activeCharacter.voiceId);
} else {
  // Fallback to default voice
  await xtts.setActiveVoice(DEFAULT_VOICE_ID);
}
```

## LLM Integration

### System Prompt Enhancement

```typescript
// Build system prompt with character personality
function buildSystemPrompt(character: CharacterProfile): string {
  const basePrompt = getBaseSystemPrompt();

  if (character.personality) {
    return `${basePrompt}\n\n# Character Personality\n${character.personality}`;
  }

  return basePrompt;
}

// Apply to active character
const activeCharacter = db.getActiveCharacter();
const systemPrompt = buildSystemPrompt(activeCharacter || defaultCharacter);

await llm.updateSystemPrompt(systemPrompt);
```

### Context Injection

```typescript
// Include character metadata in context
const activeCharacter = db.getActiveCharacter();

const context = {
  character: {
    name: activeCharacter.displayName,
    role: activeCharacter.metadata?.role || 'assistant',
    traits: activeCharacter.metadata?.traits || [],
  },
  // ... other context
};
```

## Event System

### Character Events

Emit events for character changes:

```typescript
import { EventEmitter } from 'events';

export const characterEvents = new EventEmitter();

// Emit when character is activated
function activateCharacter(id: string) {
  const character = db.activateCharacter(id);

  characterEvents.emit('character:activated', {
    characterId: id,
    character,
  });

  return character;
}

// Listen for character events
characterEvents.on('character:activated', async ({ character }) => {
  console.log(`Character activated: ${character.displayName}`);

  // Update subsystems
  await updateAvatarSystem(character);
  await updateVoiceSystem(character);
  await updateLLMSystem(character);
});
```

## WebSocket Protocol

### Character State Sync

Send character updates to connected clients:

```typescript
// Send active character to client
socket.send(JSON.stringify({
  type: 'character:active',
  data: {
    character: db.getActiveCharacter(),
  },
}));

// Notify clients of character switch
characterEvents.on('character:activated', ({ character }) => {
  broadcastToAll({
    type: 'character:changed',
    data: { character },
  });
});
```

## Runtime Configuration

### Environment Variables

```bash
# Character database location
CHARACTER_DB_PATH=./data/characters/characters.db

# Character assets directory
CHARACTER_ASSETS_DIR=./data/characters/assets

# Max file sizes (bytes)
CHARACTER_MAX_AVATAR_SIZE=10485760    # 10MB
CHARACTER_MAX_VOICE_SIZE=52428800     # 50MB
```

### Initialization

```typescript
import { getCharacterDatabase, ensureDefaultCharacter } from './characters';

// Initialize on startup
async function initializeCharacterSystem() {
  const db = getCharacterDatabase({
    dbPath: process.env.CHARACTER_DB_PATH || './data/characters/characters.db',
    assetsDir: process.env.CHARACTER_ASSETS_DIR || './data/characters/assets',
  });

  // Ensure default character exists
  ensureDefaultCharacter(db);

  // Load active character
  const active = db.getActiveCharacter();

  if (active) {
    console.log(`Active character: ${active.displayName}`);

    // Initialize subsystems with active character
    await initializeSubsystems(active);
  }
}
```

## API Integration Example

### Frontend Character Switcher

```typescript
// React component example
function CharacterSwitcher() {
  const [characters, setCharacters] = useState([]);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    // Load characters
    fetch('/api/characters', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => setCharacters(data.characters));

    // Get active character
    fetch('/api/characters/active', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => setActiveId(data.character?.id));
  }, []);

  const activateCharacter = async (id) => {
    await fetch(`/api/characters/${id}/activate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    setActiveId(id);
  };

  return (
    <div>
      {characters.map(char => (
        <button
          key={char.id}
          onClick={() => activateCharacter(char.id)}
          disabled={char.id === activeId}
        >
          {char.displayName} {char.id === activeId && '✓'}
        </button>
      ))}
    </div>
  );
}
```

## Error Handling

### Common Integration Issues

```typescript
// Handle missing avatar
const character = db.getActiveCharacter();

if (!character?.avatarImagePath) {
  console.warn('Active character has no avatar, using default');
  await livePortrait.initialize({
    sourceImage: DEFAULT_AVATAR_PATH,
  });
}

// Handle missing voice
if (!character?.voiceId) {
  console.warn('Active character has no voice, using default');
  await xtts.setActiveVoice(DEFAULT_VOICE_ID);
}

// Handle character switch during active session
try {
  await switchCharacter(newCharacterId);
} catch (error) {
  console.error('Character switch failed:', error);
  // Rollback to previous character
  await switchCharacter(previousCharacterId);
}
```

## Testing Integration

### Integration Test Example

```typescript
import { describe, it, expect } from 'vitest';

describe('Character System Integration', () => {
  it('should switch avatar when character is activated', async () => {
    const db = getCharacterDatabase(testConfig);

    // Create character with avatar
    const char = db.createCharacter({
      name: 'test',
      displayName: 'Test',
    });

    // Upload avatar (simplified)
    await uploadAvatar(char.id, testAvatarPath);

    // Activate character
    const activated = db.activateCharacter(char.id);

    // Verify avatar system updated
    const currentAvatar = await avatarSystem.getCurrentAvatar();
    expect(currentAvatar).toBe(activated.avatarImagePath);
  });
});
```

## Performance Considerations

- Character data cached in memory for active character
- Asset files loaded lazily on demand
- Database queries optimized with indexes
- WebSocket updates debounced to prevent flooding

## Security

- All API endpoints require authentication
- File uploads validated and sanitized
- Path traversal prevented via UUID filenames
- SQL injection prevented via parameterized queries
