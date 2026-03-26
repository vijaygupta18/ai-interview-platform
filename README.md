<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.4-blue?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=for-the-badge&logo=tailwindcss" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql" />
  <img src="https://img.shields.io/badge/Deepgram-STT%2FTTS-13EF93?style=for-the-badge" />
</p>

<h1 align="center">InterviewAI</h1>

<p align="center">
  <strong>AI-powered voice & video interview platform with real-time proctoring, automated scoring, and candidate management.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#api-reference">API Reference</a>
</p>

---

## How It Works

```
                    INTERVIEWER                                    CANDIDATE
                        |                                              |
                   Create Interview                              Receives Link
                   (role, resume, questions)                     (email/magic link)
                        |                                              |
                        v                                              v
                 +--------------+                            +------------------+
                 |  Dashboard   | ---- interview link ---->  |  Consent Screen  |
                 |  /dashboard  |                            |  (recording,     |
                 +--------------+                            |   proctoring)    |
                        |                                    +------------------+
                        |                                              |
                        |                                    +------------------+
                        |                                    |  System Check    |
                        |                                    |  Camera, Mic,    |
                        |                                    |  Screen Share    |
                        |                                    +------------------+
                        |                                              |
                        |                                              v
                        |                                    +------------------+
                        |                                    | LIVE INTERVIEW   |
                        |                                    |                  |
                        |                                    | Candidate speaks |
                        |                                    |     |            |
                        |                                    |     v            |
                        |                                    | Deepgram STT    |
                        |                                    | (real-time)     |
                        |                                    |     |            |
                        |                                    |     v            |
                        |                                    | AI Brain        |
                        |                                    | (generates      |
                        |                                    |  question)      |
                        |                                    |     |            |
                        |                                    |     v            |
                        |                                    | Deepgram TTS    |
                        |                                    | (speaks back)   |
                        |                                    |                  |
                        |                                    | + Proctoring:   |
                        |                                    |   Face detect   |
                        |                                    |   Eye tracking  |
                        |                                    |   Tab monitor   |
                        |                                    |   Photo capture |
                        |                                    +------------------+
                        |                                              |
                        |                                    Timer expires / End
                        |                                              |
                        |                                              v
                        |                                    +------------------+
                        |                                    |  "Thank you"    |
                        |                                    |  Completed Page  |
                        |                                    +------------------+
                        |
                        |    (background: AI generates scorecard)
                        |
                        v
                 +--------------+
                 |  Scorecard   |
                 |  - Scores    |
                 |  - Evidence  |
                 |  - Verdict   |
                 |  - Photos    |
                 |  - Transcript|
                 +--------------+
```

## Features

### Core Interview Engine
| Feature | Description |
|---------|-------------|
| **AI Voice Interviewer** | Conducts natural voice conversations using Deepgram STT + TTS |
| **Domain-Aware AI** | Auto-adapts questions for Tech, HR, Ops, Sales, CX, Product, Design, Finance roles |
| **Level Calibration** | Different expectations for Intern vs Senior vs Director |
| **Question Banks** | Pre-load custom questions — AI asks them first, then probes resume |
| **Additional Context** | Paste test scores, coding problems, hiring notes — AI uses them |
| **Resume Parsing** | PDF, DOCX, TXT support with intelligent text extraction |

### Proctoring & Integrity
| Feature | Description |
|---------|-------------|
| **Face Detection** | Chrome FaceDetector API + canvas skin-tone fallback |
| **Eye Tracking** | Flags when candidate looks away from screen |
| **Tab Monitoring** | Detects tab switches (debounced, 5s cooldown) |
| **Phone Detection** | Canvas bright-pixel analysis detects secondary screens |
| **Screen Share** | Mandatory before interview starts, monitored throughout |
| **Photo Capture** | Periodic snapshots every 60s, stored in DB, viewable in dashboard |
| **4-Strike System** | Visual warnings (1/4 → 2/4 → 3/4 → terminated) |
| **Copy/Paste Block** | Clipboard actions blocked and logged |

