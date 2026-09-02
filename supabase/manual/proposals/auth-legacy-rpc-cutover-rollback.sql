-- Emergency compatibility rollback. Use together with the reviewed client and
-- credential rollback; this script does not change rows or schemas.
DO $rollback$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_login_candidates(text)',
    'public.legacy_login_sync(text,text)',
    'public.merge_duplicate_users(uuid,uuid)',
    'public.merge_guest_to_member(uuid,uuid,jsonb)',
    'public.upgrade_guest_account(uuid,jsonb,text)'
  ] LOOP
    IF to_regprocedure(signature) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', signature);
    END IF;
  END LOOP;
END
$rollback$;
