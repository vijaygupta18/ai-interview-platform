import { NextResponse } from "next/server";
import { stripThinking } from "@/lib/ai";
import { getTTSProvider } from "@/lib/providers";
import { validateAccessPost } from "@/lib/auth-check";

export async function POST(req: Request) {
  try {
    const { text, interviewId, token } = await req.json();

    if (interviewId && token) {
      if (!(await validateAccessPost(interviewId, token))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const cleanedText = stripThinking(text);
    const ttsProvider = getTTSProvider();
    const audioBuffer = await ttsProvider.synthesize(cleanedText);

    return NextResponse.json({
      audio: audioBuffer.toString("base64"),
      contentType: ttsProvider.contentType,
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json({ error: "Failed to generate speech" }, { status: 500 });
  }
}