### Scoring & Analytics
| Feature | Description |
|---------|-------------|
| **Auto Scoring** | AI generates scorecard automatically when interview ends |
| **5 Dimensions** | Technical Depth, Communication, Problem Solving, Domain Knowledge, Culture Fit |
| **Evidence-Based** | Exact candidate quotes cited for each score |
| **Level-Calibrated** | Same answer scored differently for Junior vs Senior |
| **Hire/No Hire** | Clear recommendation with reasoning |
| **Proctoring Report** | Integrity concerns factored into assessment |
| **Duplicate Prevention** | DB-backed scoring tracker prevents concurrent generation |

### Platform
| Feature | Description |
|---------|-------------|
| **Multi-Tenant Auth** | Organizations, role-based access (NextAuth + JWT) |
| **Dashboard** | Interview list with filters (status, verdict), search, sort, pagination |
| **Candidate Comparison** | Side-by-side radar chart across multiple candidates |
| **Coding Mode** | Monaco editor for live coding interviews |
| **Email Notifications** | Auto-send interview links (Nodemailer) |
| **Interview Recording** | Audio capture with server upload |
| **Resume on Reload** | Timer + transcript persist if candidate refreshes |
| **Mobile Responsive** | Works on all screen sizes |

## Tech Stack

```
Frontend:    Next.js 14  ·  TypeScript  ·  Tailwind CSS
AI:          Any OpenAI-compatible API (OpenAI, Anthropic, local models)
Speech:      Deepgram Nova-2 (STT) + Deepgram Aura (TTS)
             Edge TTS (free Indian voices, configurable)
Database:    PostgreSQL (8 tables, full schema migration)
Auth:        NextAuth.js with JWT strategy
Email:       Nodemailer (SMTP, Gmail compatible)
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL running locally
- Deepgram API key ([free at console.deepgram.com](https://console.deepgram.com))

### 1. Clone & Install

```bash
git clone https://github.com/vijaygupta18/ai-interview-platform.git
cd ai-interview-platform
npm install
```

### 2. Setup Database

```bash
psql -U postgres -c "CREATE DATABASE ai_interview_platform;"
psql -U postgres -d ai_interview_platform -f migrations/001_schema.sql
```

### 3. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys:

```env
DEEPGRAM_API_KEY=your_deepgram_key
AI_BASE_URL=https://api.openai.com
AI_API_KEY=your_api_key
DATABASE_URL=postgresql://postgres@localhost:5432/ai_interview_platform
NEXTAUTH_SECRET=generate-a-random-secret
NEXTAUTH_URL=http://localhost:3000
```

### 4. Start

```bash
npm run dev
```

Open http://localhost:3000 and login:
- **Email:** `admin@interview.ai`
- **Password:** `admin123`

## Pages

| Route | Access | Description |
|-------|--------|-------------|
| `/` | Auth | Dashboard — all interviews with filters, search, pagination |
| `/new` | Auth | Create new interview with resume, questions, context |
| `/questions` | Auth | Question bank management |
| `/compare` | Auth | Side-by-side candidate comparison |
| `/dashboard/[id]` | Auth | Interview detail — transcript, scorecard, photos, proctoring |
| `/review/[id]` | Auth | Scorecard review with score rings |
| `/login` | Public | Sign in |
| `/register` | Public | Create account + organization |
| `/interview/[id]` | Candidate | Live interview room (dark theme) |
| `/completed/[id]` | Candidate | Interview completed — thank you page |

## API Reference

### Interview Lifecycle
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/create-interview` | Create interview (FormData: resume, role, level, etc.) |
| `GET` | `/api/interview/[id]` | Get interview details |
| `POST` | `/api/interview/[id]/start` | Mark interview as started |
| `POST` | `/api/interview/[id]/end` | End interview + trigger auto-scoring |
| `GET` | `/api/interviews` | List all interviews (org-scoped) |

