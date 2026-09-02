-- Follow-up read-only audit. No account IDs, passwords or contact details.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT jsonb_build_object(
    'unmapped_auth_breakdown', (SELECT jsonb_build_object(
        'total',count(*),
        'anonymous',count(*) FILTER(WHERE coalesce(to_jsonb(a)->>'is_anonymous','false')='true'),
        'never_signed_in',count(*) FILTER(WHERE a.last_sign_in_at IS NULL),
        'trusted_admin',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM calendar_private.admin_identities t WHERE t.auth_user_id=a.id)),
        'metadata_matches_existing_profile',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.users u WHERE u.id::text=coalesce(a.raw_user_meta_data->>'profile_id',a.raw_user_meta_data->>'user_id')))
    ) FROM auth.users a WHERE NOT EXISTS(SELECT 1 FROM public.users u WHERE a.id=u.id OR a.id=u.auth_user_id)),
    'blank_password_members', (SELECT jsonb_agg(t) FROM (
        SELECT u.user_group,u.role,u.status,count(*) AS count,
            count(a.id) AS linked_auth,
            count(*) FILTER(WHERE EXISTS(SELECT 1 FROM calendar_private.admin_identities admin WHERE admin.auth_user_id=a.id)) AS trusted_admin
        FROM public.users u LEFT JOIN auth.users a ON a.id=coalesce(u.auth_user_id,u.id)
        WHERE nullif(u.password,'') IS NULL AND u.user_group NOT IN ('게스트','미가입') AND u.status IS DISTINCT FROM 'withdrawn'
        GROUP BY u.user_group,u.role,u.status
    ) t),
    'function_source_with_literals_redacted', (SELECT jsonb_agg(jsonb_build_object('name',p.proname,
        'source',regexp_replace(p.prosrc, '''([^'']|'''')*''', '''[literal]''', 'g')))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
            AND p.proname IN ('legacy_login_sync','merge_guest_to_member','merge_duplicate_users'))
) AS account_auth_risk_review;
COMMIT;
