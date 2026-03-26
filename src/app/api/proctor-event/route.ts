import { NextResponse } from "next/server";
import { addProctoringEvent } from "@/lib/store";
import { validateAccessPost } from "@/lib/auth-check";

export async function POST(req: Request) {
  try {
    const { interviewId, type, severity, message, photo, token } = await req.json();

    if (!interviewId || !type || !severity || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!(await validateAccessPost(interviewId, token))) {
      return NextResponse.json({ error: "Invalid interview" }, { status: 403 });
    }

    // Reject oversized photos (>150KB base64)
    if (photo && photo.length > 150000) {
      return NextResponse.json({ error: "Photo too large (max 150KB)" }, { status: 400 });
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
