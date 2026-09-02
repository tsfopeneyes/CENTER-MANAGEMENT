-- User-approved list. Requires verified encrypted backup + account table restore.
-- No public profile, raw log, schema, or storage object is deleted.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
LOCK TABLE public.users, auth.users IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE reviewed_auth_ids(id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO reviewed_auth_ids VALUES
('0b03411d-2e6c-4e03-bb74-5a2326b15377'),('0c66eb5a-b9a4-486c-8671-0770b12771e1'),
('1e673354-1952-457f-9831-4efc63399de6'),('296ae13d-b794-46d0-b3f3-f1d7cc58beec'),
('400c7a4c-4a69-48da-aa83-8caaec958db2'),('8420b99b-f962-4b9c-b4ae-79fa21a15d28'),
('9f9ec59e-db4f-4c7d-abf6-8a35168373ef'),('bb6f79f7-f45b-4354-90ee-e64e762669bf'),
('c100e544-1d97-4c69-a5f4-f6df47eb2462'),('c2d013ad-113a-4501-b111-296b56be66a0'),
('c3c8bc8a-165d-4c23-997b-2f3bac3cdc56'),('f64782d6-dd5a-4f13-a792-6a3d50ec7359');
DO $$
DECLARE r record; before_hash text; after_hash text; deleted_count integer;
        baseline jsonb := '{}'::jsonb;
BEGIN
 IF (SELECT count(*) FROM auth.users a JOIN reviewed_auth_ids t USING(id)) <> 12
 OR (SELECT count(*) FROM auth.users) <> 227
 OR (SELECT count(*) FROM public.users) <> 278 THEN RAISE EXCEPTION 'Account baseline changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.users u JOIN reviewed_auth_ids t ON u.id=t.id OR u.auth_user_id=t.id)
 OR EXISTS(SELECT 1 FROM calendar_private.admin_identities a JOIN reviewed_auth_ids t ON a.auth_user_id=t.id)
 OR EXISTS(SELECT 1 FROM storage.objects s JOIN reviewed_auth_ids t
   ON to_jsonb(s)->>'owner'=t.id::text OR to_jsonb(s)->>'owner_id'=t.id::text)
 THEN RAISE EXCEPTION 'Account has a profile, admin role, or stored files'; END IF;
 -- Refuse new external cascades or custom triggers anywhere in the dependency tree.
 IF EXISTS(WITH RECURSIVE deps(rel) AS (SELECT 'auth.users'::regclass::oid UNION
   SELECT c.conrelid FROM pg_constraint c JOIN deps d ON c.confrelid=d.rel WHERE c.contype='f')
   SELECT 1 FROM deps d JOIN pg_class c ON c.oid=d.rel JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE (n.nspname <> 'auth' AND d.rel <> 'calendar_private.admin_identities'::regclass)
      OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=d.rel AND NOT t.tgisinternal))
 THEN RAISE EXCEPTION 'Unreviewed deletion dependency'; END IF;
 -- Keep a transaction-local content fingerprint of all application/raw-log tables.
 FOR r IN SELECT c.oid::regclass AS rel FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN('public','storage','calendar_private') AND c.relkind IN('r','p') LOOP
   EXECUTE format('SELECT md5(coalesce(string_agg(h, '''' ORDER BY h), '''')) FROM (SELECT md5(to_jsonb(x)::text) h FROM %s x) q',r.rel) INTO before_hash;
   baseline := baseline || jsonb_build_object(r.rel::text,before_hash);
 END LOOP;
 DELETE FROM auth.users a USING reviewed_auth_ids t WHERE a.id=t.id;
 GET DIAGNOSTICS deleted_count = ROW_COUNT;
 IF deleted_count <> 12 THEN RAISE EXCEPTION 'Unexpected deletion count'; END IF;
 FOR r IN SELECT key AS rel, value AS hash FROM jsonb_each_text(baseline) LOOP
   EXECUTE format('SELECT md5(coalesce(string_agg(h, '''' ORDER BY h), '''')) FROM (SELECT md5(to_jsonb(x)::text) h FROM %s x) q',r.rel::regclass) INTO after_hash;
   IF after_hash IS DISTINCT FROM r.hash THEN RAISE EXCEPTION 'Application data changed; rolling back'; END IF;
 END LOOP;
END $$;
SELECT (SELECT count(*) FROM public.users) AS preserved_profiles,
       (SELECT count(*) FROM auth.users) AS remaining_auth,
       (SELECT count(*) FROM auth.users a JOIN reviewed_auth_ids t USING(id)) AS remaining_targets;
COMMIT;
