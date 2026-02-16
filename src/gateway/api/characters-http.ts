/**
 * HTTP API endpoints for character management
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getCharacterDatabase, type CharacterDatabase } from "../../characters/db.js";
import {
  CreateCharacterInputSchema,
  UpdateCharacterInputSchema,
  CharacterIdSchema,
} from "../../config/zod-schema.characters.js";
import { readJsonBody } from "../hooks/hooks.js";

/**
 * Configuration for character API
 */
export interface CharacterApiConfig {
  dbPath: string;
  assetsDir: string;
  maxAvatarSize: number; // bytes
  maxVoiceSampleSize: number; // bytes
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CharacterApiConfig = {
  dbPath: "./data/characters/characters.db",
  assetsDir: "./data/characters/assets",
  maxAvatarSize: 10 * 1024 * 1024, // 10MB
  maxVoiceSampleSize: 50 * 1024 * 1024, // 50MB
};

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/**
 * Send error response
 */
function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

/**
 * Parse multipart/form-data for file uploads
 * Simplified implementation - in production, use a library like busboy
 */
async function parseMultipartFile(
  req: IncomingMessage,
  maxSize: number,
): Promise<{ filename: string; buffer: Buffer; mimeType: string } | null> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return resolve(null);
    }

    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        req.removeAllListeners();
        reject(new Error(`File size exceeds maximum of ${maxSize} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const buffer = Buffer.concat(chunks);

      // Simple multipart parsing (boundary detection)
      const boundary = contentType.split("boundary=")[1];
      if (!boundary) {
        return resolve(null);
      }

      const boundaryBuffer = Buffer.from(`--${boundary}`);
      const parts = buffer.toString("binary").split(boundaryBuffer.toString("binary"));

      for (const part of parts) {
        if (part.includes("Content-Disposition: form-data")) {
          const filenameMatch = part.match(/filename="([^"]+)"/);
          const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);

          if (filenameMatch && contentTypeMatch) {
            const filename = filenameMatch[1];
            const mimeType = contentTypeMatch[1].trim();

            // Extract file content (after double newline)
            const fileStartIndex = part.indexOf("\r\n\r\n") + 4;
            const fileEndIndex = part.lastIndexOf("\r\n");

            if (fileStartIndex > 3 && fileEndIndex > fileStartIndex) {
              const fileBuffer = Buffer.from(
                part.substring(fileStartIndex, fileEndIndex),
                "binary",
              );

              return resolve({ filename, buffer: fileBuffer, mimeType });
            }
          }
        }
      }

      resolve(null);
    });

    req.on("error", reject);
  });
}

/**
 * Handle character API requests
 */
export async function handleCharactersHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  config: CharacterApiConfig = DEFAULT_CONFIG,
): Promise<boolean> {
  const db = getCharacterDatabase({
    dbPath: config.dbPath,
    assetsDir: config.assetsDir,
  });

  // GET /api/characters - List all characters
  if (req.method === "GET" && pathname === "/api/characters") {
    const characters = db.getAllCharacters();
    sendJson(res, 200, { characters });
    return true;
  }

  // GET /api/characters/active - Get active character
  if (req.method === "GET" && pathname === "/api/characters/active") {
    const character = db.getActiveCharacter();
    if (!character) {
      sendError(res, 404, "No active character found");
      return true;
    }
    sendJson(res, 200, { character });
    return true;
  }

  // GET /api/characters/:id - Get character by ID
  const getMatch = pathname.match(/^\/api\/characters\/([^/]+)$/);
  if (req.method === "GET" && getMatch) {
    const id = getMatch[1];
    const character = db.getCharacterById(id);

    if (!character) {
      sendError(res, 404, "Character not found");
      return true;
    }

    sendJson(res, 200, { character });
    return true;
  }

  // POST /api/characters - Create new character
  if (req.method === "POST" && pathname === "/api/characters") {
    try {
      const body = await readJsonBody(req);
      const validatedInput = CreateCharacterInputSchema.parse(body);

      // Check if character with same name exists
      const existing = db.getCharacterByName(validatedInput.name);
      if (existing) {
        sendError(res, 409, `Character with name '${validatedInput.name}' already exists`);
        return true;
      }

      const character = db.createCharacter(validatedInput);
      sendJson(res, 201, { character });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 400, `Invalid input: ${message}`);
      return true;
    }
  }

  // PUT /api/characters/:id - Update character
  const updateMatch = pathname.match(/^\/api\/characters\/([^/]+)$/);
  if (req.method === "PUT" && updateMatch) {
    const id = updateMatch[1];

    try {
      const body = await readJsonBody(req);
      const validatedInput = UpdateCharacterInputSchema.parse(body);

      const character = db.updateCharacter(id, validatedInput);

      if (!character) {
        sendError(res, 404, "Character not found");
        return true;
      }

      sendJson(res, 200, { character });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 400, `Invalid input: ${message}`);
      return true;
    }
  }

  // DELETE /api/characters/:id - Delete character
  const deleteMatch = pathname.match(/^\/api\/characters\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const id = deleteMatch[1];

    const success = db.deleteCharacter(id);

    if (!success) {
      sendError(res, 404, "Character not found");
      return true;
    }

    sendJson(res, 200, { success: true });
    return true;
  }

  // POST /api/characters/:id/activate - Activate character
  const activateMatch = pathname.match(/^\/api\/characters\/([^/]+)\/activate$/);
  if (req.method === "POST" && activateMatch) {
    const id = activateMatch[1];

    const character = db.activateCharacter(id);

    if (!character) {
      sendError(res, 404, "Character not found");
      return true;
    }

    sendJson(res, 200, { character });
    return true;
  }

  // POST /api/characters/:id/upload-avatar - Upload avatar image
  const uploadAvatarMatch = pathname.match(/^\/api\/characters\/([^/]+)\/upload-avatar$/);
  if (req.method === "POST" && uploadAvatarMatch) {
    const id = uploadAvatarMatch[1];

    try {
      const character = db.getCharacterById(id);
      if (!character) {
        sendError(res, 404, "Character not found");
        return true;
      }

      const file = await parseMultipartFile(req, config.maxAvatarSize);

      if (!file) {
        sendError(res, 400, "No file uploaded or invalid format");
        return true;
      }

      // Validate image mime type
      const validMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
      if (!validMimeTypes.includes(file.mimeType)) {
        sendError(res, 400, "Invalid image format. Supported: PNG, JPEG, WebP");
        return true;
      }

      // Generate unique filename
      const ext = path.extname(file.filename);
      const filename = `${id}_avatar_${crypto.randomUUID()}${ext}`;
      const avatarDir = path.join(config.assetsDir, "avatars");

      // Ensure directory exists
      if (!fs.existsSync(avatarDir)) {
        fs.mkdirSync(avatarDir, { recursive: true });
      }

      const filePath = path.join(avatarDir, filename);

      // Write file
      fs.writeFileSync(filePath, file.buffer);

      // Update character
      const updatedCharacter = db.updateCharacterAvatar(id, filePath);

      // Record asset
      db.recordAssetUpload({
        characterId: id,
        assetType: "avatar",
        filePath,
        mimeType: file.mimeType,
        fileSize: file.buffer.length,
      });

      sendJson(res, 200, { character: updatedCharacter });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 500, `Upload failed: ${message}`);
      return true;
    }
  }

  // POST /api/characters/:id/upload-voice - Upload voice sample
  const uploadVoiceMatch = pathname.match(/^\/api\/characters\/([^/]+)\/upload-voice$/);
  if (req.method === "POST" && uploadVoiceMatch) {
    const id = uploadVoiceMatch[1];

    try {
      const character = db.getCharacterById(id);
      if (!character) {
        sendError(res, 404, "Character not found");
        return true;
      }

      const file = await parseMultipartFile(req, config.maxVoiceSampleSize);

      if (!file) {
        sendError(res, 400, "No file uploaded or invalid format");
        return true;
      }

      // Validate audio mime type
      const validMimeTypes = ["audio/mpeg", "audio/wav", "audio/mp3", "audio/ogg", "audio/flac"];
      if (!validMimeTypes.includes(file.mimeType)) {
        sendError(res, 400, "Invalid audio format. Supported: MP3, WAV, OGG, FLAC");
        return true;
      }

      // Generate unique filename
      const ext = path.extname(file.filename);
      const filename = `${id}_voice_${crypto.randomUUID()}${ext}`;
      const voiceDir = path.join(config.assetsDir, "voices");

      // Ensure directory exists
      if (!fs.existsSync(voiceDir)) {
        fs.mkdirSync(voiceDir, { recursive: true });
      }

      const filePath = path.join(voiceDir, filename);

      // Write file
      fs.writeFileSync(filePath, file.buffer);

      // Generate voice ID (placeholder - will be replaced by XTTS integration)
      const voiceId = `voice_${crypto.randomUUID()}`;

      // Update character
      const updatedCharacter = db.updateCharacterVoice(id, filePath, voiceId);

      // Record asset
      db.recordAssetUpload({
        characterId: id,
        assetType: "voice",
        filePath,
        mimeType: file.mimeType,
        fileSize: file.buffer.length,
      });

      sendJson(res, 200, { character: updatedCharacter });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 500, `Upload failed: ${message}`);
      return true;
    }
  }

  // No matching route
  return false;
}
