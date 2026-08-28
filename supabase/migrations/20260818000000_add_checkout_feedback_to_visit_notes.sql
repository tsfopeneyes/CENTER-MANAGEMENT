-- Store checkout-survey responses separately from check-in purpose and remarks.
-- This is additive and preserves all existing visit notes.
ALTER TABLE public.visit_notes
  ADD COLUMN IF NOT EXISTS checkout_feedback TEXT;

-- Ask PostgREST to refresh its schema cache immediately after the migration.
NOTIFY pgrst, 'reload schema';
