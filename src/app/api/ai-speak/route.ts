import { NextResponse } from "next/server";
import { getInterview, addTranscriptEntry, getProctoringViolationCount, updateInterview } from "@/lib/store";
import { getAIResponse } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";
import { validateAccessPost } from "@/lib/auth-check";
import { pool } from "@/lib/db";
import { getTTSProvider } from "@/lib/providers";

// Combined AI response + TTS in ONE endpoint
// Returns audio directly — no separate TTS call needed
export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!rateLimit(ip, 30, 60000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { interviewId, transcript, token, skipSave } = await req.json();

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

    // Server-side proctoring enforcement
    const MAX_STRIKES = parseInt(process.env.NEXT_PUBLIC_MAX_PROCTORING_STRIKES || "10");
    const violations = await getProctoringViolationCount(interviewId);
    if (violations >= MAX_STRIKES) {
      await updateInterview(interviewId, { status: "completed", endedAt: new Date().toISOString() });
      return NextResponse.json({ error: "Interview terminated due to proctoring violations" }, { status: 403 });
    }

    // Check proctoring heartbeat — flag if no heartbeat for >45s
    const { rows: hbRows } = await pool.query(
      "SELECT last_heartbeat_at FROM interviews WHERE id = $1",
      [interviewId]
    );
    if (hbRows.length > 0 && hbRows[0].last_heartbeat_at) {
      const lastHb = new Date(hbRows[0].last_heartbeat_at).getTime();
      const elapsed = Date.now() - lastHb;
      if (elapsed > 45000) {
        // Heartbeat missing — proctoring may be disabled, log it
        const { addProctoringEvent } = await import("@/lib/store");
        await addProctoringEvent(interviewId, {
          type: "heartbeat_missing",
          severity: "flag",
          message: `No proctoring heartbeat for ${Math.round(elapsed / 1000)}s`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Save candidate message (skip for watchdog-triggered calls to avoid polluting transcript)
    if (!skipSave && transcript?.length > 0) {
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

    // Generate TTS audio via provider abstraction
    const { stripThinking } = await import("@/lib/ai");
    const cleanedText = stripThinking(aiText);

    try {
      const ttsProvider = getTTSProvider();
      const audioBuffer = await ttsProvider.synthesize(cleanedText);
      const audioBase64 = audioBuffer.toString("base64");

      return NextResponse.json({
        audio: audioBase64,
        text: aiText,
        contentType: ttsProvider.contentType,
      });
    } catch (err) {
      console.warn("TTS failed:", (err as Error).message);
      return NextResponse.json({ text: aiText, audio: null, contentType: null });
    }
  } catch (error) {
    console.error("AI speak error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
