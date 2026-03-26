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

  try {
    // Create a temporary scoped key that expires in 60 seconds
    // This key can only be used for STT (listen), not for account management
    const res = await fetch("https://api.deepgram.com/v1/keys", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        comment: "Temporary interview key",
        scopes: ["usage:write"],
        time_to_live_in_seconds: 300, // 5 minutes
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ key: data.key });
    }

    console.warn("Could not create temporary Deepgram key.");
    return NextResponse.json({ error: "Could not create secure token. Try again." }, { status: 503 });
  } catch (err) {
    console.warn("Temporary key creation failed:", err);
    return NextResponse.json({ error: "Could not create secure token. Try again." }, { status: 503 });
  }
}
