// In-memory tracker for scorecard generation status
// Prevents duplicate scoring triggers and lets UI check status

interface ScoringStatus {
  status: "generating" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  error?: string;
}

const scoringMap = new Map<string, ScoringStatus>();

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of scoringMap) {
    // Remove entries older than 30 minutes
    if (now - entry.startedAt > 30 * 60 * 1000) {
      scoringMap.delete(id);
    }
  }
}, 10 * 60 * 1000);

export function startScoring(interviewId: string): boolean {
  const existing = scoringMap.get(interviewId);
  // Don't start if already generating
  if (existing?.status === "generating") {
    console.log(`[Scoring] Already generating for ${interviewId}, skipping`);
    return false;
  }
  scoringMap.set(interviewId, { status: "generating", startedAt: Date.now() });
  return true;
}

export function completeScoring(interviewId: string): void {
  scoringMap.set(interviewId, {
    status: "completed",
    startedAt: scoringMap.get(interviewId)?.startedAt || Date.now(),
    completedAt: Date.now(),
  });
}

export function failScoring(interviewId: string, error: string): void {
  scoringMap.set(interviewId, {
    status: "failed",
    startedAt: scoringMap.get(interviewId)?.startedAt || Date.now(),
    error,
  });
}

export function getScoringStatus(interviewId: string): ScoringStatus | null {
  return scoringMap.get(interviewId) || null;
}
