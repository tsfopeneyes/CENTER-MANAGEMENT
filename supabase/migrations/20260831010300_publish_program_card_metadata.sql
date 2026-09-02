-- User approved images, short introduction, venue and capacity on scheduled
-- cards. Append only those fields; do not publish bodies, questions or JSON.
-- Existing notices, authentication, logs, and row-level policies are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE VIEW public.program_calendar_previews WITH (security_barrier = true) AS
SELECT id, title, category, created_at, is_sticky, is_recruiting,
    program_date, program_start_date, program_end_date, program_days,
    target_regions, is_private, is_challenge, program_status,
    recruitment_start_at, recruitment_deadline, recruitment_details_ready,
    true AS is_program_preview,
    images, to_jsonb(n)->>'image_url' AS image_url,
    short_description, program_location, max_capacity
FROM public.notices n
WHERE category = 'PROGRAM' AND recruitment_start_at IS NOT NULL
    AND coalesce(is_private, false) = false;
REVOKE ALL ON public.program_calendar_previews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.program_calendar_previews TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
