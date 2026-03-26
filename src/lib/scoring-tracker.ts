import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/ai_interview_platform",
});

export async function startScoring(interviewId: string): Promise<boolean> {
  // Atomic check-and-set: only succeeds if not already generating
  // Also allows retry if stuck in 'generating' for >5 minutes (server crash recovery)
  const { rowCount } = await pool.query(
    `UPDATE interviews SET scoring_status = 'generating', scoring_started_at = NOW()
     WHERE id = $1 AND (
       scoring_status IS NULL
       OR scoring_status != 'generating'
       OR scoring_started_at < NOW() - INTERVAL '5 minutes'
     )`,
    [interviewId]
  );
  return (rowCount ?? 0) > 0;
}

export async function completeScoring(interviewId: string): Promise<void> {
  await pool.query(
    "UPDATE interviews SET scoring_status = 'completed' WHERE id = $1",
    [interviewId]
  );
}

export async function failScoring(interviewId: string, error: string): Promise<void> {
  await pool.query(
    "UPDATE interviews SET scoring_status = 'failed' WHERE id = $1",
    [interviewId]
  );
  console.error(`[Scoring] Failed for ${interviewId}: ${error}`);
}

export async function getScoringStatus(interviewId: string): Promise<{ status: string }> {
  const { rows } = await pool.query(
    "SELECT scoring_status, scoring_started_at, scorecard IS NOT NULL as has_scorecard FROM interviews WHERE id = $1",
    [interviewId]
  );
  if (rows.length === 0) return { status: "not_found" };
  if (rows[0].has_scorecard) return { status: "completed" };

  // If stuck in generating for >5 min, treat as failed (server crash recovery)
  if (rows[0].scoring_status === "generating" && rows[0].scoring_started_at) {
    const elapsed = Date.now() - new Date(rows[0].scoring_started_at).getTime();
    if (elapsed > 5 * 60 * 1000) return { status: "failed" };
  }

  return { status: rows[0].scoring_status || "not_started" };
}
