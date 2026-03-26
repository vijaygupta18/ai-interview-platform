import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "ai_interview_platform",
  port: 5432,
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { rows } = await pool.query("SELECT * FROM question_banks WHERE id = $1", [params.id]);
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
    const { name, role, level, roundType, questions } = await req.json();
    const { rows } = await pool.query(
      `UPDATE question_banks SET name = $1, role = $2, level = $3, round_type = $4, questions = $5
       WHERE id = $6
       RETURNING id, org_id, name, role, level, round_type, questions`,
      [name, role, level, roundType, JSON.stringify(questions || []), params.id]
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
    const { rowCount } = await pool.query("DELETE FROM question_banks WHERE id = $1", [params.id]);
    if (rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete question bank:", error);
    return NextResponse.json({ error: "Failed to delete question bank" }, { status: 500 });
  }
}
