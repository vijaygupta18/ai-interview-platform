import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const orgId = (session.user as any).orgId;

    const { rows } = await pool.query(
      "SELECT id, name, subject, body, description, is_default FROM email_templates WHERE org_id = $1 ORDER BY is_default DESC, name ASC",
      [orgId]
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch templates:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const orgId = (session.user as any).orgId;
    const { name, subject, body, description } = await req.json();

    if (!name || !subject || !body) {
      return NextResponse.json({ error: "Name, subject, and body are required" }, { status: 400 });
    }

    const { rows } = await pool.query(
      "INSERT INTO email_templates (org_id, name, subject, body, description) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [orgId, name, subject, body, description || ""]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    console.error("Failed to create template:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
