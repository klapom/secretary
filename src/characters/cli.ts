#!/usr/bin/env node
/**
 * CLI tool for character management
 */

import { getCharacterDatabase, ensureDefaultCharacter } from "./index.js";
import path from "node:path";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "characters", "characters.db");
const DEFAULT_ASSETS_DIR = path.join(process.cwd(), "data", "characters", "assets");

function printUsage() {
  console.log(`
Character Management CLI

Usage:
  node cli.ts list                          - List all characters
  node cli.ts active                        - Show active character
  node cli.ts create <name> <displayName>   - Create new character
  node cli.ts activate <id>                 - Activate character by ID
  node cli.ts delete <id>                   - Delete character by ID
  node cli.ts init                          - Initialize default character

Environment Variables:
  CHARACTER_DB_PATH      - Database path (default: ./data/characters/characters.db)
  CHARACTER_ASSETS_DIR   - Assets directory (default: ./data/characters/assets)
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const dbPath = process.env.CHARACTER_DB_PATH || DEFAULT_DB_PATH;
  const assetsDir = process.env.CHARACTER_ASSETS_DIR || DEFAULT_ASSETS_DIR;

  const db = getCharacterDatabase({ dbPath, assetsDir });

  try {
    switch (command) {
      case "list": {
        const characters = db.getAllCharacters();
        console.log(`\nFound ${characters.length} character(s):\n`);
        for (const char of characters) {
          const activeMarker = char.isActive ? " [ACTIVE]" : "";
          console.log(`- ${char.displayName} (${char.name})${activeMarker}`);
          console.log(`  ID: ${char.id}`);
          if (char.description) {
            console.log(`  Description: ${char.description}`);
          }
          console.log("");
        }
        break;
      }

      case "active": {
        const active = db.getActiveCharacter();
        if (!active) {
          console.log("No active character found.");
          process.exit(1);
        }
        console.log(`\nActive Character:`);
        console.log(`  Name: ${active.displayName} (${active.name})`);
        console.log(`  ID: ${active.id}`);
        if (active.description) {
          console.log(`  Description: ${active.description}`);
        }
        if (active.personality) {
          console.log(`  Personality: ${active.personality.substring(0, 100)}...`);
        }
        break;
      }

      case "create": {
        const name = args[1];
        const displayName = args[2];

        if (!name || !displayName) {
          console.error("Error: name and displayName are required");
          printUsage();
          process.exit(1);
        }

        const character = db.createCharacter({
          name,
          displayName,
          description: args[3],
        });

        console.log(`\nCreated character: ${character.displayName}`);
        console.log(`  ID: ${character.id}`);
        break;
      }

      case "activate": {
        const id = args[1];

        if (!id) {
          console.error("Error: character ID is required");
          printUsage();
          process.exit(1);
        }

        const character = db.activateCharacter(id);

        if (!character) {
          console.error(`Error: Character with ID ${id} not found`);
          process.exit(1);
        }

        console.log(`\nActivated character: ${character.displayName}`);
        break;
      }

      case "delete": {
        const id = args[1];

        if (!id) {
          console.error("Error: character ID is required");
          printUsage();
          process.exit(1);
        }

        const success = db.deleteCharacter(id);

        if (!success) {
          console.error(`Error: Character with ID ${id} not found`);
          process.exit(1);
        }

        console.log(`\nDeleted character with ID: ${id}`);
        break;
      }

      case "init": {
        ensureDefaultCharacter(db);
        console.log("\nDefault character initialized");
        break;
      }

      default:
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
