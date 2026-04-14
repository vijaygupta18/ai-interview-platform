import type { TTSProvider } from "./types";

// Simple semaphore — Creator tier allows 5 concurrent, leave headroom
const MAX_CONCURRENT = parseInt(process.env.ELEVENLABS_MAX_CONCURRENT || "4");
let active = 0;
const queue: (() => void)[] = [];
async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) { active++; return; }
  return new Promise((resolve) => queue.push(() => { active++; resolve(); }));
}
function release() {
  active--;
  const next = queue.shift();
  if (next) next();
}

export class ElevenLabsTTS implements TTSProvider {
  name = "elevenlabs";
  contentType = "audio/mpeg";

  async synthesize(text: string): Promise<Buffer> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

    await acquire();
    try {
      return await this._call(text, apiKey);
    } finally {
      release();
    }
  }

  private async _call(text: string, apiKey: string, attempt = 1): Promise<Buffer> {

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "2BJW5coyhAzSr8STdHbE"; // Aditi - Indian English female
    const model = process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5";
    const stability = parseFloat(process.env.ELEVENLABS_STABILITY || "0.5");
    const similarity = parseFloat(process.env.ELEVENLABS_SIMILARITY || "0.75");
    const speed = parseFloat(process.env.ELEVENLABS_SPEED || "1.0");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: {
            stability,
            similarity_boost: similarity,
            style: 0,
            use_speaker_boost: true,
            speed,
          },
        }),
        signal: controller.signal,
      });

      // 409 "already_running" — library voice is being added by a concurrent call.
      // Retry with backoff up to 3 times.
      if (res.status === 409 && attempt < 4) {
        clearTimeout(timeout);
        await new Promise((r) => setTimeout(r, 500 * attempt));
        return this._call(text, apiKey, attempt + 1);
      }

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`ElevenLabs TTS error: ${res.status} ${err.substring(0, 200)}`);
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer());
      return audioBuffer;
    } finally {
      clearTimeout(timeout);
    }
  }
}
