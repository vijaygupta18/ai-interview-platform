import { NextResponse } from "next/server";
import { stripThinking } from "@/lib/ai";
import { getTTSProvider } from "@/lib/providers";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const cleanedText = stripThinking(text);
    const ttsProvider = getTTSProvider();
    const audioBuffer = await ttsProvider.synthesize(cleanedText);

    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: { "Content-Type": ttsProvider.contentType },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json({ error: "Failed to generate speech" }, { status: 500 });
  }
}
