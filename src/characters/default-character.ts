/**
 * Default character creation and initialization
 */

import type { CreateCharacterInput } from "../config/types.characters.js";

/**
 * Default character configuration
 */
export const DEFAULT_CHARACTER: CreateCharacterInput = {
  name: "secretary",
  displayName: "Secretary",
  description: "Your personal AI assistant with a professional, helpful demeanor",
  personality: `You are Secretary, a professional and capable AI assistant. You are:
- Efficient and organized in handling tasks
- Clear and concise in communication
- Proactive in anticipating user needs
- Warm but professional in tone
- Detail-oriented and thorough
- Adaptable to different communication styles`,
  metadata: {
    version: "1.0.0",
    isDefault: true,
    avatarStyle: "professional",
    voicePreference: "neutral",
  },
};

/**
 * Initialize database with default character if none exist
 */
export function ensureDefaultCharacter(db: {
  getAllCharacters: () => any[];
  createCharacter: (input: CreateCharacterInput) => any;
  activateCharacter: (id: string) => any;
}): void {
  const characters = db.getAllCharacters();

  // If no characters exist, create default
  if (characters.length === 0) {
    const character = db.createCharacter(DEFAULT_CHARACTER);
    db.activateCharacter(character.id);
    console.log(`Created default character: ${character.displayName} (${character.id})`);
  }
}
