import type { TTSProvider } from "./types";

export class DeepgramTTS implements TTSProvider {
  name = "deepgram";
  contentType = "audio/mpeg";

  async synthesize(text: string): Promise<Buffer> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error("DEEPGRAM_API_KEY not configured");
    if (!text || !text.trim()) throw new Error("Empty text for TTS");

    // 15s hard timeout — without this, if Deepgram is slow/hung, the entire
    // streaming pipeline hangs forever and the client safety timeout fires at 30s.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("https://api.deepgram.com/v1/speak?model=aura-angus-en", {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text.trim() }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Deepgram TTS error: ${res.status} ${errBody.substring(0, 200)}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }
}
