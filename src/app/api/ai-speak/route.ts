import { NextResponse } from "next/server";
import { getInterview, addTranscriptEntry } from "@/lib/store";
import { getAIResponse } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";
import { validateAccessPost } from "@/lib/auth-check";

// Combined AI response + TTS in ONE endpoint
// Returns audio directly — no separate TTS call needed
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { interviewId, transcript, token } = await req.json();

    if (!interviewId) {
      return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });
    }

    if (!(await validateAccessPost(interviewId, token))) {
      return NextResponse.json({ error: "Invalid interview" }, { status: 403 });
    }

    const interview = await getInterview(interviewId);
    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Save candidate message
    if (transcript?.length > 0) {
      const lastEntry = transcript[transcript.length - 1];
      if (lastEntry.role === "candidate" && lastEntry.text) {
        await addTranscriptEntry(interviewId, {
          role: "candidate",
          text: lastEntry.text,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Get AI response
    const aiText = await getAIResponse(interview, transcript ?? interview.transcript);

    // Save AI message
    await addTranscriptEntry(interviewId, {
      role: "ai",
      text: aiText,
      timestamp: new Date().toISOString(),
    });

    // Generate TTS audio using the same logic as /api/tts
    const { stripThinking } = await import("@/lib/ai");
    const cleanedText = stripThinking(aiText);

    let audioBuffer: ArrayBuffer | null = null;
    const provider = process.env.TTS_PROVIDER || "deepgram";

    // Try Edge TTS first if configured
    if (provider === "edge") {
      try {
        const { execFileSync } = await import("child_process");
        const fs = await import("fs");
        const path = await import("path");
        const tmpFile = path.join("/tmp", `_tts_${Date.now()}.mp3`);
        const voice = process.env.EDGE_TTS_VOICE || "en-IN-NeerjaNeural";
        const rate = process.env.EDGE_TTS_RATE || "+15%";
        execFileSync("edge-tts", ["--voice", voice, "--rate", rate, "--pitch=-6Hz", "--text", cleanedText, "--write-media", tmpFile], { timeout: 15000, stdio: "pipe" });
        const buf = fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        audioBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      } catch (err) {
        console.warn("Edge TTS failed in ai-speak:", (err as Error).message);
      }
    }

    // Fallback to Deepgram
    if (!audioBuffer) {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      if (apiKey) {
        const ttsRes = await fetch("https://api.deepgram.com/v1/speak?model=aura-angus-en", {
          method: "POST",
          headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanedText }),
        });
        if (ttsRes.ok) audioBuffer = await ttsRes.arrayBuffer();
      }
    }

    if (!audioBuffer) {
      return NextResponse.json({ text: aiText, audio: false });
    }

    // Return both text and audio in one response
    // Text in header, audio in body
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-AI-Text": encodeURIComponent(aiText),
      },
    });
  } catch (error) {
    console.error("AI speak error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
