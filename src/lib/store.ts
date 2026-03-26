import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres@localhost:5432/ai_interview_platform",
});

export interface Interview {
  id: string;
  resume: string;
  resumeFileName: string;
  candidateEmail: string;
  token: string;
  browserFingerprint: string | null;
  role: string;
  level: string;
  focusAreas: string[];
  duration: number;
  roundType?: string;
  language?: string;
  status: "waiting" | "in_progress" | "completed";
  transcript: TranscriptEntry[];
  proctoring: ProctoringEvent[];
  scorecard: Scorecard | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  orgId?: string;
  createdBy?: string;
}

export interface TranscriptEntry {
  role: "ai" | "candidate";
  text: string;
  timestamp: string;
}

export interface ProctoringEvent {
  type: string;
  severity: string;
  message: string;
  timestamp: string;
  photo?: string;
}

export interface Scorecard {
  scores: { dimension: string; score: number }[];
  overall: number;
  recommendation: string;
  overallAssessment: string;
  strengths: string[];
  weaknesses: string[];
  evidence: { dimension: string; quote: string; assessment: string }[];
  proctoringNotes: string;
}

export async function saveInterview(interview: Omit<Interview, "transcript" | "proctoring">): Promise<void> {
  await pool.query(
    `INSERT INTO interviews (id, resume, resume_file_name, candidate_email, token, browser_fingerprint, role, level, focus_areas, duration, round_type, language, status, scorecard, created_at, started_at, ended_at, org_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       scorecard = EXCLUDED.scorecard,
       started_at = EXCLUDED.started_at,
       ended_at = EXCLUDED.ended_at,
       browser_fingerprint = COALESCE(EXCLUDED.browser_fingerprint, interviews.browser_fingerprint)`,
    [
      interview.id,
      interview.resume,
      interview.resumeFileName,
      interview.candidateEmail,
      interview.token,
      interview.browserFingerprint,
      interview.role,
      interview.level,
      interview.focusAreas,
      interview.duration,
      interview.roundType || "General",
      interview.language || null,
      interview.status,
      interview.scorecard ? JSON.stringify(interview.scorecard) : null,
      interview.createdAt,
      interview.startedAt,
      interview.endedAt,
      interview.orgId || null,
      interview.createdBy || null,
    ]
  );
}

export async function getInterview(id: string): Promise<Interview | null> {
  const { rows } = await pool.query("SELECT * FROM interviews WHERE id = $1", [id]);
  if (rows.length === 0) return null;

  const row = rows[0];
  const transcript = await getTranscript(id);
  const proctoring = await getProctoringEvents(id);

  return {
    id: row.id,
    resume: row.resume,
    resumeFileName: row.resume_file_name,
    candidateEmail: row.candidate_email || "",
    token: row.token || "",
    browserFingerprint: row.browser_fingerprint || null,
    role: row.role,
    level: row.level,
    focusAreas: row.focus_areas,
    duration: row.duration,
    roundType: row.round_type || "General",
    language: row.language || "",
    status: row.status,
    transcript,
    proctoring,
    scorecard: row.scorecard,
    createdAt: row.created_at?.toISOString(),
    startedAt: row.started_at?.toISOString() || null,
    endedAt: row.ended_at?.toISOString() || null,
  };
}

export async function updateInterview(id: string, updates: Partial<Interview>): Promise<Interview | null> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const columnMap: Record<string, string> = {
    status: "status",
    startedAt: "started_at",
    endedAt: "ended_at",
    scorecard: "scorecard",
  };

  for (const [key, col] of Object.entries(columnMap)) {
    if (key in updates) {
      setClauses.push(`${col} = $${idx}`);
      const val = (updates as any)[key];
      values.push(key === "scorecard" ? JSON.stringify(val) : val);
      idx++;
    }
  }

  if (setClauses.length === 0) return getInterview(id);

  values.push(id);
  await pool.query(`UPDATE interviews SET ${setClauses.join(", ")} WHERE id = $${idx}`, values);
  return getInterview(id);
}

async function getTranscript(interviewId: string): Promise<TranscriptEntry[]> {
  const { rows } = await pool.query(
    "SELECT role, text, created_at FROM transcript_entries WHERE interview_id = $1 ORDER BY id ASC",
    [interviewId]
  );
  return rows.map((r) => ({
    role: r.role as "ai" | "candidate",
    text: r.text,
    timestamp: r.created_at?.toISOString(),
  }));
}

async function getProctoringEvents(interviewId: string): Promise<ProctoringEvent[]> {
  const { rows } = await pool.query(
    "SELECT type, severity, message, photo, created_at FROM proctoring_events WHERE interview_id = $1 ORDER BY id ASC",
    [interviewId]
  );
  return rows.map((r) => ({
    type: r.type,
    severity: r.severity,
    message: r.message,
    timestamp: r.created_at?.toISOString(),
    ...(r.photo ? { photo: r.photo } : {}),
  }));
}

export async function getAllInterviews(orgId?: string): Promise<Omit<Interview, "resume">[]> {
  const query = orgId
    ? "SELECT id, resume_file_name, candidate_email, role, level, focus_areas, duration, round_type, language, status, scorecard, created_at, started_at, ended_at FROM interviews WHERE org_id = $1 ORDER BY created_at DESC"
    : "SELECT id, resume_file_name, candidate_email, role, level, focus_areas, duration, round_type, language, status, scorecard, created_at, started_at, ended_at FROM interviews ORDER BY created_at DESC";
  const { rows } = await pool.query(query, orgId ? [orgId] : []);
  const results = [];
  for (const row of rows) {
    const transcript = await getTranscript(row.id);
    const proctoring = await getProctoringEvents(row.id);
    results.push({
      id: row.id,
      resume: "",
      resumeFileName: row.resume_file_name,
      candidateEmail: row.candidate_email || "",
      token: "",
      browserFingerprint: null,
      role: row.role,
      level: row.level,
      focusAreas: row.focus_areas,
      duration: row.duration,
      roundType: row.round_type || "General",
      language: row.language || "",
      status: row.status,
      transcript,
      proctoring,
      scorecard: row.scorecard,
      createdAt: row.created_at?.toISOString(),
      startedAt: row.started_at?.toISOString() || null,
      endedAt: row.ended_at?.toISOString() || null,
    });
  }
  return results;
}

export async function getInterviewByToken(token: string): Promise<Interview | null> {
  const { rows } = await pool.query("SELECT id FROM interviews WHERE token = $1", [token]);
  if (rows.length === 0) return null;
  return getInterview(rows[0].id);
}

export async function addTranscriptEntry(id: string, entry: TranscriptEntry): Promise<void> {
  await pool.query(
    "INSERT INTO transcript_entries (interview_id, role, text) VALUES ($1, $2, $3)",
    [id, entry.role, entry.text]
  );
}

export async function addProctoringEvent(id: string, event: ProctoringEvent & { photo?: string }): Promise<void> {
  await pool.query(
    "INSERT INTO proctoring_events (interview_id, type, severity, message, photo) VALUES ($1, $2, $3, $4, $5)",
    [id, event.type, event.severity, event.message, event.photo || null]
  );
}
