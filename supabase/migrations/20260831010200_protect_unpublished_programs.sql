-- Preserve original notice bodies and existing policies. Add restrictive rules
-- for timed programs and a deliberately limited public calendar projection.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Existing profile policies allow client edits. Therefore a client-editable
-- users.role/auth_user_id must not grant access to unpublished notice bodies.
CREATE SCHEMA IF NOT EXISTS calendar_private;
REVOKE ALL ON SCHEMA calendar_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA calendar_private TO service_role;
CREATE TABLE calendar_private.admin_identities (
    auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON calendar_private.admin_identities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_private.admin_identities TO service_role;
INSERT INTO calendar_private.admin_identities(auth_user_id)
SELECT DISTINCT a.id FROM auth.users a JOIN public.users u
    ON a.id = u.id OR a.id = u.auth_user_id
WHERE u.role = 'admin' OR u.user_group = '관리자'
ON CONFLICT DO NOTHING;
COMMENT ON TABLE calendar_private.admin_identities IS
    'Server-maintained calendar administrators. Provision/revoke with trusted backend credentials, never client-editable profile roles.';

CREATE OR REPLACE FUNCTION public.calendar_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, calendar_private
AS $$ SELECT EXISTS (SELECT 1 FROM calendar_private.admin_identities WHERE auth_user_id = auth.uid()); $$;
REVOKE ALL ON FUNCTION public.calendar_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calendar_is_admin() TO anon, authenticated, service_role;

-- Restrictive policies AND with all pre-existing permissive policies. Adding
-- another permissive SELECT policy would leave the original allow-all active.
CREATE POLICY calendar_program_body_read ON public.notices AS RESTRICTIVE
FOR SELECT TO anon, authenticated USING (
    public.calendar_is_admin()
    OR category IS DISTINCT FROM 'PROGRAM'
    OR is_recruiting IS DISTINCT FROM true
    OR recruitment_start_at IS NULL
    OR (recruitment_start_at <= statement_timestamp() AND recruitment_details_ready IS TRUE)
);

-- Prevent changing the time/category/readiness to bypass the read rule.
-- Legacy clients without start timestamps retain their existing write path.
CREATE POLICY calendar_program_write_insert ON public.notices AS RESTRICTIVE
FOR INSERT TO anon, authenticated WITH CHECK (
    recruitment_start_at IS NULL OR public.calendar_is_admin()
);
CREATE POLICY calendar_program_write_update ON public.notices AS RESTRICTIVE
FOR UPDATE TO anon, authenticated USING (
    recruitment_start_at IS NULL OR public.calendar_is_admin()
) WITH CHECK (
    recruitment_start_at IS NULL OR public.calendar_is_admin()
);
CREATE POLICY calendar_program_write_delete ON public.notices AS RESTRICTIVE
FOR DELETE TO anon, authenticated USING (
    recruitment_start_at IS NULL OR public.calendar_is_admin()
);

-- Owner-backed view intentionally bypasses the row-read policy only for this
-- explicit whitelist. No body, images, location, hosts, form questions, or JSON
-- properties can be selected, filtered, or joined out of this projection.
CREATE VIEW public.program_calendar_previews WITH (security_barrier = true) AS
SELECT id, title, category, created_at, is_sticky, is_recruiting,
    program_date, program_start_date, program_end_date, program_days,
    target_regions, is_private, is_challenge, program_status,
    recruitment_start_at, recruitment_deadline, recruitment_details_ready,
    true AS is_program_preview
FROM public.notices
WHERE category = 'PROGRAM' AND recruitment_start_at IS NOT NULL
    AND coalesce(is_private, false) = false;
REVOKE ALL ON public.program_calendar_previews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.program_calendar_previews TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
