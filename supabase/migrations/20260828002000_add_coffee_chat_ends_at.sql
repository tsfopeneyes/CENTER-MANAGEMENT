ALTER TABLE public.coffee_chats
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;

-- Existing accepted chats previously used accepted_at as their 30-minute
-- expiry reference. Preserve that duration before using a separate end time.
UPDATE public.coffee_chats
SET ends_at = accepted_at + INTERVAL '30 minutes'
WHERE status = 'ACCEPTED'
  AND accepted_at IS NOT NULL
  AND ends_at IS NULL;

CREATE INDEX IF NOT EXISTS coffee_chats_active_end_idx
  ON public.coffee_chats (staff_id, ends_at)
  WHERE status = 'ACCEPTED';
