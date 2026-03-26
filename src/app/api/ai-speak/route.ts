import { NextResponse } from "next/server";
import { getInterview, addTranscriptEntry } from "@/lib/store";
import { getAIResponse } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";

// Combined AI response + TTS in ONE endpoint
// Returns audio directly — no separate TTS call needed
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { interviewId, transcript } = await req.json();

    if (!interviewId) {
      return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });
    }

    const interview = await getInterview(interviewId);
    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Save candidate message in background (don't await)
    if (transcript?.length > 0) {
      const lastEntry = transcript[transcript.length - 1];
      if (lastEntry.role === "candidate" && lastEntry.text) {
        addTranscriptEntry(interviewId, {
          role: "candidate",
          text: lastEntry.text,
          timestamp: new Date().toISOString(),
        }).catch(console.error);
      }
    }

    // Get AI response
    const aiText = await getAIResponse(interview, transcript ?? interview.transcript);

    // Save AI message in background (don't await)
    addTranscriptEntry(interviewId, {
      role: "ai",
      text: aiText,
      timestamp: new Date().toISOString(),
    }).catch(console.error);

    // Generate TTS audio
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      // Return text only if no TTS
      return NextResponse.json({ text: aiText, audio: false });
    }

    const ttsRes = await fetch("https://api.deepgram.com/v1/speak?model=aura-angus-en", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: aiText }),
    });

    if (!ttsRes.ok) {
      console.error("TTS failed, returning text only");
      return NextResponse.json({ text: aiText, audio: false });
    }

    const audioBuffer = await ttsRes.arrayBuffer();

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
