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
        pace: parseFloat(process.env.SARVAM_PACE || "1.2"),
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
    if (!text || text.length <= maxLen) return [text || ""];
    // Split on sentence boundaries OR at maxLen if no punctuation
    const sentences = text.match(/[^.!?]*[.!?]+\s*/g);
    if (!sentences) {
      // No punctuation — split at word boundaries near maxLen
      const chunks: string[] = [];
      let start = 0;
      while (start < text.length) {
        if (start + maxLen >= text.length) {
          chunks.push(text.substring(start).trim());
          break;
        }
        let end = text.lastIndexOf(" ", start + maxLen);
        if (end <= start) end = start + maxLen;
        chunks.push(text.substring(start, end).trim());
        start = end + 1;
      }
      return chunks.filter(Boolean);
    }
    // Handle trailing text after last punctuation
    const matched = sentences.join("");
    const trailing = text.substring(matched.length).trim();
    const allParts = trailing ? [...sentences, trailing] : sentences;

    const chunks: string[] = [];
    let current = "";
    for (const s of allParts) {
      if ((current + s).length > maxLen && current) {
        chunks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    // Sub-split any chunks still over maxLen
    const result: string[] = [];
    for (const chunk of chunks) {
      if (chunk.length <= maxLen) {
        result.push(chunk);
      } else {
        let start = 0;
        while (start < chunk.length) {
          let end = chunk.lastIndexOf(" ", start + maxLen);
          if (end <= start) end = start + maxLen;
          result.push(chunk.substring(start, end).trim());
          start = end + 1;
        }
      }
    }
    return result.filter(Boolean);
  }
}
