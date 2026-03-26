import { NextResponse } from "next/server";
import { addProctoringEvent } from "@/lib/store";
import { validateInterviewExists } from "@/lib/auth-check";

export async function POST(req: Request) {
  try {
    const { interviewId, type, severity, message, photo } = await req.json();

    if (!interviewId || !type || !severity || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!(await validateInterviewExists(interviewId))) {
      return NextResponse.json({ error: "Invalid interview" }, { status: 403 });
    }

    await addProctoringEvent(interviewId, {
      type,
      severity,
      message,
      timestamp: new Date().toISOString(),
      photo: photo || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Proctor event error:", error);
    return NextResponse.json({ error: "Failed to save proctoring event" }, { status: 500 });
  }
}