### AI & Speech
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/ai-speak` | Combined AI response + TTS audio (single call) |
| `POST` | `/api/ai-response` | AI response text only |
| `POST` | `/api/tts` | Text-to-speech only |
| `GET` | `/api/deepgram-token` | Temporary scoped STT token |

### Scoring & Proctoring
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/scorecard` | Generate/regenerate scorecard |
| `GET` | `/api/scoring-status/[id]` | Check scoring generation status |
| `POST` | `/api/proctor-event` | Log proctoring event + photo |

### Content
| Method | Route | Description |
|--------|-------|-------------|
| `GET/POST` | `/api/questions` | Question bank CRUD |
| `GET/PUT/DELETE` | `/api/questions/[id]` | Single question bank |
| `POST` | `/api/upload-recording` | Upload interview audio |
| `GET` | `/api/recording/[id]` | Stream recording |

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/[...nextauth]` | NextAuth login/session |
| `POST` | `/api/auth/register` | Create account |
| `GET` | `/api/health` | Health check |

## Database Schema

```sql
organizations          -- Multi-tenant orgs
users                  -- Interviewers (bcrypt passwords, org-scoped)
interviews             -- Core table (resume, config, status, scorecard, scoring_status)
transcript_entries     -- AI + candidate messages with timestamps
proctoring_events      -- Violations, photos, severity tracking
question_banks         -- Custom question sets per org/role
interview_rounds       -- Multi-round support
webhooks               -- Event notification URLs
```

Full migration: [`migrations/001_schema.sql`](migrations/001_schema.sql)

## TTS Voice Configuration

| Provider | Env Setting | Voice | Cost |
|----------|-------------|-------|------|
| **Deepgram Aura** (default) | `TTS_PROVIDER=deepgram` | `aura-angus-en` (Indian male) | $200 free credits |
| **Edge TTS** (free) | `TTS_PROVIDER=edge` | `en-IN-NeerjaNeural` (Indian female) | Completely free |

```env
TTS_PROVIDER=edge
EDGE_TTS_VOICE=en-IN-NeerjaNeural
EDGE_TTS_RATE=+10%
```

Available Indian voices: `en-IN-NeerjaNeural`, `en-IN-NeerjaExpressiveNeural`, `en-IN-PrabhatNeural`, `hi-IN-SwaraNeural`

## Interview Flow

```
1. Interviewer creates interview
   └─ Uploads resume, sets role/level/duration
   └─ Selects question bank (optional)
   └─ Adds context: test scores, hiring notes, coding problems
   └─ Gets shareable magic link

2. Candidate joins via link
   └─ Records consent (recording + proctoring)
   └─ System check: camera, mic, speaker, screen share
   └─ All 4 must pass before interview starts

3. Live interview
   └─ AI greets by name (extracted from resume)
   └─ Asks question bank questions first
   └─ Then probes resume experience
   └─ Then general role questions
   └─ Adapts difficulty to level (Intern ≠ Senior)
   └─ Proctoring runs continuously (face, eyes, tabs, phone)
   └─ Photos captured every 60 seconds
   └─ 4-strike system for violations

4. Interview ends (timer / manual / proctoring ban)
   └─ Candidate sees "Thank you" page immediately
   └─ Scorecard generates in background (3s delay for transcript sync)
   └─ DB-backed dedup prevents double scoring

5. Interviewer reviews
   └─ Dashboard: scores, verdict, transcript, photos, proctoring events
   └─ Compare candidates side-by-side
   └─ Rescore if needed
```

## Security

- Parameterized SQL queries (no injection)
- bcrypt password hashing (cost 12)
- JWT session strategy
- Temporary scoped Deepgram tokens (not main key)
- Interview token validation on API endpoints
- Path traversal protection (UUID validation)
- File size limits on uploads
- Rate limiting on critical endpoints
- DB-backed scoring dedup (survives server restart)
- No credentials in source code (`.env.local` gitignored)

## License

MIT

---

<p align="center">
  Built with Next.js, TypeScript, Tailwind CSS, PostgreSQL, and Deepgram
</p>
