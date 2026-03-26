import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET(req: Request) {
  // Validate access: session OR interview token
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { rows } = await pool.query("SELECT id FROM interviews WHERE token = $1", [token]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Deepgram API key not configured" }, { status: 500 });
  }

  return NextResponse.json({ key: apiKey });
}
