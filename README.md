# InterviewAI

AI-powered voice and video interview platform with real-time proctoring, automated scoring, and candidate management.

## Features

- **AI Voice Interviewer** - Conducts live interviews using speech-to-text and text-to-speech
- **Video Proctoring** - Face detection, eye tracking, tab switching, copy-paste blocking
- **Auto Scoring** - AI generates detailed scorecards with per-dimension scores and evidence
- **Question Banks** - Create custom question sets per role and level
- **Coding Interviews** - Monaco editor for live coding rounds
- **Candidate Comparison** - Side-by-side radar chart comparison
- **Multi-tenant Auth** - Organizations, teams, role-based access
- **Interview Recording** - Audio recording with playback
- **Email Notifications** - Auto-send interview links to candidates

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **AI**: Juspay AI (kimi-latest) via OpenAI-compatible API
- **Speech**: Deepgram (STT + TTS) / Edge TTS (free Indian voices)
- **Database**: PostgreSQL
- **Auth**: NextAuth.js with JWT

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL running locally
- Deepgram API key (free at console.deepgram.com)
- AI API access (Juspay AI or any OpenAI-compatible endpoint)

### Setup

```bash
# Clone
git clone https://github.com/vijaygupta18/ai-interview-platform.git
cd ai-interview-platform

# Install
npm install

# Create database
psql -U postgres -c "CREATE DATABASE ai_interview_platform;"

# Run migrations (create tables)
psql -U postgres -d ai_interview_platform -f schema.sql

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Start
npm run dev
```

### Environment Variables

```env
# Required
DEEPGRAM_API_KEY=your_deepgram_key
JUSPAY_AI_BASE_URL=https://your-ai-endpoint
JUSPAY_AI_API_KEY=your_ai_key
JUSPAY_AI_MODEL=kimi-latest
DATABASE_URL=postgresql://postgres@localhost:5432/ai_interview_platform
NEXTAUTH_SECRET=generate-a-random-secret
NEXTAUTH_URL=http://localhost:3000

# TTS Provider: "deepgram" or "edge" (free)
TTS_PROVIDER=deepgram
EDGE_TTS_VOICE=en-IN-NeerjaNeural
EDGE_TTS_RATE=+10%

# Optional - Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

### Default Login

- Email: `admin@interview.ai`
- Password: `admin123`

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard - all interviews with filters and pagination |
| `/new` | Create new interview |
| `/interview/[id]` | Live interview room (candidate-facing) |
| `/completed/[id]` | Interview completed page (candidate-facing) |
| `/dashboard/[id]` | Candidate detail view |
| `/review/[id]` | Scorecard review |
| `/questions` | Question bank management |
| `/compare` | Candidate comparison |
| `/login` | Sign in |
| `/register` | Create account |

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/create-interview` | Create interview with resume upload |
| POST | `/api/ai-speak` | Combined AI response + TTS audio |
| POST | `/api/ai-response` | AI response (text only) |
| POST | `/api/tts` | Text-to-speech |
| GET | `/api/deepgram-token` | Temporary STT token |
| GET | `/api/interviews` | List all interviews |
| GET | `/api/interview/[id]` | Get interview details |
| POST | `/api/interview/[id]/start` | Mark interview started |
| POST | `/api/interview/[id]/end` | End interview + auto-score |
| POST | `/api/scorecard` | Generate/regenerate scorecard |
| POST | `/api/proctor-event` | Log proctoring event |
| GET/POST | `/api/questions` | Question bank CRUD |
| POST | `/api/upload-recording` | Upload interview recording |
| GET | `/api/recording/[id]` | Stream recording |

## License

MIT
