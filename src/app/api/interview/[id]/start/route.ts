import { NextResponse } from "next/server";
import { updateInterview } from "@/lib/store";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await updateInterview(id, {
    status: "in_progress",
    startedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
