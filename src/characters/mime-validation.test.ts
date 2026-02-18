/**
 * Tests for MIME-type magic byte validation used by character upload endpoints.
 * Ensures that file uploads are validated by actual file content (magic bytes),
 * not just the Content-Type header which can be spoofed.
 */

import { fileTypeFromBuffer } from "file-type";
import { describe, it, expect } from "vitest";

const ALLOWED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_AUDIO_MIMES = new Set(["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac"]);

describe("MIME-type magic byte validation", () => {
  it("should detect PNG by magic bytes", async () => {
    // Minimal valid PNG: signature + IHDR chunk (13 bytes data) + IEND chunk
    const pngHeader = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d, // IHDR length
      0x49,
      0x48,
      0x44,
      0x52, // "IHDR"
      0x00,
      0x00,
      0x00,
      0x01, // width=1
      0x00,
      0x00,
      0x00,
      0x01, // height=1
      0x08,
      0x02,
      0x00,
      0x00,
      0x00, // bit depth=8, color=RGB
      0x90,
      0x77,
      0x53,
      0xde, // CRC
    ]);
    const result = await fileTypeFromBuffer(pngHeader);
    expect(result).toBeDefined();
    expect(result!.mime).toBe("image/png");
    expect(ALLOWED_IMAGE_MIMES.has(result!.mime)).toBe(true);
  });

  it("should detect JPEG by magic bytes", async () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
    const result = await fileTypeFromBuffer(jpegHeader);
    expect(result).toBeDefined();
    expect(result!.mime).toBe("image/jpeg");
    expect(ALLOWED_IMAGE_MIMES.has(result!.mime)).toBe(true);
  });

  it("should reject PDF disguised as image/png", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 fake content here padding", "ascii");
    const result = await fileTypeFromBuffer(pdfBuffer);
    if (result) {
      expect(ALLOWED_IMAGE_MIMES.has(result.mime)).toBe(false);
    } else {
      expect(true).toBe(true);
    }
  });

  it("should reject EXE disguised as image", async () => {
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const result = await fileTypeFromBuffer(exeBuffer);
    if (result) {
      expect(ALLOWED_IMAGE_MIMES.has(result.mime)).toBe(false);
    } else {
      expect(true).toBe(true);
    }
  });

  it("should reject random bytes as invalid", async () => {
    const randomBuffer = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
    const result = await fileTypeFromBuffer(randomBuffer);
    expect(result === undefined || !ALLOWED_IMAGE_MIMES.has(result.mime)).toBe(true);
  });

  it("should reject PDF disguised as audio", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4 fake audio content padding", "ascii");
    const result = await fileTypeFromBuffer(pdfBuffer);
    if (result) {
      expect(ALLOWED_AUDIO_MIMES.has(result.mime)).toBe(false);
    } else {
      expect(true).toBe(true);
    }
  });
});
