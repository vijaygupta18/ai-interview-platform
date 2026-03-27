import { NextResponse } from "next/server";
import { getInterview, addTranscriptEntry, getProctoringViolationCount, updateInterview, addProctoringEvent } from "@/lib/store";
import { getAIResponse, stripThinking } from "@/lib/ai";
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

    // Auth gate (must be first)
    if (!(await validateAccessPost(interviewId, token))) {
      return NextResponse.json({ error: "Invalid interview" }, { status: 403 });
    }

    // Parallel: interview data + violation count + heartbeat
    const [interview, violations, hbResult] = await Promise.all([
      getInterview(interviewId),
      getProctoringViolationCount(interviewId),
      pool.query("SELECT last_heartbeat_at FROM interviews WHERE id = $1", [interviewId]),
    ]);

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    // Server-side proctoring enforcement
    const MAX_STRIKES = parseInt(process.env.NEXT_PUBLIC_MAX_PROCTORING_STRIKES || "100");
    if (violations >= MAX_STRIKES) {
      await updateInterview(interviewId, { status: "completed", endedAt: new Date().toISOString() });
      return NextResponse.json({ error: "Interview terminated due to proctoring violations" }, { status: 403 });
    }

    // Heartbeat check (fire-and-forget)
    const hbRows = hbResult.rows;
    if (hbRows.length > 0 && hbRows[0].last_heartbeat_at) {
      const elapsed = Date.now() - new Date(hbRows[0].last_heartbeat_at).getTime();
      if (elapsed > 45000) {
        addProctoringEvent(interviewId, {
          type: "heartbeat_missing",
          severity: "flag",
          message: `No proctoring heartbeat for ${Math.round(elapsed / 1000)}s`,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    // Save candidate message (fire-and-forget — don't block AI call)
    if (!skipSave && transcript?.length > 0) {
      const lastEntry = transcript[transcript.length - 1];
      if (lastEntry.role === "candidate" && lastEntry.text) {
        addTranscriptEntry(interviewId, {
          role: "candidate",
          text: lastEntry.text,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    // Get AI response
    const aiText = await getAIResponse(interview, transcript ?? interview.transcript);

    const cleanedText = stripThinking(aiText);
    // Clean for TTS — remove special chars that TTS speaks literally
    const ttsText = cleanedText
      .replace(/[*#_~`|<>{}[\]\\]/g, "")
      .replace(/\bhttps?:\/\/\S+/g, "")
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    try {
      const ttsProvider = getTTSProvider();

      // Parallelize TTS generation + AI transcript save
      const [audioBuffer] = await Promise.all([
        ttsProvider.synthesize(ttsText || cleanedText),
        addTranscriptEntry(interviewId, { role: "ai", text: aiText, timestamp: new Date().toISOString() }),
      ]);

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
