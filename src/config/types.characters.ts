/**
 * Character profile types and schema for avatar/voice management
 */

export interface CharacterProfile {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  avatarImagePath?: string; // Path to avatar image file
  voiceId?: string; // XTTS voice ID or voice sample path
  voiceSamplePath?: string; // Path to voice sample audio
  personality?: string; // Personality description for LLM prompts
  isActive: boolean; // Currently active character
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
  metadata?: Record<string, unknown>; // Extensible metadata
}

export interface CreateCharacterInput {
  name: string;
  displayName: string;
  description?: string;
  personality?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateCharacterInput {
  displayName?: string;
  description?: string;
  personality?: string;
  metadata?: Record<string, unknown>;
}

export interface CharacterAssetUpload {
  characterId: string;
  assetType: "avatar" | "voice";
  filePath: string;
  mimeType: string;
  fileSize: number;
}

export interface CharacterStorageConfig {
  dbPath: string; // Path to SQLite database
  assetsDir: string; // Directory for character assets
  maxAvatarSize: number; // Max avatar file size in bytes
  maxVoiceSampleSize: number; // Max voice sample size in bytes
}
