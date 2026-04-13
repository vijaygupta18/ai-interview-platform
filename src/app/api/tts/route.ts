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

    // Strip thinking tags, then remove non-English Unicode (MiniMax leaks CJK chars)
    const cleanedText = stripThinking(text).replace(/[^\x20-\x7E\u00C0-\u024F]/g, " ").replace(/\s{2,}/g, " ").trim();
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
