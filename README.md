<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.4-blue?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=for-the-badge&logo=tailwindcss" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql" />
  <img src="https://img.shields.io/badge/Deepgram-STT%2FTTS-13EF93?style=for-the-badge" />
</p>

<h1 align="center">
  <br>
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=800&size=40&duration=3000&pause=1000&color=4F46E5&center=true&vCenter=true&random=false&width=600&height=60&lines=InterviewAI;AI+Voice+Interviews;Automated+Scoring;Real-time+Proctoring" alt="InterviewAI" />
</h1>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=400&size=16&duration=4000&pause=2000&color=6B7280&center=true&vCenter=true&random=false&width=600&height=30&lines=AI-powered+voice+%26+video+interview+platform;Real-time+proctoring+%7C+Automated+scoring+%7C+Multi-tenant;Works+with+any+OpenAI-compatible+API" alt="Typing SVG" />
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &nbsp;&middot;&nbsp;
  <a href="#-features">Features</a> &nbsp;&middot;&nbsp;
  <a href="#-how-it-works">How It Works</a> &nbsp;&middot;&nbsp;
  <a href="#-architecture">Architecture</a> &nbsp;&middot;&nbsp;
  <a href="#-api-reference">API Reference</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/Status-Production%20Ready-blue?style=flat-square" />
</p>

---

## How It Works — Animated

<p align="center">
  <img src="docs/flow.svg" alt="InterviewAI Flow" width="100%" />
</p>

---

## Features at a Glance

<table>
<tr>
<td width="50%">

### Voice Interview Engine
- AI conducts natural voice conversations
- Deepgram Nova-2 STT (real-time, Indian English)
- Deepgram Aura TTS (primary) + Edge TTS (free fallback)
- Domain-aware: Tech, HR, Sales, Ops, CX, PM, Design, Data, Finance
- Level-calibrated: Intern to Director
- Time-aware pacing (adapts to interview duration)
- Custom question banks
- Resume-based follow-ups

</td>
<td width="50%">

### Proctoring & Integrity
- Face detection (Chrome API + canvas fallback)
- Eye tracking (gaze direction)
- Window/app switch detection (3 methods: blur + visibility + focus poll)
- Phone/device detection (bright object analysis)
- Mandatory screen sharing + fullscreen enforcement
- Periodic photo capture (every 60s)
- Configurable strike system (default 10, server-side count)
- Copy/paste blocking

</td>
</tr>
<tr>
<td width="50%">

### Scoring & Analytics
- Auto-scorecard when interview ends
- 5 dimensions (Technical, Communication, Problem Solving, Domain, Culture)
- Evidence-based (exact candidate quotes)
- Level-calibrated scoring (Intern to Director)
- STT-aware evaluation (ignores transcription errors)
- Hire / No Hire recommendation
- Proctoring report in assessment
- Candidate comparison (radar chart)
- DB-backed dedup (no double scoring)
- Rescore capability

</td>
<td width="50%">

### Platform
- Multi-tenant auth (orgs, roles)
- Professional dashboard with filters
- Pagination with ellipsis
- Question bank management
- Coding interview mode (Monaco editor)
- Email notifications
- Interview recording
- Resume on reload (state persists)
- Mobile responsive
- Docker ready

</td>
</tr>
</table>

---

## Quick Start

### One-command setup

```bash
# Clone
git clone https://github.com/vijaygupta18/ai-interview-platform.git
cd ai-interview-platform

# Install
npm install

# Setup database
psql -U postgres -c "CREATE DATABASE ai_interview_platform;"
psql -U postgres -d ai_interview_platform -f migrations/001_schema.sql

# Configure (edit with your API keys)
cp .env.example .env.local

# Start
npm run dev
```

Open http://localhost:3000 and login with `admin@interview.ai` / `admin123`

### Docker

```bash
docker build -t interview-ai .
docker run -p 3000:3000 --env-file .env.local interview-ai
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | Random secret for JWT signing |
| `NEXTAUTH_URL` | Yes | App URL (http://localhost:3000) |
| `AI_BASE_URL` | Yes | OpenAI-compatible API base URL |
| `AI_API_KEY` | Yes | API key for AI model |
| `AI_MODEL` | No | Model name (default: `gpt-4o`) |
| `DEEPGRAM_API_KEY` | Yes | Deepgram API key for STT/TTS |
| `TTS_PROVIDER` | No | `deepgram` (default) or `edge` (free) |
| `EDGE_TTS_VOICE` | No | Voice ID (default: `en-IN-NeerjaNeural`) |
| `EDGE_TTS_RATE` | No | Speed (default: `+10%`) |
| `SMTP_HOST` | No | Email SMTP host |
| `SMTP_PORT` | No | Email SMTP port |
| `SMTP_USER` | No | Email username |
| `SMTP_PASS` | No | Email password |

### Supported AI Providers

Works with **any OpenAI-compatible API**:

| Provider | `AI_BASE_URL` | `AI_MODEL` |
|----------|---------------|------------|
| OpenAI | `https://api.openai.com` | `gpt-4o`, `gpt-4o-mini` |
| Anthropic (via proxy) | Your proxy URL | `claude-3-5-sonnet` |
| Groq | `https://api.groq.com/openai` | `llama-3.1-70b` |
| Together AI | `https://api.together.xyz` | `meta-llama/Llama-3-70b` |
| Local (Ollama) | `http://localhost:11434` | `llama3` |
| Any OpenAI-compatible | Your endpoint | Your model |

