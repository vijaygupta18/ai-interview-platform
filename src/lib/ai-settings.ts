import { pool } from "./db";

export interface AISettings {
  persona: {
    name: string;           // e.g. "Anita"
    tone: "professional" | "warm" | "casual";
  };
  scoring: {
    strongHireOverall: number;   // default 4.2
    strongHireMinDim: number;    // default 3.5 (applies uniformly for strong_hire)
    hireOverall: number;         // default 3.0
    // Per-dimension minimums required to qualify as "hire"
    hireMinDims: {
      technicalDepth: number;
      communication: number;
      problemSolving: number;
      domainKnowledge: number;
      cultureFit: number;
    };
    strongNoHireOverall: number; // default 2.0
  };
  behavior: {
    maxFollowUps: number;         // default 1
    sentencesPerResponse: string; // "1-3"
    allowHints: boolean;          // default false
    customGuidelines: string;     // admin free-form, max 2000 chars
  };
  scorecard: {
    customCriteria: string;       // admin free-form, max 1000 chars
  };
  company: {
    cultureNotes: string;         // admin free-form, max 500 chars
    hiringBar: "strict" | "balanced" | "lenient";
  };
  boundaries: {
    bannedTopics: string[];       // chips
  };
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  persona: { name: "Anita", tone: "professional" },
  scoring: {
    strongHireOverall: 4.2,
    strongHireMinDim: 3.5,
    hireOverall: 3.0,
    hireMinDims: {
      technicalDepth: 3,
      communication: 2,
      problemSolving: 3,
      domainKnowledge: 2,
      cultureFit: 3,
    },
    strongNoHireOverall: 2.0,
  },
  behavior: {
    maxFollowUps: 1,
    sentencesPerResponse: "1-3",
    allowHints: false,
    customGuidelines: "",
  },
  scorecard: { customCriteria: "" },
  company: { cultureNotes: "", hiringBar: "balanced" },
  boundaries: { bannedTopics: [] },
};

/**
 * Reject phrases that would bypass core safety rules.
 * Admin input cannot tell the AI to give hints, reveal answers, or speak other languages.
 */
const DANGEROUS_PHRASES = [
  /give\s+(a\s+)?hint/i,
  /reveal\s+(the\s+)?answer/i,
  /tell\s+them\s+(the\s+)?answer/i,
  /speak\s+(in\s+)?(hindi|chinese|tamil|spanish|french|arabic)/i,
  /respond\s+in\s+(hindi|chinese|tamil|spanish|french|arabic)/i,
  /ignore\s+(previous|above|core)\s+(rules|instructions)/i,
  /disregard\s+(previous|above|core)/i,
  /share\s+(the\s+)?scores?/i,
  /show\s+(the\s+)?scores?/i,
  /tell\s+them\s+their\s+scores?/i,
];

export function validateCustomText(text: string): { ok: boolean; reason?: string } {
  for (const re of DANGEROUS_PHRASES) {
    if (re.test(text)) {
      return { ok: false, reason: `Rejected: contains phrase that would bypass safety rules (matches ${re.source})` };
    }
  }
  return { ok: true };
}

export function mergeSettings(partial: Partial<AISettings> | null | undefined): AISettings {
  const p = partial || {};
  return {
    persona: { ...DEFAULT_AI_SETTINGS.persona, ...(p.persona || {}) },
    scoring: {
      ...DEFAULT_AI_SETTINGS.scoring,
      ...(p.scoring || {}),
      hireMinDims: { ...DEFAULT_AI_SETTINGS.scoring.hireMinDims, ...((p.scoring?.hireMinDims) || {}) },
    },
    behavior: { ...DEFAULT_AI_SETTINGS.behavior, ...(p.behavior || {}) },
    scorecard: { ...DEFAULT_AI_SETTINGS.scorecard, ...(p.scorecard || {}) },
    company: { ...DEFAULT_AI_SETTINGS.company, ...(p.company || {}) },
    boundaries: { ...DEFAULT_AI_SETTINGS.boundaries, ...(p.boundaries || {}) },
  };
}

export async function getOrgAISettings(orgId: string | null | undefined): Promise<AISettings> {
  if (!orgId) return DEFAULT_AI_SETTINGS;
  try {
    const { rows } = await pool.query("SELECT ai_settings FROM organizations WHERE id = $1", [orgId]);
    return mergeSettings(rows[0]?.ai_settings);
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export async function setOrgAISettings(orgId: string, settings: AISettings): Promise<void> {
  await pool.query("UPDATE organizations SET ai_settings = $1 WHERE id = $2", [JSON.stringify(settings), orgId]);
}
