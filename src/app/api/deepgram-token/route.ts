import { NextResponse } from "next/server";

export async function GET() {
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
