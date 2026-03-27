import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { validateAccessPost } from "@/lib/auth-check";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;
    const interviewId = formData.get("interviewId") as string;
    const token = (formData.get("token") as string) || undefined;

    if (!audio || !interviewId) {
      return NextResponse.json({ error: "Missing audio or interviewId" }, { status: 400 });
    }

    if (!UUID_REGEX.test(interviewId)) {
      return NextResponse.json({ error: "Invalid interview ID" }, { status: 400 });
    }

    if (!(await validateAccessPost(interviewId, token))) {
      return NextResponse.json({ error: "Invalid interview" }, { status: 403 });
    }

    const dir = join(process.cwd(), "data", "recordings");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const filePath = join(dir, `${interviewId}.webm`);
    await writeFile(filePath, buffer);

    console.log(`Recording saved: ${filePath} (${buffer.length} bytes)`);

    return NextResponse.json({ success: true, path: filePath });
  } catch (error) {
    console.error("Upload recording failed:", error);
    return NextResponse.json({ error: "Failed to save recording" }, { status: 500 });
  }
}
