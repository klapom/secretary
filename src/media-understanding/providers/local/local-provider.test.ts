import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

import { localProvider } from "./index.js";

describe("localProvider", () => {
  it("has correct id and capabilities", () => {
    expect(localProvider.id).toBe("local");
    expect(localProvider.capabilities).toEqual(["audio"]);
  });

  it("transcribes audio via local Whisper service", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "Guten Morgen" }),
    });

    const result = await localProvider.transcribeAudio!({
      buffer: Buffer.from("fake-audio"),
      fileName: "test.ogg",
      apiKey: "local",
      timeoutMs: 5000,
      language: "de",
    });

    expect(result.text).toBe("Guten Morgen");
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe("http://localhost:8083/transcribe");
  });

  it("uses custom baseUrl", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: "Hello" }),
    });

    await localProvider.transcribeAudio!({
      buffer: Buffer.from("audio"),
      fileName: "test.ogg",
      apiKey: "local",
      baseUrl: "http://custom-stt:9090",
      timeoutMs: 5000,
    });

    expect(mockFetch.mock.calls[0][0]).toBe("http://custom-stt:9090/transcribe");
  });

  it("throws on STT service error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "error",
      statusText: "Internal Server Error",
    });

    await expect(
      localProvider.transcribeAudio!({
        buffer: Buffer.from("audio"),
        fileName: "test.ogg",
        apiKey: "local",
        timeoutMs: 5000,
      }),
    ).rejects.toThrow("Whisper STT failed");
  });
});
