import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

// Toggle user active status
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const { is_active } = await req.json();

    await pool.query("UPDATE users SET is_active = $1 WHERE id = $2 AND org_id = $3", [
      is_active,
      id,
      (session.user as any).orgId,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update user:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

// Delete user
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;

    // Don't allow deleting yourself
    if (id === (session.user as any).id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    await pool.query("DELETE FROM users WHERE id = $1 AND org_id = $2", [
      id,
      (session.user as any).orgId,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete user:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
