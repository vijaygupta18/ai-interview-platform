import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getOrgAISettings,
  setOrgAISettings,
  mergeSettings,
  validateCustomText,
  DEFAULT_AI_SETTINGS,
  AISettings,
} from "@/lib/ai-settings";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = (session.user as any).orgId;
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const settings = await getOrgAISettings(orgId);
  return NextResponse.json({ settings, defaults: DEFAULT_AI_SETTINGS });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = (session.user as any).orgId;
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const merged = mergeSettings(body);

  // Input validation
  const errors: string[] = [];

  // Bounds check on scoring thresholds
  const s = merged.scoring;
  if (s.strongHireOverall < s.hireOverall) errors.push("strong_hire threshold must be >= hire threshold");
  if (s.hireOverall < s.strongNoHireOverall) errors.push("hire threshold must be >= strong_no_hire threshold");
  if (s.strongHireOverall > 5 || s.hireOverall > 5) errors.push("thresholds cannot exceed 5");
  if (s.strongNoHireOverall < 1) errors.push("strong_no_hire threshold cannot be below 1");

  // Text length limits
  if (merged.behavior.customGuidelines.length > 2000) errors.push("custom guidelines > 2000 chars");
  if (merged.scorecard.customCriteria.length > 1000) errors.push("scorecard criteria > 1000 chars");
  if (merged.company.cultureNotes.length > 500) errors.push("culture notes > 500 chars");

  // Safety validation on free-form text
  for (const [field, text] of [
    ["interviewer guidelines", merged.behavior.customGuidelines],
    ["scorecard criteria", merged.scorecard.customCriteria],
    ["culture notes", merged.company.cultureNotes],
  ] as const) {
    const v = validateCustomText(text);
    if (!v.ok) errors.push(`${field}: ${v.reason}`);
  }

  // Persona name sanity
  if (!merged.persona.name || merged.persona.name.length > 40) errors.push("persona name must be 1-40 chars");

  if (errors.length) return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 });

  await setOrgAISettings(orgId, merged);
  return NextResponse.json({ ok: true, settings: merged });
}
