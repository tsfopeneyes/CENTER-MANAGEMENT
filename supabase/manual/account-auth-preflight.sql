-- Read-only operator review. Does not return passwords, hashes, tokens,
-- phone numbers, emails, or raw logs. Does not change accounts or settings.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

WITH orphan_auth AS (
    SELECT a.id, a.created_at, a.last_sign_in_at,
        a.raw_app_meta_data->>'provider' AS provider,
        (SELECT count(*) FROM public.users u
         WHERE nullif(lower(btrim(to_jsonb(u)->>'email')), '') = nullif(lower(btrim(a.email)), ''))
         AS exact_email_candidates
    FROM auth.users a
    WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE a.id=u.id OR a.id=u.auth_user_id)
), recovery_profiles AS (
    SELECT u.id, u.name, u.user_group, u.status,
        EXISTS(SELECT 1 FROM auth.users a WHERE a.id=u.id OR a.id=u.auth_user_id) AS has_auth_link,
        nullif(to_jsonb(u)->>'phone', '') IS NOT NULL AS has_phone,
        nullif(to_jsonb(u)->>'phone_back4', '') IS NOT NULL AS has_phone_back4
    FROM public.users u
    WHERE nullif(u.password,'') IS NULL
      AND u.user_group NOT IN ('게스트','미가입')
      AND u.status IS DISTINCT FROM 'withdrawn'
), functions_to_review AS (
    SELECT n.nspname AS schema_name, p.proname AS function_name,
        pg_get_function_identity_arguments(p.oid) AS arguments,
        p.prosecdef AS security_definer,
        has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_can_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND (p.prosrc ILIKE '%password%' OR p.prosrc ILIKE '%auth.users%'
           OR p.proname IN ('legacy_login_sync','merge_guest_to_member','merge_duplicate_users'))
)
SELECT jsonb_build_object(
    'checked_at',now(),
    'read_only',current_setting('transaction_read_only'),
    'profiles',(SELECT count(*) FROM public.users),
    'auth_accounts',(SELECT count(*) FROM auth.users),
    'unlinked_auth_count',(SELECT count(*) FROM orphan_auth),
    'unlinked_auth',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id) FROM orphan_auth a),'[]'::jsonb),
    'recovery_profile_count',(SELECT count(*) FROM recovery_profiles),
    'recovery_profiles',coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.name,u.id) FROM recovery_profiles u),'[]'::jsonb),
    'functions_to_review',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.function_name,f.arguments) FROM functions_to_review f),'[]'::jsonb),
    'control_table_exists',to_regclass('public.account_auth_control') IS NOT NULL,
    'notes','Candidates are review evidence only. Never auto-link, delete, disable, or reset an account from this result. JWT lifetime must be verified separately in Auth settings and prior configuration history.'
) AS preflight;

ROLLBACK;
