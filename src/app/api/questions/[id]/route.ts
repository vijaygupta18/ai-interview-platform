import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = (session.user as any).orgId;

    const { rows } = await pool.query("SELECT * FROM question_banks WHERE id = $1 AND org_id = $2", [params.id, orgId]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("Failed to fetch question bank:", error);
    return NextResponse.json({ error: "Failed to fetch question bank" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = (session.user as any).orgId;

    const { name, role, level, roundType, questions } = await req.json();
    const { rows } = await pool.query(
      `UPDATE question_banks SET name = $1, role = $2, level = $3, round_type = $4, questions = $5
       WHERE id = $6 AND org_id = $7
       RETURNING id, org_id, name, role, level, round_type, questions`,
      [name, role, level, roundType, JSON.stringify(questions || []), params.id, orgId]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("Failed to update question bank:", error);
    return NextResponse.json({ error: "Failed to update question bank" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = (session.user as any).orgId;

    const { rowCount } = await pool.query("DELETE FROM question_banks WHERE id = $1 AND org_id = $2", [params.id, orgId]);
    if (rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete question bank:", error);
    return NextResponse.json({ error: "Failed to delete question bank" }, { status: 500 });
  }
}
