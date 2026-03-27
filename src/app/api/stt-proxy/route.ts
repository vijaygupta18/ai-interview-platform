import { NextResponse } from "next/server";
import { getSTTConfig } from "@/lib/providers";
import { pool } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only for in_progress interviews
  const { rows } = await pool.query(
    "SELECT id FROM interviews WHERE token = $1 AND status IN ('in_progress', 'waiting')",
    [token]
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Interview not active" }, { status: 403 });
  }

  const config = getSTTConfig();

  return NextResponse.json({
    provider: config.provider,
  });
}
