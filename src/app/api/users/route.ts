import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const orgId = (session.user as any).orgId;
    const { rows } = await pool.query(
      "SELECT id, email, name, role, is_active, created_at FROM users WHERE org_id = $1 ORDER BY created_at DESC",
      [orgId]
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
