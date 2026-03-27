import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { validateAccessPost } from "@/lib/auth-check";

export async function POST(req: Request) {
  try {
    const { interviewId, token } = await req.json();
    if (!interviewId) {
      return NextResponse.json({ error: "Missing interviewId" }, { status: 400 });
    }
    if (!(await validateAccessPost(interviewId, token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    await pool.query(
      "UPDATE interviews SET last_heartbeat_at = NOW() WHERE id = $1 AND status = 'in_progress'",
      [interviewId]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
