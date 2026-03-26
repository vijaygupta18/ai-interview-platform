-- ============================================
-- InterviewAI - Database Schema
-- PostgreSQL 14+
-- Run: psql -U postgres -f migrations/001_schema.sql
-- ============================================

-- 0. Create database (run separately if needed)
-- CREATE DATABASE ai_interview_platform;
-- \c ai_interview_platform

-- ============================================
-- 1. Organizations
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. Users (Interviewers / Admins)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'interviewer',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- 3. Interviews
-- ============================================
CREATE TABLE IF NOT EXISTS interviews (
    id UUID PRIMARY KEY,
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Candidate info
    candidate_email VARCHAR(255),
    resume TEXT,
    resume_file_name VARCHAR(255),

    -- Interview config
    role VARCHAR(255) NOT NULL,
    level VARCHAR(50) NOT NULL,
    focus_areas TEXT[] DEFAULT '{}',
    duration INTEGER NOT NULL DEFAULT 30,
    round_type VARCHAR(50) DEFAULT 'General',
    round_number INTEGER DEFAULT 1,
    language VARCHAR(20) DEFAULT 'en',

    -- Security
    token VARCHAR(255) NOT NULL,
    browser_fingerprint VARCHAR(255),

    -- Status & timing
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    -- Results
    scorecard JSONB,
    scoring_status VARCHAR(20),       -- NULL, generating, completed, failed
    scoring_started_at TIMESTAMPTZ,
    recording_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_interviews_org ON interviews(org_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(status);
CREATE INDEX IF NOT EXISTS idx_interviews_email ON interviews(candidate_email);
CREATE INDEX IF NOT EXISTS idx_interviews_created ON interviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interviews_token ON interviews(token);

-- ============================================
-- 4. Transcript Entries
-- ============================================
CREATE TABLE IF NOT EXISTS transcript_entries (
    id SERIAL PRIMARY KEY,
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,  -- 'ai' or 'candidate'
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcript_interview ON transcript_entries(interview_id);
CREATE INDEX IF NOT EXISTS idx_transcript_order ON transcript_entries(interview_id, id ASC);

-- ============================================
-- 5. Proctoring Events
-- ============================================
CREATE TABLE IF NOT EXISTS proctoring_events (
    id SERIAL PRIMARY KEY,
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,       -- face_missing, tab_switch, eye_away, multiple_faces, phone_detected, photo_capture, copy_paste, screen_share_stopped
    severity VARCHAR(20) NOT NULL,   -- flag, warning, info
    message TEXT NOT NULL,
    photo TEXT,                       -- base64 encoded JPEG for photo captures
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proctoring_interview ON proctoring_events(interview_id);
CREATE INDEX IF NOT EXISTS idx_proctoring_type ON proctoring_events(interview_id, type);

-- ============================================
-- 6. Question Banks
-- ============================================
CREATE TABLE IF NOT EXISTS question_banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255),
    level VARCHAR(50),
    round_type VARCHAR(50) DEFAULT 'General',
    questions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_banks_org ON question_banks(org_id);

-- ============================================
-- 7. Interview Rounds (multi-round support)
-- ============================================
CREATE TABLE IF NOT EXISTS interview_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    round_type VARCHAR(50) NOT NULL,
    round_number INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    scorecard JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rounds_interview ON interview_rounds(interview_id);

-- ============================================
-- 8. Webhooks
-- ============================================
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] DEFAULT '{}',    -- interview.created, interview.completed, scorecard.generated
    secret VARCHAR(255),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(org_id);

-- ============================================
-- 9. Seed Data
-- ============================================

-- Default organization
INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'NammaYatri', 'nammayatri')
ON CONFLICT (id) DO NOTHING;

-- Default admin user (password: admin123)
-- Generate hash: node -e "console.log(require('bcryptjs').hashSync('admin123', 10))"
INSERT INTO users (id, org_id, email, name, password_hash, role)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'admin@interview.ai',
    'Admin',
    '$2b$10$4KglSvNZZuvTkaIFQVQp3.dzDUbNYICWmi20rh//9BarDIygl73w2',
    'admin'
)
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- Done!
-- Login: admin@interview.ai / admin123
-- ============================================
