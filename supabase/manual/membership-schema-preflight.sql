-- READ ONLY. No user data/passwords, writes, DDL, function bodies or environment keys.
-- Results require review; this script does NOT authorize activation.
SELECT column_name,data_type,is_nullable,column_default IS NOT NULL AS has_default
FROM information_schema.columns WHERE table_schema='public' AND table_name='users'
ORDER BY ordinal_position;
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='users';
SELECT conname,contype,convalidated FROM pg_constraint WHERE conrelid='public.users'::regclass;
SELECT t.tgname,t.tgenabled,p.proname,p.prosecdef
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.users'::regclass AND NOT t.tgisinternal;
SELECT policyname,permissive,roles,cmd FROM pg_policies WHERE schemaname='public' AND tablename='users';
SELECT grantee,privilege_type FROM information_schema.table_privileges
WHERE table_schema='public' AND table_name='users' ORDER BY grantee,privilege_type;
