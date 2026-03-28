import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

let lastStaleCheck = 0;

async function completeStaleInterviews() {
  // Run at most once per 5 minutes
  const now = Date.now();
  if (now - lastStaleCheck < 30 * 60 * 1000) return;
  lastStaleCheck = now;

  try {
    // Find in_progress interviews where duration has been exceeded
    // (candidate may have closed tab — only complete after time is up)
    const { rows } = await pool.query(`
      UPDATE interviews
      SET status = 'completed', ended_at = NOW()
      WHERE status = 'in_progress'
        AND started_at IS NOT NULL
        AND started_at + (duration || ' minutes')::interval < NOW()
      RETURNING id
    `);

    if (rows.length > 0) {
      console.log(`[Stale] Auto-completed ${rows.length} stale interview(s): ${rows.map((r: any) => r.id).join(", ")}`);

      // Trigger scorecard generation for each
      for (const row of rows) {
        try {
          const { getInterview } = await import("@/lib/store");
          const { generateScorecard } = await import("@/lib/ai");
          const { normalizeScorecard } = await import("@/lib/normalize-scorecard");
          const { startScoring, completeScoring, failScoring } = await import("@/lib/scoring-tracker");

          const interview = await getInterview(row.id);
          if (interview && interview.transcript.length > 0 && !interview.scorecard) {
            if (await startScoring(row.id)) {
              const raw = await generateScorecard(interview);
              let parsed;
              try { parsed = JSON.parse(raw); } catch {
                const match = raw.match(/\{[\s\S]*\}/);
                if (match) parsed = JSON.parse(match[0]);
              }
              if (parsed) {
                const scorecard = normalizeScorecard(parsed);
                await pool.query("UPDATE interviews SET scorecard = $1 WHERE id = $2", [JSON.stringify(scorecard), row.id]);
                completeScoring(row.id);
                console.log(`[Stale] Scorecard generated for ${row.id}`);
              }
            }
          }
        } catch (err) {
          console.error(`[Stale] Scorecard failed for ${row.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error("[Stale] Cleanup failed:", err);
  }
}

export async function GET() {
  try {
    await pool.query("SELECT 1");
    // Fire-and-forget stale interview cleanup
    completeStaleInterviews().catch(() => {});
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return NextResponse.json({ status: "error", message: "Database connection failed" }, { status: 503 });
  }
}
