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
    const body = await req.json();

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (typeof body.is_active === "boolean") {
      updates.push(`is_active = $${idx++}`);
      values.push(body.is_active);
    }
    if (body.role && ["admin", "interviewer", "member"].includes(body.role)) {
      updates.push(`role = $${idx++}`);
      values.push(body.role);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    values.push(id, (session.user as any).orgId);
    await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = $${idx++} AND org_id = $${idx}`, values);

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
