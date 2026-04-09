import type { TTSProvider, STTConfig } from "./types";

let ttsInstance: TTSProvider | null = null;

export function getTTSProvider(): TTSProvider {
  if (ttsInstance) return ttsInstance;

  const provider = process.env.TTS_PROVIDER || "deepgram";

  switch (provider) {
    case "sarvam": {
      const { SarvamTTS } = require("./tts-sarvam");
      ttsInstance = new SarvamTTS();
      break;
    }
    case "edge": {
      const { EdgeTTS } = require("./tts-edge");
      ttsInstance = new EdgeTTS();
      break;
    }
    default: {
      const { DeepgramTTS } = require("./tts-deepgram");
      ttsInstance = new DeepgramTTS();
      break;
    }
  }

  return ttsInstance!;
}

export function getSTTConfig(): STTConfig {
  const provider = process.env.STT_PROVIDER || "deepgram";
  const language = process.env.STT_LANGUAGE || "en-IN";

  if (provider === "sarvam") {
    const apiKey = process.env.SARVAM_API_KEY || "";
    return {
      provider: "sarvam",
      language,
      wsUrl: `wss://api.sarvam.ai/speech-to-text-streaming/transcribe/ws?api_subscription_key=${apiKey}&language_code=${language}&model=saaras:v3`,
      headers: {},
      params: { language_code: language, model: "saaras:v3" },
    };
  }

  // Default: Deepgram
  const apiKey = process.env.DEEPGRAM_API_KEY || "";
  return {
    provider: "deepgram",
    language,
    wsUrl: `wss://api.deepgram.com/v1/listen?model=nova-3&language=${language}&punctuate=true&interim_results=true&endpointing=800&vad_events=true&diarize=true`,
    headers: { Authorization: `Token ${apiKey}` },
    params: {},
  };
}
