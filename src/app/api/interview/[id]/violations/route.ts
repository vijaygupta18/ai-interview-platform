import { NextResponse } from "next/server";
import { getProctoringViolationCount } from "@/lib/store";
import { validateAccess } from "@/lib/auth-check";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { authorized } = await validateAccess(req, id);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await getProctoringViolationCount(id);
  return NextResponse.json({ count });
}
