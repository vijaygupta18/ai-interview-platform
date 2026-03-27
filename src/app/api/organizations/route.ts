import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const { rows } = await pool.query("SELECT id, name FROM organizations ORDER BY name ASC");
  return NextResponse.json(rows);
}
