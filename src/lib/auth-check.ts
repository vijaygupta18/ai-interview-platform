import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { pool } from "./db";

/**
 * Validates either: logged-in session OR valid interview token.
 * Returns the session if authenticated, or null if unauthorized.
 */
export async function validateAccess(req: Request, interviewId: string): Promise<{ authorized: boolean; session: any }> {
  // Check session first (interviewer)
  const session = await getServerSession(authOptions);
  if (session?.user) return { authorized: true, session };

  // Check token (candidate)
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (token) {
    const { rows } = await pool.query("SELECT id FROM interviews WHERE id = $1 AND token = $2", [interviewId, token]);
    if (rows.length > 0) return { authorized: true, session: null };
  }

  return { authorized: false, session: null };
}

/**
 * Validates that interviewId exists in the database.
 */
export async function validateInterviewExists(interviewId: string): Promise<boolean> {
  const { rows } = await pool.query("SELECT id FROM interviews WHERE id = $1", [interviewId]);
  return rows.length > 0;
}
