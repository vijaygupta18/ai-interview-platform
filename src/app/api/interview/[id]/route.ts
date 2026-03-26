import { NextResponse } from "next/server";
import { getInterview } from "@/lib/store";
import { validateAccess } from "@/lib/auth-check";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { authorized } = await validateAccess(req, id);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  return NextResponse.json(interview);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Delete cascade handles transcript_entries, proctoring_events, interview_rounds
  await pool.query("DELETE FROM interviews WHERE id = $1", [id]);

  return NextResponse.json({ ok: true });
}
