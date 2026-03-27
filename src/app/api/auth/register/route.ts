import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { pool } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email, password, name, orgId } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Email, password, and name are required" }, { status: 400 });
    }

    if (!orgId) {
      return NextResponse.json({ error: "Please select an organization" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Validate that the selected organization exists
    const orgCheck = await pool.query("SELECT id FROM organizations WHERE id = $1", [orgId]);
    if (orgCheck.rows.length === 0) {
      return NextResponse.json({ error: "Selected organization does not exist" }, { status: 400 });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    // New users join existing org as inactive members — admin must activate
    const role = "member";
    const isActive = false;

    await pool.query(
      "INSERT INTO users (id, email, password_hash, name, org_id, role, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [userId, email, passwordHash, name, orgId, role, isActive]
    );

    return NextResponse.json({
      id: userId,
      email,
      name,
      orgId,
      role,
      isActive,
      message: "Account created. An admin must activate your account before you can log in.",
    });
  } catch (err: any) {
    console.error("Registration error:", err);
    if (err.code === "23505") {
      if (err.detail?.includes("email")) {
        return NextResponse.json({ error: "This email is already registered" }, { status: 409 });
      }
      return NextResponse.json({ error: "Account already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
