import { NextResponse } from "next/server";
import { getInterview, updateInterview } from "@/lib/store";
import { generateScorecard } from "@/lib/ai";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  // Mark as completed
  await updateInterview(id, {
    status: "completed",
    endedAt: new Date().toISOString(),
  });

  // Auto-generate scorecard in background if transcript exists
  if (interview.transcript.length > 0 && !interview.scorecard) {
    generateScorecardInBackground(id, interview);
  }

  return NextResponse.json({ ok: true });
}

async function generateScorecardInBackground(id: string, interview: any) {
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

    // Normalize to expected format
    const scorecard = {
      scores: [
        { dimension: "Technical Depth", score: parsed.technicalDepth ?? parsed.technical_depth ?? 3 },
        { dimension: "Communication", score: parsed.communication ?? 3 },
        { dimension: "Problem Solving", score: parsed.problemSolving ?? parsed.problem_solving ?? 3 },
        { dimension: "Domain Knowledge", score: parsed.domainKnowledge ?? parsed.domain_knowledge ?? 3 },
        { dimension: "Culture Fit", score: parsed.cultureFit ?? parsed.culture_fit ?? 3 },
      ],
      overall: parsed.overall ?? 3,
      recommendation: parsed.recommendation ?? "no_hire",
      overallAssessment: parsed.summary ?? parsed.overallAssessment ?? "No assessment available.",
      strengths: parsed.strengths ?? [],
      weaknesses: parsed.weaknesses ?? [],
      evidence: (parsed.evidence ?? []).map((e: any) => ({
        dimension: e.dimension ?? "",
        quote: e.quote ?? "",
        assessment: e.assessment ?? "",
      })),
      proctoringNotes: parsed.proctoringNotes ?? "No issues detected.",
    };

    await updateInterview(id, { scorecard });
    console.log(`[Auto-Score] Scorecard saved for interview ${id}`);
  } catch (err) {
    console.error(`[Auto-Score] Failed for interview ${id}:`, err);
  }
}
