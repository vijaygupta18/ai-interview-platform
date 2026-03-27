import type { TTSProvider } from "./types";

export class DeepgramTTS implements TTSProvider {
  name = "deepgram";
  contentType = "audio/mpeg";

  async synthesize(text: string): Promise<Buffer> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error("DEEPGRAM_API_KEY not configured");
    if (!text || !text.trim()) throw new Error("Empty text for TTS");

    const res = await fetch("https://api.deepgram.com/v1/speak?model=aura-angus-en", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: text.trim() }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Deepgram TTS error: ${res.status} ${errBody.substring(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
