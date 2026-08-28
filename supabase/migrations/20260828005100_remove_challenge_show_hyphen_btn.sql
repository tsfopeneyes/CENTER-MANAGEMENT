-- Phase 2: all deployed clients now use challenge_show_haifn_btn.
-- Remove compatibility objects only after the final app deployment is verified.
DROP TRIGGER IF EXISTS trg_sync_challenge_show_haifn_btn ON public.notices;
DROP FUNCTION IF EXISTS public.sync_challenge_show_haifn_btn();

ALTER TABLE public.notices
DROP COLUMN IF EXISTS challenge_show_hyphen_btn;
