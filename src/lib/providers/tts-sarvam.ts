import type { TTSProvider } from "./types";

export class SarvamTTS implements TTSProvider {
  name = "sarvam";
  contentType = "audio/wav";

  async synthesize(text: string): Promise<Buffer> {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) throw new Error("SARVAM_API_KEY not configured");

    // Sarvam has 500 char limit per input — split into chunks by sentence
    const chunks = this.splitText(text, 490);

    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: chunks,
        target_language_code: process.env.SARVAM_LANGUAGE || "en-IN",
        speaker: process.env.SARVAM_SPEAKER || "priya",
        model: "bulbul:v3",
        pace: parseFloat(process.env.SARVAM_PACE || "1.1"),
      }),
    });

    if (!res.ok) throw new Error(`Sarvam TTS error: ${res.status}`);
    const data = await res.json();

    // Sarvam returns array of base64 audio chunks — decode and concatenate
    if (!data.audios || data.audios.length === 0) throw new Error("No audio from Sarvam");

    const buffers = data.audios.map((b64: string) => Buffer.from(b64, "base64"));
    return Buffer.concat(buffers);
  }

  private splitText(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let current = "";
    for (const s of sentences) {
      if ((current + s).length > maxLen && current) {
        chunks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }
}
