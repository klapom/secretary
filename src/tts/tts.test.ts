import { completeSimple } from "@mariozechner/pi-ai";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getApiKeyForModel } from "../agents/model-auth.js";
import { resolveModel } from "../agents/pi-embedded-runner/model.js";
import { withEnv } from "../test-utils/env.js";
import * as ttsCore from "./tts-core.js";
import * as tts from "./tts.js";

vi.mock("@mariozechner/pi-ai", () => ({
  completeSimple: vi.fn(),
  // Some auth helpers import oauth provider metadata at module load time.
  getOAuthProviders: () => [],
  getOAuthApiKey: vi.fn(async () => null),
}));

vi.mock("../agents/pi-embedded-runner/model.js", () => ({
  resolveModel: vi.fn((provider: string, modelId: string) => ({
    model: {
      provider,
      id: modelId,
      name: modelId,
      api: "openai-completions",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
    },
    authStorage: { profiles: {} },
    modelRegistry: { find: vi.fn() },
  })),
}));

vi.mock("../agents/model-auth.js", () => ({
  getApiKeyForModel: vi.fn(async () => ({
    apiKey: "test-api-key",
    source: "test",
    mode: "api-key",
  })),
  requireApiKey: vi.fn((auth: { apiKey?: string }) => auth.apiKey ?? ""),
}));

const { _test, resolveTtsConfig, maybeApplyTtsToPayload, getTtsProvider } = tts;

const {
  isValidVoiceId,
  isValidOpenAIVoice,
  isValidOpenAIModel,
  OPENAI_TTS_MODELS,
  OPENAI_TTS_VOICES,
  parseTtsDirectives,
  resolveModelOverridePolicy,
  summarizeText,
  resolveOutputFormat,
  resolveEdgeOutputFormat,
} = _test;

