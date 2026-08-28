-- Repair additive columns expected by the current application.
-- All changes are non-destructive and preserve existing records.

-- Distinguish check-in and check-out surveys while retaining legacy rows.
ALTER TABLE public.checkin_surveys
  ADD COLUMN IF NOT EXISTS survey_type TEXT NOT NULL DEFAULT 'CHECKIN',
  ADD COLUMN IF NOT EXISTS mode TEXT,
  ADD COLUMN IF NOT EXISTS text_answer TEXT;

-- Support notices with multiple hosts.
ALTER TABLE public.notices
  ADD COLUMN IF NOT EXISTS host_ids UUID[] DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
