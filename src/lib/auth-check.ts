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
  if (session?.user) {
    // Verify interview belongs to user's org
    const { rows } = await pool.query("SELECT org_id FROM interviews WHERE id = $1", [interviewId]);
    if (rows.length > 0 && rows[0].org_id && (session.user as any).orgId && rows[0].org_id !== (session.user as any).orgId) {
      return { authorized: false, session: null };
    }
    return { authorized: true, session };
  }

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

/**
 * Validates access for POST endpoints: checks session OR interview token from request body.
 */
export async function validateAccessPost(interviewId: string, token?: string): Promise<boolean> {
  // Check session first (interviewer)
  const session = await getServerSession(authOptions);
  if (session?.user) {
    // Verify interview belongs to user's org
    const { rows } = await pool.query("SELECT org_id FROM interviews WHERE id = $1", [interviewId]);
    if (rows.length > 0 && rows[0].org_id && (session.user as any).orgId && rows[0].org_id !== (session.user as any).orgId) {
      return false;
    }
    return true;
  }

  // Check token (candidate)
  if (token) {
    const { rows } = await pool.query("SELECT id FROM interviews WHERE id = $1 AND token = $2", [interviewId, token]);
    if (rows.length > 0) return true;
  }

  return false;
}
