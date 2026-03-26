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

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const cleanedText = stripThinking(text);

    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "No TTS provider configured" }, { status: 500 });
    }

    // Deepgram Aura Angus - Indian English male voice
    const response = await fetch("https://api.deepgram.com/v1/speak?model=aura-angus-en", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: cleanedText }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Deepgram TTS error:", errorText);
      return NextResponse.json({ error: "TTS generation failed" }, { status: 502 });
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json({ error: "Failed to generate speech" }, { status: 500 });
  }
}
