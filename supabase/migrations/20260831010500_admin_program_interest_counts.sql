-- Administrator-only aggregate. No raw opt-ins, identities or device tokens
-- are exposed, and no existing table, policy or record is modified.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE VIEW public.admin_program_interest_counts WITH (security_barrier=true) AS
SELECT n.id AS notice_id, count(i.id)::bigint AS interest_count
FROM public.notices n
LEFT JOIN public.program_recruitment_interests i ON i.notice_id=n.id AND i.enabled=true
WHERE n.category='PROGRAM' AND public.calendar_is_admin()
GROUP BY n.id;
REVOKE ALL ON public.admin_program_interest_counts FROM PUBLIC, anon;
GRANT SELECT ON public.admin_program_interest_counts TO authenticated;
COMMENT ON VIEW public.admin_program_interest_counts IS
    'Active opt-ins per program for server-registered calendar administrators only. Cancellation excluded; one account counted once.';
NOTIFY pgrst, 'reload schema';
COMMIT;
