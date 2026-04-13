import { NextResponse } from "next/server";
import { getInterview, getInterviewWithPhotos } from "@/lib/store";
import { validateAccess } from "@/lib/auth-check";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);

  // Share mode: read-only access for completed interviews — strip all PII
  const shareMode = url.searchParams.get("share") === "true";
  if (shareMode) {
    const interview = await getInterview(id);
    if (interview && interview.status === "completed") {
      return NextResponse.json({
        role: interview.role,
        level: interview.level,
        focusAreas: interview.focusAreas,
        duration: interview.duration,
        roundType: interview.roundType,
        status: interview.status,
        scorecard: interview.scorecard,
        transcript: interview.transcript,
        // PII stripped: no email, name, phone, resume, token, proctoring photos
      });
    }
    return NextResponse.json({ error: "Not available for sharing" }, { status: 404 });
  }

  const { authorized, session } = await validateAccess(req, id);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const includePhotos = url.searchParams.get("photos") === "true";

  const interview = includePhotos
    ? await getInterviewWithPhotos(id)
    : await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  // Expiration only applies to candidates (token-based access).
  // Interviewers (session-based) can always view past interviews.
  if (!session && interview.expiresAt && new Date(interview.expiresAt) < new Date()) {
    return NextResponse.json({ error: "This interview link has expired", expired: true }, { status: 410 });
  }

  return NextResponse.json(interview);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { authorized, session } = await validateAccess(req, id);
  if (!authorized || !session) {
    return NextResponse.json({ error: "Unauthorized — admin access required" }, { status: 401 });
  }

  // Delete cascade handles transcript_entries, proctoring_events, interview_rounds
  await pool.query("DELETE FROM interviews WHERE id = $1", [id]);

  return NextResponse.json({ ok: true });
}
