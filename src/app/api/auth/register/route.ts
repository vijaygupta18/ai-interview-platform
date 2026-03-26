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
    let isActive = false; // New users are inactive by default

    if (orgName?.trim()) {
      orgId = uuidv4();
      role = "admin";
      isActive = true; // Org creators are auto-activated
      await pool.query(
        "INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)",
        [orgId, orgName.trim(), orgName.trim().toLowerCase().replace(/\s+/g, "-")]
      );
    }

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
      message: isActive ? "Account created and activated." : "Account created. Please wait for admin activation.",
    });
  } catch (err: any) {
    console.error("Registration error:", err);
    if (err.code === "23505") {
      // Unique constraint violation
      if (err.detail?.includes("email")) {
        return NextResponse.json({ error: "This email is already registered" }, { status: 409 });
      }
      if (err.detail?.includes("slug")) {
        return NextResponse.json({ error: "An organization with this name already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: "Account already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
