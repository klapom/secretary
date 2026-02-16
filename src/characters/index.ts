/**
 * Character management module
 *
 * Provides character profile storage, management, and API endpoints
 * for avatar system integration.
 */

export { CharacterDatabase, getCharacterDatabase, closeCharacterDatabase } from "./db.js";
export { initializeCharacterSchema, dropCharacterSchema, vacuumCharacterDatabase } from "./schema.js";
export { DEFAULT_CHARACTER, ensureDefaultCharacter } from "./default-character.js";
export type { CharacterDatabaseConfig } from "./db.js";
