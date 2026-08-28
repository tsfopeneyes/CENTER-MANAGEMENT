-- Server-side storage for TSF Slack confirmation drafts.
-- Keeps long Notion report drafts out of Slack button payloads.
CREATE TABLE IF NOT EXISTS public.tsf_pending_actions (
  id UUID PRIMARY KEY,
  action JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS tsf_pending_actions_expires_at_idx
  ON public.tsf_pending_actions (expires_at);

ALTER TABLE public.tsf_pending_actions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
