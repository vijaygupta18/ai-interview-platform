import { NextResponse } from "next/server";
import { getInterview, updateInterview } from "@/lib/store";
import { validateAccess } from "@/lib/auth-check";
import { validateAccessPost } from "@/lib/auth-check";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Check URL token first, then try body token
  const { authorized } = await validateAccess(req, id);
  if (!authorized) {
    // Try body token
    try {
      const body = await req.clone().json();
      if (body.token && await validateAccessPost(id, body.token)) {
        // OK
      } else {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const interview = await getInterview(id);
  if (!interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }
  if (interview.status === "completed") {
    return NextResponse.json({ error: "Interview already completed" }, { status: 400 });
  }

  await updateInterview(id, {
    status: "in_progress",
    startedAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
