import type { AISettings } from "./ai-settings";

export interface DimScores {
  technicalDepth: number;
  communication: number;
  problemSolving: number;
  domainKnowledge: number;
  cultureFit: number;
}

/** Role-weighted dimension importance (sums to 1.0). */
export function getRoleWeights(role: string): DimScores {
  const r = role.toLowerCase();
  if (/sde|engineer|developer|backend|frontend|fullstack/.test(r))
    return { technicalDepth: 0.35, problemSolving: 0.25, domainKnowledge: 0.20, communication: 0.10, cultureFit: 0.10 };
  if (/product|pm/.test(r))
    return { problemSolving: 0.25, communication: 0.25, domainKnowledge: 0.20, technicalDepth: 0.15, cultureFit: 0.15 };
  if (/sales|bd/.test(r))
    return { communication: 0.35, domainKnowledge: 0.20, cultureFit: 0.20, problemSolving: 0.15, technicalDepth: 0.10 };
  if (/hr|human resource/.test(r))
    return { communication: 0.30, cultureFit: 0.25, domainKnowledge: 0.20, problemSolving: 0.15, technicalDepth: 0.10 };
  if (/design|ux/.test(r))
    return { domainKnowledge: 0.30, problemSolving: 0.25, communication: 0.20, technicalDepth: 0.15, cultureFit: 0.10 };
  if (/data|analyst/.test(r))
    return { technicalDepth: 0.30, domainKnowledge: 0.25, problemSolving: 0.25, communication: 0.10, cultureFit: 0.10 };
  if (/manager|director|lead|head|ceo|cto/.test(r))
    return { communication: 0.25, problemSolving: 0.25, cultureFit: 0.20, domainKnowledge: 0.20, technicalDepth: 0.10 };
  if (/ops|operations/.test(r))
    return { problemSolving: 0.30, domainKnowledge: 0.25, communication: 0.20, technicalDepth: 0.15, cultureFit: 0.10 };
  return { technicalDepth: 0.25, communication: 0.20, problemSolving: 0.20, domainKnowledge: 0.20, cultureFit: 0.15 };
}

/**
 * Compute overall score from per-dim scores.
 * Asymmetric culture-fit rule: if cultureFit > 3, exclude it and redistribute its weight across the other 4 dims.
 * Otherwise include normally.
 */
export function calculateOverall(scores: DimScores, role: string): number {
  const w = getRoleWeights(role);

  // Asymmetric: if cultureFit is acceptable (>= 3), exclude it from average.
  // Only count cultureFit when it's a problem (< 3, i.e. 1 or 2).
  if (scores.cultureFit >= 3) {
    const remaining = 1 - w.cultureFit;
    if (remaining <= 0) return scores.cultureFit; // edge case
    const scale = 1 / remaining;
    const overall =
      scores.technicalDepth * (w.technicalDepth * scale) +
      scores.communication * (w.communication * scale) +
      scores.problemSolving * (w.problemSolving * scale) +
      scores.domainKnowledge * (w.domainKnowledge * scale);
    return Math.round(overall * 100) / 100;
  }

  const overall =
    scores.technicalDepth * w.technicalDepth +
    scores.communication * w.communication +
    scores.problemSolving * w.problemSolving +
    scores.domainKnowledge * w.domainKnowledge +
    scores.cultureFit * w.cultureFit;
  return Math.round(overall * 100) / 100;
}

/** Determine recommendation based on org settings + computed overall + per-dim scores. */
export function calculateRecommendation(
  overall: number,
  scores: DimScores,
  settings: AISettings
): "strong_hire" | "hire" | "no_hire" | "strong_no_hire" {
  const t = settings.scoring;
  const allDims: number[] = [
    scores.technicalDepth, scores.communication, scores.problemSolving,
    scores.domainKnowledge, scores.cultureFit,
  ];

  // strong_hire: high overall + all dims meet uniform min
  if (overall >= t.strongHireOverall && allDims.every((s) => s >= t.strongHireMinDim)) {
    return "strong_hire";
  }

  // hire: overall > threshold AND each dim meets its specific minimum
  const m = t.hireMinDims;
  if (
    overall > t.hireOverall &&
    scores.technicalDepth >= m.technicalDepth &&
    scores.communication >= m.communication &&
    scores.problemSolving >= m.problemSolving &&
    scores.domainKnowledge >= m.domainKnowledge &&
    scores.cultureFit >= m.cultureFit
  ) {
    return "hire";
  }

  // strong_no_hire
  if (overall < t.strongNoHireOverall) return "strong_no_hire";

  return "no_hire";
}
