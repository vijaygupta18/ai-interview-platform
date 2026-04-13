import { NextResponse } from "next/server";
import { getScoringStatus } from "@/lib/scoring-tracker";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const status = await getScoringStatus(id);
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }
}
