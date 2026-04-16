-- Add org-level AI settings (persona, scoring thresholds, custom behavior prompts)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_settings JSONB DEFAULT '{}'::jsonb;
