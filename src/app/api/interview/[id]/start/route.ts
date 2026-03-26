import { NextResponse } from "next/server";
import { updateInterview } from "@/lib/store";
import { validateAccess } from "@/lib/auth-check";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { authorized } = await validateAccess(req, id);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await updateInterview(id, {
    status: "in_progress",
    startedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