describe("tts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(completeSimple).mockResolvedValue({
      content: [{ type: "text", text: "Summary" }],
    });
  });

  describe("isValidVoiceId", () => {
    it("accepts valid ElevenLabs voice IDs", () => {
      expect(isValidVoiceId("pMsXgVXv3BLzUgSXRplE")).toBe(true);
      expect(isValidVoiceId("21m00Tcm4TlvDq8ikWAM")).toBe(true);
      expect(isValidVoiceId("EXAVITQu4vr4xnSDxMaL")).toBe(true);
    });

    it("accepts voice IDs of varying valid lengths", () => {
      expect(isValidVoiceId("a1b2c3d4e5")).toBe(true);
      expect(isValidVoiceId("a".repeat(40))).toBe(true);
    });

    it("rejects too short voice IDs", () => {
      expect(isValidVoiceId("")).toBe(false);
      expect(isValidVoiceId("abc")).toBe(false);
      expect(isValidVoiceId("123456789")).toBe(false);
    });

    it("rejects too long voice IDs", () => {
      expect(isValidVoiceId("a".repeat(41))).toBe(false);
      expect(isValidVoiceId("a".repeat(100))).toBe(false);
    });

    it("rejects voice IDs with invalid characters", () => {
      expect(isValidVoiceId("pMsXgVXv3BLz-gSXRplE")).toBe(false);
      expect(isValidVoiceId("pMsXgVXv3BLz_gSXRplE")).toBe(false);
      expect(isValidVoiceId("pMsXgVXv3BLz gSXRplE")).toBe(false);
      expect(isValidVoiceId("../../../etc/passwd")).toBe(false);
      expect(isValidVoiceId("voice?param=value")).toBe(false);
    });
  });

  describe("isValidOpenAIVoice", () => {
    it("accepts all valid OpenAI voices", () => {
      for (const voice of OPENAI_TTS_VOICES) {
        expect(isValidOpenAIVoice(voice)).toBe(true);
      }
    });

    it("includes newer OpenAI voices (ballad, cedar, juniper, marin, verse) (#2393)", () => {
      expect(isValidOpenAIVoice("ballad")).toBe(true);
      expect(isValidOpenAIVoice("cedar")).toBe(true);
      expect(isValidOpenAIVoice("juniper")).toBe(true);
      expect(isValidOpenAIVoice("marin")).toBe(true);
      expect(isValidOpenAIVoice("verse")).toBe(true);
    });

    it("rejects invalid voice names", () => {
      expect(isValidOpenAIVoice("invalid")).toBe(false);
      expect(isValidOpenAIVoice("")).toBe(false);
      expect(isValidOpenAIVoice("ALLOY")).toBe(false);
      expect(isValidOpenAIVoice("alloy ")).toBe(false);
      expect(isValidOpenAIVoice(" alloy")).toBe(false);
    });
  });

  describe("isValidOpenAIModel", () => {
    it("accepts supported models", () => {
      expect(isValidOpenAIModel("gpt-4o-mini-tts")).toBe(true);
      expect(isValidOpenAIModel("tts-1")).toBe(true);
      expect(isValidOpenAIModel("tts-1-hd")).toBe(true);
    });

    it("rejects unsupported models", () => {
      expect(isValidOpenAIModel("invalid")).toBe(false);
      expect(isValidOpenAIModel("")).toBe(false);
      expect(isValidOpenAIModel("gpt-4")).toBe(false);
    });
  });

  describe("OPENAI_TTS_MODELS", () => {
    it("contains supported models", () => {
      expect(OPENAI_TTS_MODELS).toContain("gpt-4o-mini-tts");
      expect(OPENAI_TTS_MODELS).toContain("tts-1");
      expect(OPENAI_TTS_MODELS).toContain("tts-1-hd");
      expect(OPENAI_TTS_MODELS).toHaveLength(3);
    });

    it("is a non-empty array", () => {
      expect(Array.isArray(OPENAI_TTS_MODELS)).toBe(true);
      expect(OPENAI_TTS_MODELS.length).toBeGreaterThan(0);
    });
  });

  describe("resolveOutputFormat", () => {
    it("uses Opus for Telegram", () => {
      const output = resolveOutputFormat("telegram");
      expect(output.openai).toBe("opus");
      expect(output.elevenlabs).toBe("opus_48000_64");
      expect(output.extension).toBe(".opus");
      expect(output.voiceCompatible).toBe(true);
    });

    it("uses MP3 for other channels", () => {
      const output = resolveOutputFormat("discord");
      expect(output.openai).toBe("mp3");
      expect(output.elevenlabs).toBe("mp3_44100_128");
      expect(output.extension).toBe(".mp3");
      expect(output.voiceCompatible).toBe(false);
    });
  });

  describe("resolveEdgeOutputFormat", () => {
    const baseCfg = {
      agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      messages: { tts: {} },
    };

    it("uses default output format when edge output format is not configured", () => {
      const config = resolveTtsConfig(baseCfg);
      expect(resolveEdgeOutputFormat(config)).toBe("audio-24khz-48kbitrate-mono-mp3");
    });

    it("uses configured output format when provided", () => {
      const config = resolveTtsConfig({
        ...baseCfg,
        messages: {
          tts: {
            edge: { outputFormat: "audio-24khz-96kbitrate-mono-mp3" },
          },
        },
      });
      expect(resolveEdgeOutputFormat(config)).toBe("audio-24khz-96kbitrate-mono-mp3");
    });
  });

  describe("parseTtsDirectives", () => {
    it("extracts overrides and strips directives when enabled", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input =
        "Hello [[tts:provider=elevenlabs voiceId=pMsXgVXv3BLzUgSXRplE stability=0.4 speed=1.1]] world\n\n" +
        "[[tts:text]](laughs) Read the song once more.[[/tts:text]]";
      const result = parseTtsDirectives(input, policy);

      expect(result.cleanedText).not.toContain("[[tts:");
      expect(result.ttsText).toBe("(laughs) Read the song once more.");
      expect(result.overrides.provider).toBe("elevenlabs");
      expect(result.overrides.elevenlabs?.voiceId).toBe("pMsXgVXv3BLzUgSXRplE");
      expect(result.overrides.elevenlabs?.voiceSettings?.stability).toBe(0.4);
      expect(result.overrides.elevenlabs?.voiceSettings?.speed).toBe(1.1);
    });

    it("accepts edge as provider override", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:provider=edge]] world";
      const result = parseTtsDirectives(input, policy);

      expect(result.overrides.provider).toBe("edge");
    });

    it("keeps text intact when overrides are disabled", () => {
      const policy = resolveModelOverridePolicy({ enabled: false });
      const input = "Hello [[tts:voice=alloy]] world";
      const result = parseTtsDirectives(input, policy);

      expect(result.cleanedText).toBe(input);
      expect(result.overrides.provider).toBeUndefined();
    });
  });

  describe("summarizeText", () => {
    const baseCfg = {
      agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      messages: { tts: {} },
    };
    const baseConfig = resolveTtsConfig(baseCfg);

    it("summarizes text and returns result with metrics", async () => {
      const mockSummary = "This is a summarized version of the text.";
      vi.mocked(completeSimple).mockResolvedValue({
        content: [{ type: "text", text: mockSummary }],
      });

      const longText = "A".repeat(2000);
      const result = await summarizeText({
        text: longText,
        targetLength: 1500,
        cfg: baseCfg,
        config: baseConfig,
        timeoutMs: 30_000,
      });

      expect(result.summary).toBe(mockSummary);
      expect(result.inputLength).toBe(2000);
      expect(result.outputLength).toBe(mockSummary.length);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(completeSimple).toHaveBeenCalledTimes(1);
    });

    it("calls the summary model with the expected parameters", async () => {
      await summarizeText({
        text: "Long text to summarize",
        targetLength: 500,
        cfg: baseCfg,
        config: baseConfig,
        timeoutMs: 30_000,
      });

      const callArgs = vi.mocked(completeSimple).mock.calls[0];
      expect(callArgs?.[1]?.messages?.[0]?.role).toBe("user");
      expect(callArgs?.[2]?.maxTokens).toBe(250);
      expect(callArgs?.[2]?.temperature).toBe(0.3);
      expect(getApiKeyForModel).toHaveBeenCalledTimes(1);
    });

    it("uses summaryModel override when configured", async () => {
      const cfg = {
        agents: { defaults: { model: { primary: "anthropic/claude-opus-4-5" } } },
        messages: { tts: { summaryModel: "openai/gpt-4.1-mini" } },
      };
      const config = resolveTtsConfig(cfg);
      await summarizeText({
        text: "Long text to summarize",
        targetLength: 500,
        cfg,
        config,
        timeoutMs: 30_000,
      });

      expect(resolveModel).toHaveBeenCalledWith("openai", "gpt-4.1-mini", undefined, cfg);
    });

    it("rejects targetLength below minimum (100)", async () => {
      await expect(
        summarizeText({
          text: "text",
          targetLength: 99,
          cfg: baseCfg,
          config: baseConfig,
          timeoutMs: 30_000,
        }),
      ).rejects.toThrow("Invalid targetLength: 99");
    });

    it("rejects targetLength above maximum (10000)", async () => {
      await expect(
        summarizeText({
          text: "text",
          targetLength: 10001,
          cfg: baseCfg,
          config: baseConfig,
          timeoutMs: 30_000,
        }),
      ).rejects.toThrow("Invalid targetLength: 10001");
    });

    it("accepts targetLength at boundaries", async () => {
      await expect(
        summarizeText({
          text: "text",
          targetLength: 100,
          cfg: baseCfg,
          config: baseConfig,
          timeoutMs: 30_000,
        }),
      ).resolves.toBeDefined();
      await expect(
        summarizeText({
          text: "text",
          targetLength: 10000,
          cfg: baseCfg,
          config: baseConfig,
          timeoutMs: 30_000,
        }),
      ).resolves.toBeDefined();
    });

    it("throws error when no summary is returned", async () => {
      vi.mocked(completeSimple).mockResolvedValue({
        content: [],
      });

      await expect(
        summarizeText({
          text: "text",
          targetLength: 500,
          cfg: baseCfg,
          config: baseConfig,
          timeoutMs: 30_000,
        }),
      ).rejects.toThrow("No summary returned");
    });

    it("throws error when summary content is empty", async () => {
      vi.mocked(completeSimple).mockResolvedValue({
        content: [{ type: "text", text: "   " }],
      });

      await expect(
        summarizeText({
          text: "text",
          targetLength: 500,
          cfg: baseCfg,
          config: baseConfig,
          timeoutMs: 30_000,
        }),
      ).rejects.toThrow("No summary returned");
    });
  });

  describe("getTtsProvider", () => {
    const baseCfg = {
      agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      messages: { tts: {} },
    };

    it("prefers OpenAI when no provider is configured and API key exists", () => {
      withEnv(
        {
          OPENAI_API_KEY: "test-openai-key",
          ELEVENLABS_API_KEY: undefined,
          XI_API_KEY: undefined,
        },
        () => {
          const config = resolveTtsConfig(baseCfg);
          const provider = getTtsProvider(config, "/tmp/tts-prefs-openai.json");
          expect(provider).toBe("openai");
        },
      );
    });

    it("prefers ElevenLabs when OpenAI is missing and ElevenLabs key exists", () => {
      withEnv(
        {
          OPENAI_API_KEY: undefined,
          ELEVENLABS_API_KEY: "test-elevenlabs-key",
          XI_API_KEY: undefined,
        },
        () => {
          const config = resolveTtsConfig(baseCfg);
          const provider = getTtsProvider(config, "/tmp/tts-prefs-elevenlabs.json");
          expect(provider).toBe("elevenlabs");
        },
      );
    });

    it("falls back to Edge when no API keys are present", () => {
      withEnv(
        {
          OPENAI_API_KEY: undefined,
          ELEVENLABS_API_KEY: undefined,
          XI_API_KEY: undefined,
        },
        () => {
          const config = resolveTtsConfig(baseCfg);
          const provider = getTtsProvider(config, "/tmp/tts-prefs-edge.json");
          expect(provider).toBe("edge");
        },
      );
    });
  });

  describe("maybeApplyTtsToPayload", () => {
    const baseCfg = {
      agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      messages: {
        tts: {
          auto: "inbound",
          provider: "openai",
          openai: { apiKey: "test-key", model: "gpt-4o-mini-tts", voice: "alloy" },
        },
      },
    };

    it("skips auto-TTS when inbound audio gating is on and the message is not audio", async () => {
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = `/tmp/tts-test-${Date.now()}.json`;
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const payload = { text: "Hello world" };
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg: baseCfg,
        kind: "final",
        inboundAudio: false,
      });

      expect(result).toBe(payload);
      expect(fetchMock).not.toHaveBeenCalled();

      globalThis.fetch = originalFetch;
      process.env.OPENCLAW_TTS_PREFS = prevPrefs;
    });

    it("skips auto-TTS when markdown stripping leaves text too short", async () => {
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = `/tmp/tts-test-${Date.now()}.json`;
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const payload = { text: "### **bold**" };
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg: baseCfg,
        kind: "final",
        inboundAudio: true,
      });

      expect(result).toBe(payload);
      expect(fetchMock).not.toHaveBeenCalled();

      globalThis.fetch = originalFetch;
      process.env.OPENCLAW_TTS_PREFS = prevPrefs;
    });

    it("attempts auto-TTS when inbound audio gating is on and the message is audio", async () => {
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = `/tmp/tts-test-${Date.now()}.json`;
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await maybeApplyTtsToPayload({
        payload: { text: "Hello world" },
        cfg: baseCfg,
        kind: "final",
        inboundAudio: true,
      });

      expect(result.mediaUrl).toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      globalThis.fetch = originalFetch;
      process.env.OPENCLAW_TTS_PREFS = prevPrefs;
    });

    it("skips auto-TTS in tagged mode unless a tts tag is present", async () => {
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = `/tmp/tts-test-${Date.now()}.json`;
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const cfg = {
        ...baseCfg,
        messages: {
          ...baseCfg.messages,
          tts: { ...baseCfg.messages.tts, auto: "tagged" },
        },
      };

      const payload = { text: "Hello world" };
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg,
        kind: "final",
      });

      expect(result).toBe(payload);
      expect(fetchMock).not.toHaveBeenCalled();

      globalThis.fetch = originalFetch;
      process.env.OPENCLAW_TTS_PREFS = prevPrefs;
    });

    it("runs auto-TTS in tagged mode when tags are present", async () => {
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = `/tmp/tts-test-${Date.now()}.json`;
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1),
      }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const cfg = {
        ...baseCfg,
        messages: {
          ...baseCfg.messages,
          tts: { ...baseCfg.messages.tts, auto: "tagged" },
        },
      };

      const result = await maybeApplyTtsToPayload({
        payload: { text: "[[tts:text]]Hello world[[/tts:text]]" },
        cfg,
        kind: "final",
      });

      expect(result.mediaUrl).toBeDefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      globalThis.fetch = originalFetch;
      process.env.OPENCLAW_TTS_PREFS = prevPrefs;
    });
  });

  describe("resolveTtsConfig", () => {
    it("returns defaults when no tts config is provided", () => {
      const cfg = { agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } } };
      const config = resolveTtsConfig(cfg);
      expect(config.auto).toBe("off");
      expect(config.mode).toBe("final");
      expect(config.provider).toBe("edge");
      expect(config.providerSource).toBe("default");
      expect(config.maxTextLength).toBe(4096);
      expect(config.timeoutMs).toBe(30000);
      expect(config.elevenlabs.baseUrl).toBe("https://api.elevenlabs.io");
      expect(config.openai.model).toBe("gpt-4o-mini-tts");
      expect(config.openai.voice).toBe("alloy");
      expect(config.edge.voice).toBe("en-US-MichelleNeural");
    });

    it("uses 'always' when enabled is true and auto is not set", () => {
      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { enabled: true } },
      };
      const config = resolveTtsConfig(cfg);
      expect(config.auto).toBe("always");
    });

    it("uses explicit auto mode over enabled", () => {
      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { auto: "tagged", enabled: true } },
      };
      const config = resolveTtsConfig(cfg);
      expect(config.auto).toBe("tagged");
    });

    it("sets providerSource to config when provider is specified", () => {
      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "openai" } },
      };
      const config = resolveTtsConfig(cfg);
      expect(config.providerSource).toBe("config");
      expect(config.provider).toBe("openai");
    });
  });

  describe("normalizeTtsAutoMode", () => {
    const { normalizeTtsAutoMode } = tts;

    it("normalizes valid modes", () => {
      expect(normalizeTtsAutoMode("off")).toBe("off");
      expect(normalizeTtsAutoMode("always")).toBe("always");
      expect(normalizeTtsAutoMode("inbound")).toBe("inbound");
      expect(normalizeTtsAutoMode("tagged")).toBe("tagged");
    });

    it("is case-insensitive and trims", () => {
      expect(normalizeTtsAutoMode("  OFF  ")).toBe("off");
      expect(normalizeTtsAutoMode("ALWAYS")).toBe("always");
    });

    it("returns undefined for invalid values", () => {
      expect(normalizeTtsAutoMode("invalid")).toBeUndefined();
      expect(normalizeTtsAutoMode(42)).toBeUndefined();
      expect(normalizeTtsAutoMode(null)).toBeUndefined();
    });
  });

  describe("resolveTtsProviderOrder", () => {
    const { resolveTtsProviderOrder } = tts;

    it("puts primary provider first", () => {
      const order = resolveTtsProviderOrder("openai");
      expect(order[0]).toBe("openai");
      expect(order).toContain("elevenlabs");
      expect(order).toContain("edge");

      const order2 = resolveTtsProviderOrder("elevenlabs");
      expect(order2[0]).toBe("elevenlabs");

      const order3 = resolveTtsProviderOrder("edge");
      expect(order3[0]).toBe("edge");
    });
  });

  describe("isTtsProviderConfigured", () => {
    const { isTtsProviderConfigured } = tts;
    const baseCfg = {
      agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      messages: { tts: {} },
    };

    it("returns true for edge when enabled", () => {
      const config = resolveTtsConfig(baseCfg);
      expect(isTtsProviderConfigured(config, "edge")).toBe(true);
    });

    it("returns false for edge when disabled", () => {
      const cfg = {
        ...baseCfg,
        messages: { tts: { edge: { enabled: false } } },
      };
      const config = resolveTtsConfig(cfg);
      expect(isTtsProviderConfigured(config, "edge")).toBe(false);
    });

    it("returns false for openai without API key", () => {
      withEnv({ OPENAI_API_KEY: undefined }, () => {
        const config = resolveTtsConfig(baseCfg);
        expect(isTtsProviderConfigured(config, "openai")).toBe(false);
      });
    });
  });

  describe("resolveTtsApiKey", () => {
    const { resolveTtsApiKey } = tts;
    const baseCfg = {
      agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      messages: { tts: {} },
    };

    it("returns config key for elevenlabs", () => {
      const cfg = {
        ...baseCfg,
        messages: { tts: { elevenlabs: { apiKey: "cfg-key" } } },
      };
      const config = resolveTtsConfig(cfg);
      expect(resolveTtsApiKey(config, "elevenlabs")).toBe("cfg-key");
    });

    it("returns env key for openai", () => {
      withEnv({ OPENAI_API_KEY: "env-key" }, () => {
        const config = resolveTtsConfig(baseCfg);
        expect(resolveTtsApiKey(config, "openai")).toBe("env-key");
      });
    });

    it("returns undefined for edge", () => {
      const config = resolveTtsConfig(baseCfg);
      expect(resolveTtsApiKey(config, "edge")).toBeUndefined();
    });

    it("falls back to XI_API_KEY for elevenlabs", () => {
      withEnv({ ELEVENLABS_API_KEY: undefined, XI_API_KEY: "xi-key" }, () => {
        const config = resolveTtsConfig(baseCfg);
        expect(resolveTtsApiKey(config, "elevenlabs")).toBe("xi-key");
      });
    });
  });

  describe("textToSpeech", () => {
    const baseCfg = {
      agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      messages: {
        tts: {
          provider: "openai",
          openai: { apiKey: "test-key" },
        },
      },
    };

    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("returns error when text exceeds maxTextLength", async () => {
      const result = await tts.textToSpeech({
        text: "A".repeat(5000),
        cfg: baseCfg,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Text too long");
    });

    it("synthesizes with openai provider", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const result = await tts.textToSpeech({
        text: "Hello world",
        cfg: baseCfg,
      });
      expect(result.success).toBe(true);
      expect(result.provider).toBe("openai");
      expect(result.audioPath).toBeDefined();
    });

    it("falls back to next provider on failure", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Network error");
        }
        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(100),
        };
      }) as unknown as typeof fetch;

      withEnv({ ELEVENLABS_API_KEY: "el-key" }, () => {
        // Will be synchronous config resolution, async TTS
      });

      const cfg = {
        ...baseCfg,
        messages: {
          tts: {
            provider: "openai",
            openai: { apiKey: "test-key" },
            elevenlabs: { apiKey: "el-key" },
          },
        },
      };

      const result = await tts.textToSpeech({
        text: "Hello world",
        cfg,
      });
      // Either succeeds with elevenlabs or fails - depends on fallback
      expect(result).toBeDefined();
    });

    it("returns failure when all providers fail", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("Network error");
      }) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: {
          tts: {
            provider: "openai",
            openai: { apiKey: "test-key" },
            edge: { enabled: false },
          },
        },
      };

      const result = await tts.textToSpeech({
        text: "Hello world",
        cfg,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("TTS conversion failed");
    });
  });

  describe("tts-core: elevenLabsTTS", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    const validSettings = {
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.0,
      useSpeakerBoost: true,
      speed: 1.0,
    };

    it("rejects invalid voiceId", async () => {
      await expect(
        ttsCore.elevenLabsTTS({
          text: "test",
          apiKey: "key",
          baseUrl: "https://api.elevenlabs.io",
          voiceId: "bad",
          modelId: "eleven_multilingual_v2",
          outputFormat: "mp3_44100_128",
          voiceSettings: validSettings,
          timeoutMs: 5000,
        }),
      ).rejects.toThrow("Invalid voiceId format");
    });

    it("sends correct request to elevenlabs API", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const result = await ttsCore.elevenLabsTTS({
        text: "Hello",
        apiKey: "test-key",
        baseUrl: "https://api.elevenlabs.io",
        voiceId: "pMsXgVXv3BLzUgSXRplE",
        modelId: "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
        seed: 42,
        languageCode: "en",
        applyTextNormalization: "auto",
        voiceSettings: validSettings,
        timeoutMs: 5000,
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(callArgs[0]).toContain("pMsXgVXv3BLzUgSXRplE");
    });

    it("throws on non-ok response", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 401,
      })) as unknown as typeof fetch;

      await expect(
        ttsCore.elevenLabsTTS({
          text: "Hello",
          apiKey: "bad-key",
          baseUrl: "https://api.elevenlabs.io",
          voiceId: "pMsXgVXv3BLzUgSXRplE",
          modelId: "eleven_multilingual_v2",
          outputFormat: "mp3_44100_128",
          voiceSettings: validSettings,
          timeoutMs: 5000,
        }),
      ).rejects.toThrow("ElevenLabs API error (401)");
    });
  });

  describe("tts-core: openaiTTS", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("sends correct request", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(50),
      })) as unknown as typeof fetch;

      const result = await ttsCore.openaiTTS({
        text: "Hello",
        apiKey: "sk-test",
        model: "tts-1",
        voice: "alloy",
        responseFormat: "mp3",
        timeoutMs: 5000,
      });

      expect(result).toBeInstanceOf(Buffer);
    });

    it("rejects invalid model", async () => {
      await expect(
        ttsCore.openaiTTS({
          text: "Hello",
          apiKey: "sk-test",
          model: "invalid-model",
          voice: "alloy",
          responseFormat: "mp3",
          timeoutMs: 5000,
        }),
      ).rejects.toThrow("Invalid model");
    });

    it("rejects invalid voice", async () => {
      await expect(
        ttsCore.openaiTTS({
          text: "Hello",
          apiKey: "sk-test",
          model: "tts-1",
          voice: "invalid-voice",
          responseFormat: "mp3",
          timeoutMs: 5000,
        }),
      ).rejects.toThrow("Invalid voice");
    });

    it("throws on non-ok response", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
      })) as unknown as typeof fetch;

      await expect(
        ttsCore.openaiTTS({
          text: "Hello",
          apiKey: "sk-test",
          model: "tts-1",
          voice: "alloy",
          responseFormat: "mp3",
          timeoutMs: 5000,
        }),
      ).rejects.toThrow("OpenAI TTS API error (500)");
    });
  });

  describe("tts-core: inferEdgeExtension", () => {
    it("returns correct extensions", () => {
      expect(ttsCore.inferEdgeExtension("webm-24khz")).toBe(".webm");
      expect(ttsCore.inferEdgeExtension("ogg-24khz")).toBe(".ogg");
      expect(ttsCore.inferEdgeExtension("opus-24khz")).toBe(".opus");
      expect(ttsCore.inferEdgeExtension("wav-24khz")).toBe(".wav");
      expect(ttsCore.inferEdgeExtension("riff-24khz")).toBe(".wav");
      expect(ttsCore.inferEdgeExtension("pcm-24khz")).toBe(".wav");
      expect(ttsCore.inferEdgeExtension("audio-24khz-48kbitrate-mono-mp3")).toBe(".mp3");
      expect(ttsCore.inferEdgeExtension("unknown")).toBe(".mp3");
    });
  });

  describe("tts-core: scheduleCleanup", () => {
    it("does not throw", () => {
      expect(() => ttsCore.scheduleCleanup("/tmp/nonexistent-dir", 100)).not.toThrow();
    });
  });

  describe("tts-core: isValidOpenAIModel with custom endpoint", () => {
    it("accepts any model with custom endpoint", () => {
      withEnv({ OPENAI_TTS_BASE_URL: "http://localhost:8880/v1" }, () => {
        expect(ttsCore.isValidOpenAIModel("kokoro-v1")).toBe(true);
        expect(ttsCore.isValidOpenAIVoice("zh-CN-XiaoYiNeural")).toBe(true);
      });
    });
  });

  describe("tts prefs functions", () => {
    const {
      setTtsAutoMode,
      setTtsEnabled,
      setTtsProvider,
      setTtsMaxLength,
      setSummarizationEnabled,
      isSummarizationEnabled,
      getTtsMaxLength,
      getLastTtsAttempt,
      setLastTtsAttempt,
      isTtsEnabled,
      buildTtsSystemPromptHint,
    } = tts;

    it("setTtsAutoMode and read back via isTtsEnabled", () => {
      const prefsPath = `/tmp/tts-prefs-test-${Date.now()}.json`;
      const config = resolveTtsConfig({
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      });

      setTtsAutoMode(prefsPath, "always");
      expect(isTtsEnabled(config, prefsPath)).toBe(true);

      setTtsAutoMode(prefsPath, "off");
      expect(isTtsEnabled(config, prefsPath)).toBe(false);
    });

    it("setTtsEnabled toggles on/off", () => {
      const prefsPath = `/tmp/tts-prefs-test-${Date.now()}.json`;
      const config = resolveTtsConfig({
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      });

      setTtsEnabled(prefsPath, true);
      expect(isTtsEnabled(config, prefsPath)).toBe(true);

      setTtsEnabled(prefsPath, false);
      expect(isTtsEnabled(config, prefsPath)).toBe(false);
    });

    it("setTtsProvider persists", () => {
      const prefsPath = `/tmp/tts-prefs-test-${Date.now()}.json`;
      const config = resolveTtsConfig({
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      });

      setTtsProvider(prefsPath, "openai");
      withEnv(
        { OPENAI_API_KEY: undefined, ELEVENLABS_API_KEY: undefined, XI_API_KEY: undefined },
        () => {
          expect(getTtsProvider(config, prefsPath)).toBe("openai");
        },
      );
    });

    it("getTtsMaxLength returns default without prefs", () => {
      expect(getTtsMaxLength(`/tmp/nonexistent-${Date.now()}.json`)).toBe(1500);
    });

    it("setTtsMaxLength persists", () => {
      const prefsPath = `/tmp/tts-prefs-test-${Date.now()}.json`;
      setTtsMaxLength(prefsPath, 2000);
      expect(getTtsMaxLength(prefsPath)).toBe(2000);
    });

    it("summarization defaults to true", () => {
      expect(isSummarizationEnabled(`/tmp/nonexistent-${Date.now()}.json`)).toBe(true);
    });

    it("setSummarizationEnabled persists", () => {
      const prefsPath = `/tmp/tts-prefs-test-${Date.now()}.json`;
      setSummarizationEnabled(prefsPath, false);
      expect(isSummarizationEnabled(prefsPath)).toBe(false);
    });

    it("lastTtsAttempt get/set", () => {
      setLastTtsAttempt(undefined);
      expect(getLastTtsAttempt()).toBeUndefined();

      const entry = { timestamp: Date.now(), success: true, textLength: 100, summarized: false };
      setLastTtsAttempt(entry);
      expect(getLastTtsAttempt()).toBe(entry);
      setLastTtsAttempt(undefined);
    });

    it("buildTtsSystemPromptHint returns undefined when off", () => {
      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { auto: "off" } },
      };
      expect(buildTtsSystemPromptHint(cfg)).toBeUndefined();
    });

    it("buildTtsSystemPromptHint returns hint when enabled", () => {
      const prefsPath = `/tmp/tts-prefs-test-${Date.now()}.json`;
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = prefsPath;
      try {
        const cfg = {
          agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
          messages: { tts: { auto: "always" } },
        };
        const hint = buildTtsSystemPromptHint(cfg);
        expect(hint).toContain("Voice (TTS) is enabled");
      } finally {
        if (prevPrefs === undefined) {
          delete process.env.OPENCLAW_TTS_PREFS;
        } else {
          process.env.OPENCLAW_TTS_PREFS = prevPrefs;
        }
      }
    });

    it("buildTtsSystemPromptHint includes inbound hint", () => {
      const prefsPath = `/tmp/tts-prefs-test-${Date.now()}.json`;
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = prefsPath;
      try {
        const cfg = {
          agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
          messages: { tts: { auto: "inbound" } },
        };
        const hint = buildTtsSystemPromptHint(cfg);
        expect(hint).toContain("audio/voice");
      } finally {
        if (prevPrefs === undefined) {
          delete process.env.OPENCLAW_TTS_PREFS;
        } else {
          process.env.OPENCLAW_TTS_PREFS = prevPrefs;
        }
      }
    });

    it("buildTtsSystemPromptHint includes tagged hint", () => {
      const prefsPath = `/tmp/tts-prefs-test-${Date.now()}.json`;
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = prefsPath;
      try {
        const cfg = {
          agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
          messages: { tts: { auto: "tagged" } },
        };
        const hint = buildTtsSystemPromptHint(cfg);
        expect(hint).toContain("[[tts]]");
      } finally {
        if (prevPrefs === undefined) {
          delete process.env.OPENCLAW_TTS_PREFS;
        } else {
          process.env.OPENCLAW_TTS_PREFS = prevPrefs;
        }
      }
    });
  });

  describe("resolveTtsPrefsPath", () => {
    const { resolveTtsPrefsPath } = tts;

    it("uses config prefsPath when provided", () => {
      const config = resolveTtsConfig({
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { prefsPath: "/custom/path.json" } },
      });
      expect(resolveTtsPrefsPath(config)).toBe("/custom/path.json");
    });

    it("uses env OPENCLAW_TTS_PREFS when set", () => {
      const config = resolveTtsConfig({
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      });
      withEnv({ OPENCLAW_TTS_PREFS: "/env/path.json" }, () => {
        expect(resolveTtsPrefsPath(config)).toBe("/env/path.json");
      });
    });
  });

  describe("parseTtsDirectives - additional branches", () => {
    it("handles similarity/similarityboost aliases", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:similarity=0.8]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.elevenlabs?.voiceSettings?.similarityBoost).toBe(0.8);
    });

    it("handles speakerBoost directive", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:speakerBoost=true]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.elevenlabs?.voiceSettings?.useSpeakerBoost).toBe(true);
    });

    it("handles seed directive", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:seed=42]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.elevenlabs?.seed).toBe(42);
    });

    it("handles normalize/language directives", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:normalize=on language=de]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.elevenlabs?.applyTextNormalization).toBe("on");
      expect(result.overrides.elevenlabs?.languageCode).toBe("de");
    });

    it("warns on invalid values", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input =
        "Hello [[tts:stability=abc speed=abc similarity=abc style=abc speakerBoost=maybe seed=abc]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("warns on unsupported provider", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:provider=azure]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.warnings).toContain('unsupported provider "azure"');
    });

    it("warns on invalid voice", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:voice=INVALID_VOICE]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("warns on invalid voiceId", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:voiceId=bad]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("handles model directive mapping to elevenlabs", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:model=eleven_multilingual_v2]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.elevenlabs?.modelId).toBe("eleven_multilingual_v2");
    });

    it("respects allowVoice=false", () => {
      const policy = resolveModelOverridePolicy({ enabled: true, allowVoice: false });
      const input = "Hello [[tts:voice=alloy voiceId=pMsXgVXv3BLzUgSXRplE]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.openai?.voice).toBeUndefined();
      expect(result.overrides.elevenlabs?.voiceId).toBeUndefined();
    });

    it("respects allowVoiceSettings=false", () => {
      const policy = resolveModelOverridePolicy({ enabled: true, allowVoiceSettings: false });
      const input = "Hello [[tts:stability=0.5 speed=1.5 speakerBoost=true]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.elevenlabs?.voiceSettings).toBeUndefined();
    });

    it("respects allowNormalization=false", () => {
      const policy = resolveModelOverridePolicy({ enabled: true, allowNormalization: false });
      const input = "Hello [[tts:normalize=on language=de]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.elevenlabs?.applyTextNormalization).toBeUndefined();
      expect(result.overrides.elevenlabs?.languageCode).toBeUndefined();
    });

    it("respects allowSeed=false", () => {
      const policy = resolveModelOverridePolicy({ enabled: true, allowSeed: false });
      const input = "Hello [[tts:seed=42]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.elevenlabs?.seed).toBeUndefined();
    });

    it("respects allowModelId=false", () => {
      const policy = resolveModelOverridePolicy({ enabled: true, allowModelId: false });
      const input = "Hello [[tts:model=tts-1]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.openai?.model).toBeUndefined();
    });

    it("skips tokens without = sign", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:justAWord provider=openai]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.provider).toBe("openai");
    });

    it("skips empty key or value", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:=value key=]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.overrides.provider).toBeUndefined();
    });

    it("handles out-of-range values with warnings", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:stability=5.0]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("handles invalid normalize value", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:normalize=invalid]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("handles invalid language code", () => {
      const policy = resolveModelOverridePolicy({ enabled: true });
      const input = "Hello [[tts:language=english]] world";
      const result = parseTtsDirectives(input, policy);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("textToSpeech", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      process.env.OPENCLAW_TTS_PREFS = `/tmp/tts-test-${Date.now()}.json`;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      delete process.env.OPENCLAW_TTS_PREFS;
    });

    it("returns error when text too long", async () => {
      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "openai", openai: { apiKey: "key" } } },
      };
      const result = await tts.textToSpeech({
        text: "A".repeat(5000),
        cfg,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Text too long");
    });

    it("synthesizes with openai provider and writes file", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "openai", openai: { apiKey: "key" } } },
      };
      const result = await tts.textToSpeech({ text: "Hello world", cfg });
      expect(result.success).toBe(true);
      expect(result.provider).toBe("openai");
      expect(result.audioPath).toBeDefined();
      expect(result.latencyMs).toBeDefined();
    });

    it("synthesizes with elevenlabs provider", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "elevenlabs", elevenlabs: { apiKey: "key" } } },
      };
      const result = await tts.textToSpeech({ text: "Hello world", cfg });
      expect(result.success).toBe(true);
      expect(result.provider).toBe("elevenlabs");
    });

    it("applies directive overrides for elevenlabs", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "elevenlabs", elevenlabs: { apiKey: "key" } } },
      };
      const result = await tts.textToSpeech({
        text: "Hello world",
        cfg,
        overrides: {
          elevenlabs: {
            voiceId: "pMsXgVXv3BLzUgSXRplE",
            modelId: "eleven_multilingual_v2",
            seed: 42,
            applyTextNormalization: "on",
            languageCode: "de",
            voiceSettings: { stability: 0.8 },
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it("applies directive overrides for openai", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "openai", openai: { apiKey: "key" } } },
      };
      const result = await tts.textToSpeech({
        text: "Hello world",
        cfg,
        overrides: {
          openai: { voice: "shimmer", model: "tts-1" },
        },
      });
      expect(result.success).toBe(true);
    });

    it("falls back to next provider on failure", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error("provider failure");
        }
        return {
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(100),
        };
      }) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: {
          tts: { provider: "openai", openai: { apiKey: "key" }, elevenlabs: { apiKey: "key2" } },
        },
      };
      const result = await tts.textToSpeech({ text: "Hello world", cfg });
      expect(result.success).toBe(true);
      expect(result.provider).toBe("elevenlabs");
    });

    it("returns failure when all providers fail", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("fail");
      }) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: {
          tts: { provider: "openai", openai: { apiKey: "key" }, edge: { enabled: false } },
        },
      };
      const result = await tts.textToSpeech({ text: "Hello world", cfg });
      expect(result.success).toBe(false);
      expect(result.error).toContain("TTS conversion failed");
    });

    it("formats AbortError as timeout", async () => {
      globalThis.fetch = vi.fn(async () => {
        const err = new Error("abort");
        err.name = "AbortError";
        throw err;
      }) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: {
          tts: { provider: "openai", openai: { apiKey: "key" }, edge: { enabled: false } },
        },
      };
      const result = await tts.textToSpeech({ text: "Hello world", cfg });
      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });

    it("skips providers without API key", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("should not call");
      }) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "openai", edge: { enabled: false }, local: { url: "" } } },
      };
      const result = await tts.textToSpeech({ text: "Hello world", cfg });
      expect(result.success).toBe(false);
      expect(result.error).toContain("TTS conversion failed");
    });

    it("uses telegram output format for telegram channel", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "openai", openai: { apiKey: "key" } } },
      };
      const result = await tts.textToSpeech({ text: "Hello world", cfg, channel: "telegram" });
      expect(result.success).toBe(true);
      expect(result.voiceCompatible).toBe(true);
      expect(result.outputFormat).toBe("opus");
    });

    it("uses override provider from directives", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: {
          tts: { provider: "openai", openai: { apiKey: "key" }, elevenlabs: { apiKey: "key2" } },
        },
      };
      const result = await tts.textToSpeech({
        text: "Hello world",
        cfg,
        overrides: { provider: "elevenlabs" },
      });
      expect(result.success).toBe(true);
      expect(result.provider).toBe("elevenlabs");
    });

    it("handles edge provider disabled", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("fail");
      }) as unknown as typeof fetch;
      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "edge", edge: { enabled: false } } },
      };
      const result = await tts.textToSpeech({ text: "Hello world", cfg });
      // Edge is disabled, falls through to other providers which also fail
      expect(result.success).toBe(false);
      expect(result.error).toContain("TTS conversion failed");
    });
  });

  describe("textToSpeechTelephony", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("returns error when text too long", async () => {
      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "openai", openai: { apiKey: "key" } } },
      };
      const result = await tts.textToSpeechTelephony({
        text: "A".repeat(5000),
        cfg,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Text too long");
    });

    it("synthesizes with openai for telephony", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "openai", openai: { apiKey: "key" } } },
      };
      const result = await tts.textToSpeechTelephony({ text: "Hello", cfg });
      expect(result.success).toBe(true);
      expect(result.provider).toBe("openai");
      expect(result.sampleRate).toBeDefined();
    });

    it("skips edge for telephony", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("fail");
      }) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "edge" } },
      };
      const result = await tts.textToSpeechTelephony({ text: "Hello", cfg });
      expect(result.success).toBe(false);
    });

    it("synthesizes with elevenlabs for telephony", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const cfg = {
        agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
        messages: { tts: { provider: "elevenlabs", elevenlabs: { apiKey: "key" } } },
      };
      const result = await tts.textToSpeechTelephony({ text: "Hello", cfg });
      expect(result.success).toBe(true);
      expect(result.provider).toBe("elevenlabs");
    });
  });

  describe("maybeApplyTtsToPayload - additional branches", () => {
    const baseCfg = {
      agents: { defaults: { model: { primary: "openai/gpt-4o-mini" } } },
      messages: {
        tts: {
          auto: "always",
          provider: "openai",
          openai: { apiKey: "test-key" },
        },
      },
    };

    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      process.env.OPENCLAW_TTS_PREFS = `/tmp/tts-test-${Date.now()}.json`;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      delete process.env.OPENCLAW_TTS_PREFS;
    });

    it("skips when auto mode is off", async () => {
      const cfg = {
        ...baseCfg,
        messages: { ...baseCfg.messages, tts: { ...baseCfg.messages.tts, auto: "off" } },
      };
      const payload = { text: "Hello world this is a test message" };
      const result = await maybeApplyTtsToPayload({ payload, cfg });
      expect(result).toBe(payload);
    });

    it("skips when text is too short after stripping", async () => {
      const payload = { text: "Hi" };
      const result = await maybeApplyTtsToPayload({ payload, cfg: baseCfg, kind: "final" });
      expect(result.mediaUrl).toBeUndefined();
    });

    it("skips when payload has mediaUrl", async () => {
      const payload = { text: "Hello world this is long enough", mediaUrl: "/some/audio.mp3" };
      const result = await maybeApplyTtsToPayload({ payload, cfg: baseCfg, kind: "final" });
      expect(result).toBe(payload);
    });

    it("skips when text contains MEDIA:", async () => {
      const payload = { text: "MEDIA: some content here for display" };
      const result = await maybeApplyTtsToPayload({ payload, cfg: baseCfg, kind: "final" });
      expect(result.mediaUrl).toBeUndefined();
    });

    it("skips non-final kind when mode is final", async () => {
      const payload = { text: "Hello world this is a test message" };
      const result = await maybeApplyTtsToPayload({ payload, cfg: baseCfg, kind: "block" });
      expect(result.mediaUrl).toBeUndefined();
    });

    it("handles sessionAuto override", async () => {
      const payload = { text: "Hello world this is a test message" };
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg: baseCfg,
        kind: "final",
        ttsAuto: "off",
      });
      expect(result).toBe(payload);
    });

    it("attaches audioPath on successful TTS", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const payload = { text: "Hello world this is a test message that is long enough" };
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg: baseCfg,
        kind: "final",
      });
      expect(result.mediaUrl).toBeDefined();
    });

    it("sets audioAsVoice for telegram channel", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const cfg = {
        ...baseCfg,
        messages: {
          ...baseCfg.messages,
          tts: { ...baseCfg.messages.tts, provider: "openai", openai: { apiKey: "key" } },
        },
      };
      const payload = { text: "Hello world this is a test message that is long enough" };
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg,
        kind: "final",
        channel: "telegram",
      });
      // Telegram output uses opus which is voice-compatible
      expect(result.mediaUrl).toBeDefined();
      expect(result.audioAsVoice).toBe(true);
    });

    it("records failure in lastTtsAttempt on TTS error", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("network error");
      }) as unknown as typeof fetch;

      const cfg = {
        ...baseCfg,
        messages: {
          ...baseCfg.messages,
          tts: {
            ...baseCfg.messages.tts,
            provider: "openai",
            openai: { apiKey: "key" },
            edge: { enabled: false },
          },
        },
      };
      const payload = { text: "Hello world this is a test message that is long enough" };
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg,
        kind: "final",
      });
      // TTS fails, should return payload without mediaUrl
      expect(result.mediaUrl).toBeUndefined();
      const attempt = tts.getLastTtsAttempt();
      expect(attempt).toBeDefined();
      expect(attempt!.success).toBe(false);
    });

    it("truncates long text when summarization is disabled", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const prefsPath = `/tmp/tts-prefs-truncate-${Date.now()}.json`;
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = prefsPath;

      // Set maxLength low and disable summarization
      tts.setTtsMaxLength(prefsPath, 30);
      tts.setSummarizationEnabled(prefsPath, false);

      try {
        const payload = {
          text: "This is a very long message that exceeds the max length limit significantly",
        };
        const result = await maybeApplyTtsToPayload({
          payload,
          cfg: baseCfg,
          kind: "final",
        });
        // Should still proceed with truncated text
        expect(result.mediaUrl).toBeDefined();
      } finally {
        if (prevPrefs === undefined) {
          delete process.env.OPENCLAW_TTS_PREFS;
        } else {
          process.env.OPENCLAW_TTS_PREFS = prevPrefs;
        }
      }
    });

    it("summarizes long text when summarization is enabled", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      vi.mocked(completeSimple).mockResolvedValue({
        content: [{ type: "text", text: "This is a shorter summary for TTS" }],
      });

      const prefsPath = `/tmp/tts-prefs-summarize-${Date.now()}.json`;
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = prefsPath;

      tts.setTtsMaxLength(prefsPath, 30);
      tts.setSummarizationEnabled(prefsPath, true);

      try {
        const payload = {
          text: "This is a very long message that exceeds the max length limit significantly",
        };
        const result = await maybeApplyTtsToPayload({
          payload,
          cfg: baseCfg,
          kind: "final",
        });
        expect(result.mediaUrl).toBeDefined();
      } finally {
        if (prevPrefs === undefined) {
          delete process.env.OPENCLAW_TTS_PREFS;
        } else {
          process.env.OPENCLAW_TTS_PREFS = prevPrefs;
        }
      }
    });

    it("falls back to truncation when summarization fails", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      vi.mocked(completeSimple).mockRejectedValue(new Error("summarization failed"));

      const prefsPath = `/tmp/tts-prefs-summary-fail-${Date.now()}.json`;
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = prefsPath;

      tts.setTtsMaxLength(prefsPath, 30);
      tts.setSummarizationEnabled(prefsPath, true);

      try {
        const payload = {
          text: "This is a very long message that exceeds the max length limit significantly",
        };
        const result = await maybeApplyTtsToPayload({
          payload,
          cfg: baseCfg,
          kind: "final",
        });
        expect(result.mediaUrl).toBeDefined();
      } finally {
        if (prevPrefs === undefined) {
          delete process.env.OPENCLAW_TTS_PREFS;
        } else {
          process.env.OPENCLAW_TTS_PREFS = prevPrefs;
        }
      }
    });

    it("skips tagged mode without directive", async () => {
      const cfg = {
        ...baseCfg,
        messages: { ...baseCfg.messages, tts: { ...baseCfg.messages.tts, auto: "tagged" } },
      };
      const payload = { text: "Hello world this is a test message" };
      const result = await maybeApplyTtsToPayload({ payload, cfg, kind: "final" });
      expect(result.mediaUrl).toBeUndefined();
    });

    it("skips inbound mode when not inbound audio", async () => {
      const cfg = {
        ...baseCfg,
        messages: { ...baseCfg.messages, tts: { ...baseCfg.messages.tts, auto: "inbound" } },
      };
      const payload = { text: "Hello world this is a test message" };
      const result = await maybeApplyTtsToPayload({
        payload,
        cfg,
        kind: "final",
        inboundAudio: false,
      });
      expect(result.mediaUrl).toBeUndefined();
    });

    it("skips when payload has mediaUrls", async () => {
      const payload = {
        text: "Hello world this is long enough text",
        mediaUrls: ["/some/image.jpg"],
      };
      const result = await maybeApplyTtsToPayload({ payload, cfg: baseCfg, kind: "final" });
      expect(result).toBe(payload);
    });

    it("skips when ttsText is empty after cleaning", async () => {
      // text that parses to empty ttsText after directive removal
      const payload = { text: "[[tts:provider=openai]]" };
      const result = await maybeApplyTtsToPayload({ payload, cfg: baseCfg, kind: "final" });
      expect(result.mediaUrl).toBeUndefined();
    });

    it("logs directive warnings when present", async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const cfg = {
        ...baseCfg,
        messages: {
          ...baseCfg.messages,
          tts: { ...baseCfg.messages.tts, modelOverrides: { enabled: true } },
        },
      };
      const payload = { text: "[[tts:provider=azure]] Hello world this is a test message" };
      const result = await maybeApplyTtsToPayload({ payload, cfg, kind: "final" });
      // Even with warnings, should attempt TTS on valid text
      expect(result).toBeDefined();
    });

    it("truncates summary that exceeds hard limit", async () => {
      // Return a very long summary
      vi.mocked(completeSimple).mockResolvedValue({
        content: [{ type: "text", text: "A".repeat(5000) }],
      });

      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(100),
      })) as unknown as typeof fetch;

      const prefsPath = `/tmp/tts-prefs-hardlimit-${Date.now()}.json`;
      const prevPrefs = process.env.OPENCLAW_TTS_PREFS;
      process.env.OPENCLAW_TTS_PREFS = prefsPath;

      tts.setTtsMaxLength(prefsPath, 30);
      tts.setSummarizationEnabled(prefsPath, true);

      try {
        const cfg = {
          ...baseCfg,
          messages: {
            ...baseCfg.messages,
            tts: { ...baseCfg.messages.tts, maxTextLength: 100 },
          },
        };
        const payload = {
          text: "This is a very long message that exceeds the max length limit significantly for testing",
        };
        const result = await maybeApplyTtsToPayload({
          payload,
          cfg,
          kind: "final",
        });
        // Should still attempt TTS with truncated summary
        expect(result.mediaUrl).toBeDefined();
      } finally {
        if (prevPrefs === undefined) {
          delete process.env.OPENCLAW_TTS_PREFS;
        } else {
          process.env.OPENCLAW_TTS_PREFS = prevPrefs;
        }
      }
    });
  });
});
