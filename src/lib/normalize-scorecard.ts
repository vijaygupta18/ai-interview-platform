export function normalizeScorecard(raw: any) {
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
