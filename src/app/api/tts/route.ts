import { NextResponse } from "next/server";

function stripThinking(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/<(?:think|thinking|reasoning|thought|internal|plan|meta|scratch|scratchpad)[\s\S]*?<\/(?:think|thinking|reasoning|thought|internal|plan|meta|scratch|scratchpad)>/gi, "");
  cleaned = cleaned.replace(/<(?:think|thinking|reasoning|thought)>[\s\S]*/gi, "");
  cleaned = cleaned.replace(/^[\s\S]*?<\/(?:think|thinking|reasoning|thought)>\s*/i, "");
  cleaned = cleaned.replace(/<\/(?:think|thinking|reasoning|thought)>/gi, "");
  cleaned = cleaned.replace(/^(?:The user|Plan:|Key requirements:|Since I|Let me|I need to|I should|I'll|My approach|Step \d|Thinking:|Internal:|Note to self).*$/gm, "");
  cleaned = cleaned.replace(/^#+\s*(?:Plan|Approach|Strategy|Analysis|Thinking|Notes).*$/gm, "");
  cleaned = cleaned.replace(/^\d+\.\s*(?:First|Then|Next|Finally|After that).*$/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || text.trim();
}

// Edge TTS via CLI — free, Indian female voice
async function edgeTTS(text: string): Promise<Buffer | null> {
  try {
    const { execSync } = await import("child_process");
    const fs = await import("fs");
    const path = await import("path");

    const tmpFile = path.join(process.cwd(), `_tts_${Date.now()}.mp3`);
    const safeText = text.replace(/'/g, "'\\''");
    const voice = process.env.EDGE_TTS_VOICE || "en-IN-NeerjaNeural";
    const rate = process.env.EDGE_TTS_RATE || "+10%";

    execSync(
      `edge-tts --voice "${voice}" --rate="${rate}" --pitch="-2Hz" --text '${safeText}' --write-media "${tmpFile}"`,
      { timeout: 15000, stdio: "pipe" }
    );

    const audioBuffer = fs.readFileSync(tmpFile);
    fs.unlinkSync(tmpFile);
    return audioBuffer;
  } catch (err) {
    console.warn("Edge TTS failed:", (err as Error).message);
    return null;
  }
}

// Deepgram Aura — reliable, Indian English male
async function deepgramTTS(text: string): Promise<Buffer | null> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.deepgram.com/v1/speak?model=aura-angus-en", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      console.error("Deepgram TTS error:", await response.text());
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    console.error("Deepgram TTS failed:", err);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const cleanedText = stripThinking(text);

    let audioBuffer: Buffer | null = null;

    // TTS_PROVIDER env var controls which provider to use
    // "edge" = Edge TTS (free Indian female), "deepgram" = Deepgram Angus (default)
    const provider = process.env.TTS_PROVIDER || "deepgram";

    if (provider === "edge") {
      audioBuffer = await edgeTTS(cleanedText);
      // Fallback to deepgram if edge fails
      if (!audioBuffer) audioBuffer = await deepgramTTS(cleanedText);
    } else {
      audioBuffer = await deepgramTTS(cleanedText);
      // Fallback to edge if deepgram fails
      if (!audioBuffer) audioBuffer = await edgeTTS(cleanedText);
    }

    if (!audioBuffer) {
      return NextResponse.json({ error: "All TTS providers failed" }, { status: 502 });
    }

    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json({ error: "Failed to generate speech" }, { status: 500 });
  }
}
