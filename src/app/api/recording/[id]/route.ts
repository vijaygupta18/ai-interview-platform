import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const filePath = join(process.cwd(), "data", "recordings", `${id}.webm`);

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const buffer = await readFile(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "audio/webm",
      "Content-Length": buffer.length.toString(),
    },
  });
}
