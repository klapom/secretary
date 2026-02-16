/**
 * Zod validation schemas for character profiles
 */

import { z } from "zod";

export const CharacterProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  avatarImagePath: z.string().optional(),
  voiceId: z.string().optional(),
  voiceSamplePath: z.string().optional(),
  personality: z.string().max(2048).optional(),
  isActive: z.boolean(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreateCharacterInputSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/, {
    message: "Name must contain only lowercase letters, numbers, hyphens, and underscores",
  }),
  displayName: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  personality: z.string().max(2048).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateCharacterInputSchema = z.object({
  displayName: z.string().min(1).max(128).optional(),
  description: z.string().max(512).optional(),
  personality: z.string().max(2048).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CharacterIdSchema = z.string().min(1).max(64);
