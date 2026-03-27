import { NextResponse } from "next/server";
import { getInterview, updateInterview } from "@/lib/store";
import { generateScorecard } from "@/lib/ai";
import { startScoring, completeScoring, failScoring } from "@/lib/scoring-tracker";
import { normalizeScorecard } from "@/lib/normalize-scorecard";
import { validateAccess } from "@/lib/auth-check";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { authorized } = await validateAccess(req, id);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
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

    let parsed;
    try {
      parsed = JSON.parse(scorecardRaw);
    } catch {
      // Try to extract JSON from response
      const jsonMatch = scorecardRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // Try fixing common JSON issues: trailing commas, truncated arrays
          let fixed = jsonMatch[0]
            .replace(/,\s*}/g, "}")     // trailing comma before }
            .replace(/,\s*]/g, "]")     // trailing comma before ]
            .replace(/\.\.\./g, "")     // literal ...
            .replace(/,\s*$/, "");      // trailing comma at end
          // If JSON is truncated, try to close it
          const openBraces = (fixed.match(/{/g) || []).length;
          const closeBraces = (fixed.match(/}/g) || []).length;
          const openBrackets = (fixed.match(/\[/g) || []).length;
          const closeBrackets = (fixed.match(/]/g) || []).length;
          for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += "]";
          for (let i = 0; i < openBraces - closeBraces; i++) fixed += "}";
          parsed = JSON.parse(fixed);
        }
      } else {
        throw new Error("Could not parse scorecard JSON from: " + scorecardRaw.substring(0, 200));
      }
    }

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
