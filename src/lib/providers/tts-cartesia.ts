import type { TTSProvider } from "./types";

export class CartesiaTTS implements TTSProvider {
  name = "cartesia";
  contentType = "audio/wav";

  async synthesize(text: string): Promise<Buffer> {
    const apiKey = process.env.CARTESIA_API_KEY;
    if (!apiKey) throw new Error("CARTESIA_API_KEY not configured");

    const voiceId = process.env.CARTESIA_VOICE_ID || "f6141af3-5f94-418c-80ed-a45d450e7e2e"; // Priya - Trusted Operator (Indian female)
    const model = process.env.CARTESIA_MODEL || "sonic-2";
    const speed = parseFloat(process.env.CARTESIA_SPEED || "1.0");
    const language = process.env.CARTESIA_LANGUAGE || "en";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Cartesia-Version": "2024-11-13",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: model,
          transcript: text,
          voice: { mode: "id", id: voiceId, __experimental_controls: { speed } },
          output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 24000 },
          language,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Cartesia TTS error: ${res.status} ${err.substring(0, 200)}`);
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer());
      return audioBuffer;
    } finally {
      clearTimeout(timeout);
    }
  }
}
