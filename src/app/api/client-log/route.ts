import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { level, message, interviewId, data } = await req.json();
    const ts = new Date().toISOString();
    const prefix = interviewId ? `[Client:${interviewId.substring(0, 8)}]` : "[Client]";

    if (level === "error") {
      console.error(`${prefix} ${message}`, data || "");
    } else if (level === "warn") {
      console.warn(`${prefix} ${message}`, data || "");
    } else {
      console.log(`${prefix} ${message}`, data || "");
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
