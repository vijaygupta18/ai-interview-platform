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
      const jsonMatch = scorecardRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      else throw new Error("Could not parse scorecard JSON");
    }

    const scorecard = normalizeScorecard(parsed);

    await updateInterview(id, { scorecard });
    completeScoring(id);
    console.log(`[Auto-Score] Scorecard saved for interview ${id}`);
  } catch (err) {
    failScoring(id, (err as Error).message);
    console.error(`[Auto-Score] Failed for interview ${id}:`, err);
  }
}
