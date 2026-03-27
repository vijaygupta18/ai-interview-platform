import { pool } from "./db";

export interface Interview {
  id: string;
  resume: string;
  resumeFileName: string;
  candidateEmail: string;
  candidateName?: string;
  candidatePhone?: string;
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
  expiresAt: string | null;
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
    `INSERT INTO interviews (id, resume, resume_file_name, candidate_email, candidate_name, candidate_phone, token, browser_fingerprint, role, level, focus_areas, duration, round_type, language, status, scorecard, created_at, started_at, ended_at, expires_at, org_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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
      interview.candidateName || null,
      interview.candidatePhone || null,
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
      interview.expiresAt,
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
    candidateName: row.candidate_name || "",
    candidatePhone: row.candidate_phone || "",
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
    expiresAt: row.expires_at?.toISOString() || null,
    orgId: row.org_id || null,
    createdBy: row.created_by || null,
  };
}

export async function getInterviewWithPhotos(id: string): Promise<Interview | null> {
  const { rows } = await pool.query("SELECT * FROM interviews WHERE id = $1", [id]);
  if (rows.length === 0) return null;

  const row = rows[0];
  const transcript = await getTranscript(id);
  const proctoring = await getProctoringEventsWithPhotos(id);

  return {
    id: row.id,
    resume: row.resume,
    resumeFileName: row.resume_file_name,
    candidateEmail: row.candidate_email || "",
    candidateName: row.candidate_name || "",
    candidatePhone: row.candidate_phone || "",
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
    expiresAt: row.expires_at?.toISOString() || null,
    orgId: row.org_id || null,
    createdBy: row.created_by || null,
  };
}

export async function updateInterview(id: string, updates: Partial<Interview>): Promise<void> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let idx = 1;

  const columnMap: Record<string, string> = {
    status: "status",
    startedAt: "started_at",
    endedAt: "ended_at",
    scorecard: "scorecard",
    browserFingerprint: "browser_fingerprint",
    scoringStatus: "scoring_status",
    scoringStartedAt: "scoring_started_at",
    recordingUrl: "recording_url",
  };

  for (const [key, col] of Object.entries(columnMap)) {
    if (key in updates) {
      setClauses.push(`${col} = $${idx}`);
      const val = (updates as any)[key];
      values.push(key === "scorecard" ? JSON.stringify(val) : val);
      idx++;
    }
  }

  if (setClauses.length === 0) return;

  values.push(id);
  await pool.query(`UPDATE interviews SET ${setClauses.join(", ")} WHERE id = $${idx}`, values);
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
    "SELECT type, severity, message, created_at FROM proctoring_events WHERE interview_id = $1 ORDER BY id ASC",
    [interviewId]
  );
  return rows.map((r) => ({
    type: r.type,
    severity: r.severity,
    message: r.message,
    timestamp: r.created_at?.toISOString(),
  }));
}

async function getProctoringEventsWithPhotos(interviewId: string): Promise<ProctoringEvent[]> {
  const { rows } = await pool.query(
    "SELECT type, severity, message, photo, created_at FROM proctoring_events WHERE interview_id = $1 ORDER BY id ASC",
    [interviewId]
  );
  return rows.map((r) => ({
    type: r.type,
    severity: r.severity,
    message: r.message,
    timestamp: r.created_at?.toISOString(),
    ...(r.photo ? { photo: `data:image/webp;base64,${Buffer.isBuffer(r.photo) ? r.photo.toString("base64") : r.photo}` } : {}),
  }));
}

export async function getProctoringViolationCount(interviewId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(
      CASE type
        WHEN 'face_missing' THEN 0.5
        WHEN 'eye_away' THEN 0.5
        WHEN 'fullscreen_exit' THEN 1
        WHEN 'window_blur' THEN 1
        WHEN 'phone_detected' THEN 1.5
        WHEN 'multiple_faces' THEN 1.5
        WHEN 'screen_share_stopped' THEN 2
        WHEN 'virtual_camera' THEN 2
        ELSE 1
      END
    ), 0) as weighted_count
    FROM proctoring_events WHERE interview_id = $1 AND severity = 'flag'
    AND type IN ('face_missing','multiple_faces','screen_share_stopped','phone_detected','eye_away','fullscreen_exit','window_blur','virtual_camera')`,
    [interviewId]
  );
  return parseFloat(rows[0].weighted_count);
}

export async function getAllInterviews(orgId?: string): Promise<Omit<Interview, "resume">[]> {
  const interviewQuery = orgId
    ? "SELECT i.*, (SELECT count(*) FROM proctoring_events p WHERE p.interview_id = i.id AND p.severity = 'flag') as flag_count, (SELECT count(*) FROM proctoring_events p WHERE p.interview_id = i.id AND p.severity = 'warning') as warning_count FROM interviews i WHERE i.org_id = $1 ORDER BY i.created_at DESC LIMIT 100"
    : "SELECT i.*, (SELECT count(*) FROM proctoring_events p WHERE p.interview_id = i.id AND p.severity = 'flag') as flag_count, (SELECT count(*) FROM proctoring_events p WHERE p.interview_id = i.id AND p.severity = 'warning') as warning_count FROM interviews i ORDER BY i.created_at DESC LIMIT 100";
  const { rows } = await pool.query(interviewQuery, orgId ? [orgId] : []);

  if (rows.length === 0) return [];

  // List endpoint only needs summary data — transcript and proctoring are fetched via getInterview for detail views
  return rows.map((row) => ({
    id: row.id,
    resume: "",
    resumeFileName: row.resume_file_name,
    candidateEmail: row.candidate_email || "",
    candidateName: row.candidate_name || "",
    candidatePhone: row.candidate_phone || "",
    token: "",
    browserFingerprint: null,
    role: row.role,
    level: row.level,
    focusAreas: row.focus_areas,
    duration: row.duration,
    roundType: row.round_type || "General",
    language: row.language || "",
    status: row.status,
    transcript: [],
    proctoring: [
      ...Array(parseInt(row.flag_count) || 0).fill({ type: "flag", severity: "flag", message: "", timestamp: "" }),
      ...Array(parseInt(row.warning_count) || 0).fill({ type: "warning", severity: "warning", message: "", timestamp: "" }),
    ],
    scorecard: row.scorecard,
    createdAt: row.created_at?.toISOString(),
    startedAt: row.started_at?.toISOString() || null,
    endedAt: row.ended_at?.toISOString() || null,
    expiresAt: row.expires_at?.toISOString() || null,
    orgId: row.org_id || null,
    createdBy: row.created_by || null,
  }));
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

export async function addProctoringEvent(id: string, event: ProctoringEvent & { photo?: string | Buffer }): Promise<void> {
  let photoData: Buffer | null = null;
  if (event.photo) {
    if (Buffer.isBuffer(event.photo)) {
      photoData = event.photo;
    } else if (typeof event.photo === "string") {
      // Strip data URL prefix if present, then decode base64 to binary
      const base64 = event.photo.replace(/^data:[^;]+;base64,/, "");
      photoData = Buffer.from(base64, "base64");
    }
  }
  await pool.query(
    "INSERT INTO proctoring_events (interview_id, type, severity, message, photo) VALUES ($1, $2, $3, $4, $5)",
    [id, event.type, event.severity, event.message, photoData]
  );
}
