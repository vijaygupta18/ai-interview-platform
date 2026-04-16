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
 * Compute overall as a simple average.
 * - cultureFit >= 3 → (tech + comm + prob + domain) / 4   (excluded)
 * - cultureFit <  3 → (tech + comm + prob + domain + culture) / 5   (included as penalty)
 */
export function calculateOverall(scores: DimScores, _role: string): number {
  const otherSum = scores.technicalDepth + scores.communication + scores.problemSolving + scores.domainKnowledge;
  const overall = scores.cultureFit >= 3
    ? otherSum / 4
    : (otherSum + scores.cultureFit) / 5;
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

  // hire: overall >= threshold AND each dim meets its specific minimum
  const m = t.hireMinDims;
  if (
    overall >= t.hireOverall &&
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
