import { NextResponse } from "next/server";
import { getScoringStatus } from "@/lib/scoring-tracker";
import { getInterview } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Check in-memory status first
  const status = getScoringStatus(id);
  if (status) {
    return NextResponse.json(status);
  }

  // Check DB — if scorecard exists, it's done
  const interview = await getInterview(id);
  if (interview?.scorecard) {
    return NextResponse.json({ status: "completed" });
  }

  return NextResponse.json({ status: "not_started" });
}
