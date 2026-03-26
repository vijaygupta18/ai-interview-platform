import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "ai_interview_platform",
  port: 5432,
});

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT id, org_id, name, role, level, round_type, questions FROM question_banks ORDER BY name ASC"
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch question banks:", error);
    return NextResponse.json({ error: "Failed to fetch question banks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, role, level, roundType, questions } = await req.json();

    if (!name || !role || !level || !roundType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `INSERT INTO question_banks (name, role, level, round_type, questions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, org_id, name, role, level, round_type, questions`,
      [name, role, level, roundType, JSON.stringify(questions || [])]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create question bank:", error);
    return NextResponse.json({ error: "Failed to create question bank" }, { status: 500 });
  }
}
