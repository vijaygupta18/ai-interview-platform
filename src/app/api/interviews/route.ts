import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllInterviews } from "@/lib/store";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const orgId = (session?.user as any)?.orgId;
    const interviews = await getAllInterviews(orgId);
    return NextResponse.json(interviews);
  } catch (error) {
    console.error("Failed to fetch interviews:", error);
    return NextResponse.json({ error: "Failed to fetch interviews" }, { status: 500 });
  }
}
