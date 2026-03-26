import { NextResponse } from "next/server";
import { getInterview, updateInterview } from "@/lib/store";
import { generateScorecard } from "@/lib/ai";
import { startScoring, completeScoring, failScoring } from "@/lib/scoring-tracker";
import { normalizeScorecard } from "@/lib/normalize-scorecard";

export async function POST(req: Request) {
  try {
    const { interviewId } = await req.json();

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

    // Try to extract JSON from the response (might have extra text around it)
    let parsed;
    try {
      parsed = JSON.parse(scorecardRaw);
    } catch {
      const jsonMatch = scorecardRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse scorecard JSON");
      }
    }

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
    try {
      const interviewId = (await req.clone().json().catch(() => ({}))).interviewId;
      if (interviewId) await failScoring(interviewId, (error as Error).message);
    } catch (failErr) {
      console.error("Failed to mark scoring as failed:", failErr);
    }
    return NextResponse.json({ error: "Failed to generate scorecard" }, { status: 500 });
  }
}
