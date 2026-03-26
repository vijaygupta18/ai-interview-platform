import { NextResponse } from "next/server";
import { getInterview, updateInterview } from "@/lib/store";
import { generateScorecard } from "@/lib/ai";
import { startScoring, completeScoring, failScoring, getScoringStatus } from "@/lib/scoring-tracker";

function normalizeScorecard(raw: any) {
  // Transform AI output into the format the review page expects
  const scores = [
    { dimension: "Technical Depth", score: raw.technicalDepth ?? raw.technical_depth ?? 3 },
    { dimension: "Communication", score: raw.communication ?? 3 },
    { dimension: "Problem Solving", score: raw.problemSolving ?? raw.problem_solving ?? 3 },
    { dimension: "Domain Knowledge", score: raw.domainKnowledge ?? raw.domain_knowledge ?? 3 },
    { dimension: "Culture Fit", score: raw.cultureFit ?? raw.culture_fit ?? 3 },
  ];

  return {
    scores,
    overall: raw.overall ?? 3,
    recommendation: raw.recommendation ?? "no_hire",
    overallAssessment: raw.summary ?? raw.overallAssessment ?? "No assessment available.",
    strengths: raw.strengths ?? [],
    weaknesses: raw.weaknesses ?? [],
    evidence: (raw.evidence ?? []).map((e: any) => ({
      dimension: e.dimension ?? "",
      quote: e.quote ?? "",
      assessment: e.assessment ?? "",
    })),
    proctoringNotes: raw.proctoringNotes ?? raw.proctoring_notes ?? "No issues detected.",
  };
}

export async function POST(req: Request) {
  try {
    const { interviewId } = await req.json();

    if (!interviewId) {
      return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });
    }

    // Check if already being scored (DB-backed, survives restarts)
    const status = await getScoringStatus(interviewId);
    if (status.status === "generating") {
      return NextResponse.json({ error: "Scorecard is already being generated", status: "generating" }, { status: 409 });
    }

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
    const interviewId = (await req.clone().json().catch(() => ({}))).interviewId;
    if (interviewId) await failScoring(interviewId, (error as Error).message);
    console.error("Scorecard generation error:", error);
    return NextResponse.json({ error: "Failed to generate scorecard" }, { status: 500 });
  }
}
