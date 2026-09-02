BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT jsonb_build_object(
'tables',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'rls',c.relrowsecurity,
'anon_select',has_table_privilege('anon',c.oid,'SELECT'),'anon_insert',has_table_privilege('anon',c.oid,'INSERT'),
'anon_update',has_table_privilege('anon',c.oid,'UPDATE'),'anon_delete',has_table_privilege('anon',c.oid,'DELETE'),
'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),
'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE'))
ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p')),
'policies',(SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,
'roles',roles,'command',cmd,'permissive',permissive,'using',qual,'check',with_check) ORDER BY tablename,policyname)
FROM pg_policies WHERE schemaname IN ('public','storage')),
'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),
'definer',p.prosecdef,'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')) ORDER BY p.proname)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND
(p.prosecdef OR p.proname IN ('get_login_candidates','legacy_login_sync','merge_duplicate_users','merge_guest_to_member','upgrade_guest_account'))),
'views',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'options',c.reloptions,'anon_select',has_table_privilege('anon',c.oid,'SELECT')))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v')
) AS security_inventory;
ROLLBACK;
