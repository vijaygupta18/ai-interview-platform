import { NextResponse } from "next/server";
import { addProctoringEvent } from "@/lib/store";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const { interviewId, type, severity, message, photo } = await req.json();

    if (!interviewId || !type || !severity || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Save proctoring event to DB
    await addProctoringEvent(interviewId, {
      type,
      severity,
      message,
      timestamp: new Date().toISOString(),
    });

    // Save periodic photos to disk for review
    if (photo && type === "photo_capture") {
      try {
        const dir = path.join(process.cwd(), "data", "proctoring", interviewId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
        const filename = `capture_${Date.now()}.jpg`;
        fs.writeFileSync(path.join(dir, filename), base64Data, "base64");
      } catch (err) {
        console.error("Failed to save proctoring photo:", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Proctor event error:", error);
    return NextResponse.json({ error: "Failed to save proctoring event" }, { status: 500 });
  }
}