---

## Pages

| Route | Who | Description |
|-------|-----|-------------|
| `/` | Interviewer | Dashboard — interviews, filters, pagination, scoring |
| `/new` | Interviewer | Create interview — resume, questions, context |
| `/questions` | Interviewer | Question bank management |
| `/compare` | Interviewer | Side-by-side candidate comparison |
| `/dashboard/[id]` | Interviewer | Detail — transcript, scores, photos, proctoring |
| `/review/[id]` | Interviewer | Scorecard with score rings |
| `/login` | Public | Sign in |
| `/register` | Public | Create account + org |
| `/interview/[id]` | Candidate | Live interview room (dark theme) |
| `/completed/[id]` | Candidate | Thank you page |

---

## API Reference

<details>
<summary><strong>Interview Lifecycle</strong></summary>

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/api/create-interview` | Session | Create interview (FormData) |
| `GET` | `/api/interview/[id]` | Session/Token | Get interview details |
| `POST` | `/api/interview/[id]/start` | Token | Mark started |
| `POST` | `/api/interview/[id]/end` | Token | End + auto-score |
| `GET` | `/api/interviews` | Session | List all (org-scoped) |

</details>

<details>
<summary><strong>AI & Speech</strong></summary>

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/ai-speak` | Combined AI response + TTS audio |
| `POST` | `/api/ai-response` | AI response text only |
| `POST` | `/api/tts` | Text-to-speech |
| `GET` | `/api/deepgram-token` | Temporary scoped STT token |

</details>

<details>
<summary><strong>Scoring & Proctoring</strong></summary>

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/scorecard` | Generate/regenerate scorecard |
| `GET` | `/api/scoring-status/[id]` | Check generation status |
| `POST` | `/api/proctor-event` | Log event + photo |

</details>

<details>
<summary><strong>Content & Auth</strong></summary>

| Method | Route | Description |
|--------|-------|-------------|
| `GET/POST` | `/api/questions` | Question bank CRUD |
| `GET/PUT/DELETE` | `/api/questions/[id]` | Single question bank |
| `POST` | `/api/upload-recording` | Upload audio |
| `GET` | `/api/recording/[id]` | Stream recording |
| `POST` | `/api/auth/register` | Create account |
| `GET` | `/api/health` | Health check |

</details>

---

## Database

8 tables — full schema in [`migrations/001_schema.sql`](migrations/001_schema.sql):

```
organizations ─────── users
       │                 │
       │                 │ (created_by)
       │                 │
       └──── interviews ─┤
              │          │
              │          ├── transcript_entries
              │          ├── proctoring_events (+ photos)
              │          └── interview_rounds
              │
              └── question_banks

webhooks (org-scoped event notifications)
```

---

## TTS Voice Configuration

| Provider | Setting | Voice | Cost |
|----------|---------|-------|------|
| Deepgram Aura | `TTS_PROVIDER=deepgram` | `aura-angus-en` (Indian male) | $200 free credits |
| Edge TTS | `TTS_PROVIDER=edge` | `en-IN-NeerjaNeural` (Indian female) | **Free forever** |

Indian voices available with Edge TTS:
- `en-IN-NeerjaNeural` — Professional female
- `en-IN-NeerjaExpressiveNeural` — Animated female
- `en-IN-PrabhatNeural` — Professional male
- `hi-IN-SwaraNeural` — Hindi accent female

---

## Security

| Protection | Implementation |
|------------|----------------|
| SQL Injection | Parameterized queries (`$1`, `$2`) everywhere |
| Auth | NextAuth JWT + token validation on all endpoints |
| Password | bcrypt (cost 12) + min 8 chars server-side |
| API Keys | Temporary scoped tokens, no main key leak |
| File Upload | 10MB limit + MIME type validation |
| Path Traversal | UUID regex validation on file paths |
| XSS | HTML-escaped email templates |
| Command Injection | `execFileSync` with array args (no shell) |
| Rate Limiting | Per-IP limits on critical endpoints |
| Scoring Dedup | DB-backed atomic lock (survives restart) |
| Tenant Isolation | Org-scoped queries on all data |

---

## License

MIT

---

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Inter&weight=500&size=14&duration=3000&pause=1000&color=9CA3AF&center=true&vCenter=true&random=false&width=400&height=25&lines=Built+with+Next.js+%2B+TypeScript+%2B+PostgreSQL;Open+source+%7C+MIT+License;Star+%E2%AD%90+if+you+find+this+useful!" alt="Footer" />
</p>
