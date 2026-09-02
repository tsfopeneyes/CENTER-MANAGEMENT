-- Apply only after account-auth readiness, bootstrap, credential migration and
-- client activation have all succeeded. Missing historical functions are safe.
DO $cutover$
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
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', signature);
    END IF;
  END LOOP;
END
$cutover$;
