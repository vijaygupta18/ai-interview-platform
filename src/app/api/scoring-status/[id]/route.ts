import { NextResponse } from "next/server";
import { getScoringStatus } from "@/lib/scoring-tracker";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const status = await getScoringStatus(id);
  return NextResponse.json(status);
}
