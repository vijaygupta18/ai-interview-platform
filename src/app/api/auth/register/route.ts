import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { pool } from "@/lib/db";

const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(req: Request) {
  try {
    const { email, password, name, orgName } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Email, password, and name are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    let orgId = DEFAULT_ORG_ID;
    let role = "member";

    if (orgName?.trim()) {
      orgId = uuidv4();
      role = "admin";
      await pool.query(
        "INSERT INTO organizations (id, name) VALUES ($1, $2)",
        [orgId, orgName.trim()]
      );
    }

    await pool.query(
      "INSERT INTO users (id, email, password_hash, name, org_id, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [userId, email, passwordHash, name, orgId, role]
    );

    return NextResponse.json({
      id: userId,
      email,
      name,
      orgId,
      role,
    });
  } catch (err: any) {
    console.error("Registration error:", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
