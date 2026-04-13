import { NextResponse } from "next/server";
import { getInterview, updateInterview } from "@/lib/store";
import { generateScorecard } from "@/lib/ai";
import { startScoring, completeScoring, failScoring } from "@/lib/scoring-tracker";
import { normalizeScorecard } from "@/lib/normalize-scorecard";
import { parseScorecardJSON } from "@/lib/parse-scorecard";
import { validateAccess } from "@/lib/auth-check";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Try session-based auth first, then token from body
  let { authorized } = await validateAccess(req, id);
  if (!authorized) {
    try {
      const body = await req.json().catch(() => ({} as any));
      if (body?.token) {
        const { validateAccessPost } = await import("@/lib/auth-check");
        authorized = await validateAccessPost(id, body.token);
      }
    } catch {}
  }
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  // Log who's calling this — helps debug the "refresh completes interview" issue
  const caller = req.headers.get("referer") || "unknown";
  const ua = req.headers.get("user-agent")?.substring(0, 40) || "unknown";
  console.log(`[Interview/end] ${id} called from referer=${caller} ua=${ua} currentStatus=${interview.status}`);

  if (interview.status === "completed") {
    return NextResponse.json({ error: "Interview already completed" }, { status: 400 });
  }

  // Mark as completed
  await updateInterview(id, {
    status: "completed",
    endedAt: new Date().toISOString(),
  });

  // Return immediately — candidate doesn't wait
  const response = NextResponse.json({ ok: true });

  // Auto-generate scorecard in background after 3s delay
  setTimeout(async () => {
    try {
      const freshInterview = await getInterview(id);
      if (freshInterview && freshInterview.transcript.length > 0 && !freshInterview.scorecard) {
        generateScorecardInBackground(id, freshInterview);
      }
    } catch (err) {
      console.error(`[Auto-Score] Failed to fetch interview ${id}:`, err);
    }
  }, 3000);

  return response;
}

async function generateScorecardInBackground(id: string, interview: any) {
  // Check if already being scored
  if (!(await startScoring(id))) return;

  try {
    console.log(`[Auto-Score] Generating scorecard for interview ${id}...`);
    const scorecardRaw = await generateScorecard(interview);
    const parsed = parseScorecardJSON(scorecardRaw);
    const scorecard = normalizeScorecard(parsed);

    await updateInterview(id, { scorecard });
    completeScoring(id);
    console.log(`[Auto-Score] Scorecard saved for interview ${id}`);

    // Send email notification to interviewer
    try {
      const { pool } = await import("@/lib/db");
      const { sendInterviewComplete } = await import("@/lib/email");
      const { rows: userRows } = await pool.query(
        "SELECT u.email, u.name FROM users u JOIN interviews i ON u.id = i.created_by WHERE i.id = $1",
        [id]
      );
      if (userRows.length > 0 && userRows[0].email) {
        const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL}/review/${id}`;
        const candidateLabel = interview.candidateName || interview.candidateEmail || "A candidate";
        await sendInterviewComplete(
          userRows[0].email,
          userRows[0].name || "",
          candidateLabel,
          reviewUrl
        );
      }
    } catch (emailErr) {
      console.error("[Auto-Score] Failed to send notification email:", emailErr);
    }
  } catch (err) {
    failScoring(id, (err as Error).message);
    console.error(`[Auto-Score] Failed for interview ${id}:`, err);
  }
}
