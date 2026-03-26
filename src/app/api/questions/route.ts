import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = (session.user as any).orgId;

    const { rows } = await pool.query(
      "SELECT id, org_id, name, role, level, round_type, questions FROM question_banks WHERE org_id = $1 ORDER BY name ASC",
      [orgId]
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch question banks:", error);
    return NextResponse.json({ error: "Failed to fetch question banks" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = (session.user as any).orgId;

    const { name, role, level, roundType, questions } = await req.json();

    if (!name || !role || !level || !roundType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { rows } = await pool.query(
      `INSERT INTO question_banks (name, role, level, round_type, questions, org_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, org_id, name, role, level, round_type, questions`,
      [name, role, level, roundType, JSON.stringify(questions || []), orgId]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create question bank:", error);
    return NextResponse.json({ error: "Failed to create question bank" }, { status: 500 });
  }
}
