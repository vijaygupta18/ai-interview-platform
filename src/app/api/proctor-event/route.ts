import { NextResponse } from "next/server";
import { addProctoringEvent } from "@/lib/store";
import { validateAccessPost } from "@/lib/auth-check";

export async function POST(req: Request) {
  try {
    let interviewId: string, type: string, severity: string, message: string, token: string | undefined;
    let photoData: Buffer | string | undefined;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // Binary photo upload via FormData — store raw Buffer (no base64 conversion)
      const formData = await req.formData();
      interviewId = formData.get("interviewId") as string;
      type = formData.get("type") as string;
      severity = formData.get("severity") as string;
      message = formData.get("message") as string;
      token = (formData.get("token") as string) || undefined;

      const photoFile = formData.get("photo") as File | null;
      if (photoFile) {
        const buffer = Buffer.from(await photoFile.arrayBuffer());
        if (buffer.length > 100000) {
          return NextResponse.json({ error: "Photo too large" }, { status: 400 });
        }
        photoData = buffer;
      }
    } else {
      // JSON (non-photo events + legacy base64)
      const body = await req.json();
      interviewId = body.interviewId;
      type = body.type;
      severity = body.severity;
      message = body.message;
      token = body.token;
      if (body.photo) {
        if (body.photo.length > 50000) {
          return NextResponse.json({ error: "Photo too large" }, { status: 400 });
        }
        photoData = body.photo;
      }
    }

    if (!interviewId || !type || !severity || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!(await validateAccessPost(interviewId, token))) {
      return NextResponse.json({ error: "Invalid interview" }, { status: 403 });
    }

    await addProctoringEvent(interviewId, {
      type,
      severity,
      message,
      timestamp: new Date().toISOString(),
      photo: photoData,
    } as any);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Proctor event error:", error);
    return NextResponse.json({ error: "Failed to save proctoring event" }, { status: 500 });
  }
}
