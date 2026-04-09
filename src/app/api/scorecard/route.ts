import { NextResponse } from "next/server";
import { getInterview, updateInterview } from "@/lib/store";
import { generateScorecard } from "@/lib/ai";
import { startScoring, completeScoring, failScoring } from "@/lib/scoring-tracker";
import { normalizeScorecard } from "@/lib/normalize-scorecard";
import { parseScorecardJSON } from "@/lib/parse-scorecard";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  // Read body ONCE up-front so we can reference interviewId from the catch handler
  // without cloning the request (which throws "unusable" after the body stream is consumed).
  let interviewId: string | undefined;
  try {
    const body = await req.json().catch(() => ({} as any));
    interviewId = body?.interviewId;

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!interviewId) {
      return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });
    }

    // Atomic check-and-set — no separate getScoringStatus needed
    if (!(await startScoring(interviewId))) {
      return NextResponse.json({ error: "Scoring already in progress" }, { status: 409 });
    }

    const interview = await getInterview(interviewId);
    if (!interview) {
      failScoring(interviewId, "Interview not found");
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    const scorecardRaw = await generateScorecard(interview);
    const parsed = parseScorecardJSON(scorecardRaw);
    const scorecard = normalizeScorecard(parsed);

    await updateInterview(interviewId, {
      scorecard,
      status: "completed",
      endedAt: new Date().toISOString(),
    });

    await completeScoring(interviewId);
    return NextResponse.json(scorecard);
  } catch (error) {
    console.error("Scorecard generation error:", error);
    if (interviewId) {
      try { await failScoring(interviewId, (error as Error).message); } catch {}
    }
    return NextResponse.json({ error: "Failed to generate scorecard" }, { status: 500 });
  }
}
