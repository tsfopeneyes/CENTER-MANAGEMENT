-- Explicitly approved duplicate identities only. Public member IDs and all
-- activity records remain unchanged. Run a ROLLBACK rehearsal before COMMIT.
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='45s';
CREATE TEMP TABLE merge_pairs(old_id uuid PRIMARY KEY,keep_id uuid UNIQUE) ON COMMIT DROP;
INSERT INTO merge_pairs VALUES
 ('a8f7c051-a58b-46ce-9bea-065328dc64d7','cdf22c49-c96e-4f64-b808-4397035ff578'),
 ('769f9e8b-02f5-41d5-9560-e897aa3be299','fbedb0e0-958c-4e79-a7fd-505737b5216b');
SELECT a.id FROM auth.users a WHERE a.id IN(SELECT old_id FROM merge_pairs UNION SELECT keep_id FROM merge_pairs) FOR UPDATE;
SELECT u.id FROM public.users u JOIN merge_pairs p ON p.old_id=u.id FOR UPDATE OF u;
DO $$
DECLARE r record; baseline jsonb:='{}'; fingerprint text; changes integer;
        keep_accounts jsonb; expected_storage jsonb;
BEGIN
 IF (SELECT count(*) FROM auth.users)<>215 OR (SELECT count(*) FROM public.users)<>278
 OR (SELECT count(*) FROM auth.users a JOIN merge_pairs p ON a.id=p.old_id OR a.id=p.keep_id)<>4
 OR (SELECT count(*) FROM public.users u JOIN merge_pairs p ON u.id=p.old_id AND u.auth_user_id=p.keep_id)<>2
 THEN RAISE EXCEPTION 'Baseline changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.users u JOIN merge_pairs p ON u.auth_user_id=p.old_id)
 OR EXISTS(SELECT 1 FROM auth.users a JOIN merge_pairs p ON a.id=p.old_id WHERE a.updated_at>'2026-08-31T08:00:34.370Z')
 OR EXISTS(SELECT 1 FROM auth.identities a JOIN merge_pairs p ON a.user_id=p.old_id WHERE a.provider<>'email')
 OR EXISTS(SELECT 1 FROM auth.mfa_factors a JOIN merge_pairs p ON a.user_id=p.old_id)
 OR EXISTS(SELECT 1 FROM auth.webauthn_credentials a JOIN merge_pairs p ON a.user_id=p.old_id)
 OR EXISTS(SELECT 1 FROM auth.oauth_authorizations a JOIN merge_pairs p ON a.user_id=p.old_id)
 OR EXISTS(SELECT 1 FROM auth.oauth_consents a JOIN merge_pairs p ON a.user_id=p.old_id)
 OR EXISTS(SELECT 1 FROM public.program_recruitment_interests i JOIN merge_pairs p ON i.auth_user_id=p.old_id)
 THEN RAISE EXCEPTION 'Unreviewed identity dependency'; END IF;
 IF EXISTS(WITH RECURSIVE deps(rel) AS (SELECT 'auth.users'::regclass::oid UNION
   SELECT c.conrelid FROM pg_constraint c JOIN deps d ON c.confrelid=d.rel WHERE c.contype='f')
   SELECT 1 FROM deps d JOIN pg_class c ON c.oid=d.rel JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE (n.nspname<>'auth' AND d.rel NOT IN ('calendar_private.admin_identities'::regclass,'public.program_recruitment_interests'::regclass))
   OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=d.rel AND NOT t.tgisinternal AND d.rel<>'public.program_recruitment_interests'::regclass))
 THEN RAISE EXCEPTION 'Unreviewed cascade or trigger'; END IF;
 IF (SELECT count(*) FROM calendar_private.admin_identities WHERE auth_user_id='cdf22c49-c96e-4f64-b808-4397035ff578')<>1
 OR (SELECT count(*) FROM calendar_private.admin_identities c JOIN merge_pairs p ON c.auth_user_id=p.old_id)<>1
 THEN RAISE EXCEPTION 'Admin baseline changed'; END IF;
 IF (SELECT count(*) FROM storage.objects s JOIN merge_pairs p ON s.owner=p.old_id OR s.owner_id=p.old_id::text)<>4
 OR EXISTS(SELECT 1 FROM storage.objects s JOIN merge_pairs p ON s.owner=p.old_id OR s.owner_id=p.old_id::text
   WHERE p.old_id<>'a8f7c051-a58b-46ce-9bea-065328dc64d7' OR (s.bucket_id,s.name) NOT IN (
    ('avatars','rentals/1782808425337_20260630_173028.jpg'),('avatars','rentals/1782808439659_20260630_173104.jpg'),
    ('notice-images','0.051213765722119.png'),('notice-images','0.6327318799376851.png')))
 THEN RAISE EXCEPTION 'Storage scope changed'; END IF;
 -- Do not overlook less common Storage ownership references.
 FOR r IN SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='storage'
   AND table_name<>'objects' AND column_name IN('owner','owner_id') LOOP
   EXECUTE format('SELECT count(*) FROM storage.%I x JOIN merge_pairs p ON x.%I::text=p.old_id::text',r.table_name,r.column_name) INTO changes;
   IF changes<>0 THEN RAISE EXCEPTION 'Other storage ownership requires review'; END IF;
 END LOOP;
 SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) INTO keep_accounts FROM auth.users a JOIN merge_pairs p ON a.id=p.keep_id;
 SELECT jsonb_agg((to_jsonb(s)-'updated_at') || CASE WHEN p.old_id IS NOT NULL
    THEN jsonb_build_object('owner',p.keep_id,'owner_id',p.keep_id::text) ELSE '{}'::jsonb END ORDER BY s.id)
 INTO expected_storage FROM storage.objects s LEFT JOIN merge_pairs p ON s.owner=p.old_id OR s.owner_id=p.old_id::text;
 -- Exact content fingerprints: no member/attendance/application/raw-log edits.
 FOR r IN SELECT c.oid::regclass AS rel FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN('public','storage','calendar_private') AND c.relkind IN('r','p')
      AND c.oid NOT IN ('storage.objects'::regclass,'calendar_private.admin_identities'::regclass) LOOP
   EXECUTE format('SELECT md5(coalesce(string_agg(h, '''' ORDER BY h), '''')) FROM (SELECT md5(to_jsonb(x)::text) h FROM %s x) q',r.rel) INTO fingerprint;
   baseline:=baseline||jsonb_build_object(r.rel::text,fingerprint);
 END LOOP;
 -- Metadata-only owner reassignment. No upload/delete/move, path, version,
 -- object ID or object bytes are changed. Updated-at trigger may advance.
 UPDATE storage.objects s SET owner=p.keep_id,owner_id=p.keep_id::text FROM merge_pairs p
 WHERE s.owner=p.old_id OR s.owner_id=p.old_id::text;
 GET DIAGNOSTICS changes=ROW_COUNT;
 IF changes<>4 THEN RAISE EXCEPTION 'Wrong storage update count'; END IF;
 DELETE FROM auth.users a USING merge_pairs p WHERE a.id=p.old_id;
 GET DIAGNOSTICS changes=ROW_COUNT;
 IF changes<>2 THEN RAISE EXCEPTION 'Wrong identity deletion count'; END IF;
 IF (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM auth.users a JOIN merge_pairs p ON a.id=p.keep_id) IS DISTINCT FROM keep_accounts
 OR (SELECT jsonb_agg(to_jsonb(s)-'updated_at' ORDER BY s.id) FROM storage.objects s) IS DISTINCT FROM expected_storage
 THEN RAISE EXCEPTION 'Keeper or file metadata changed unexpectedly'; END IF;
 IF (SELECT count(*) FROM calendar_private.admin_identities WHERE auth_user_id='cdf22c49-c96e-4f64-b808-4397035ff578')<>1
 THEN RAISE EXCEPTION 'Keeper admin rights missing'; END IF;
 FOR r IN SELECT key AS rel,value AS hash FROM jsonb_each_text(baseline) LOOP
   EXECUTE format('SELECT md5(coalesce(string_agg(h, '''' ORDER BY h), '''')) FROM (SELECT md5(to_jsonb(x)::text) h FROM %s x) q',r.rel::regclass) INTO fingerprint;
   IF fingerprint IS DISTINCT FROM r.hash THEN RAISE EXCEPTION 'Application data changed'; END IF;
 END LOOP;
END $$;
SELECT (SELECT count(*) FROM public.users) AS profiles,(SELECT count(*) FROM auth.users) AS auth_accounts,
 (SELECT count(*) FROM auth.users a JOIN merge_pairs p ON a.id=p.old_id) AS obsolete_remaining;
-- User-approved execution after successful ROLLBACK rehearsal, encrypted
-- backup hash verification and pre-change file byte verification.
COMMIT;
