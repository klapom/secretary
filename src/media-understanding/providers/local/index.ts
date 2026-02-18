import { localTranscribe } from "../../../services/local-voice.js";
import type { MediaUnderstandingProvider } from "../../types.js";

export const localProvider: MediaUnderstandingProvider = {
  id: "local",
  capabilities: ["audio"],
  transcribeAudio: async (req) => {
    const result = await localTranscribe(req.buffer, {
      url: req.baseUrl,
      language: req.language,
      timeoutMs: req.timeoutMs,
    });
    return { text: result.text };
  },
};
