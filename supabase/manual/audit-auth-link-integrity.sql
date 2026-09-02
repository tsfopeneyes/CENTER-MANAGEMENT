-- Read-only whole-population audit. Never exports passwords, phones, emails,
-- session tokens, metadata or application logs.
BEGIN READ ONLY;
WITH profiles AS (
 SELECT u.id,u.auth_user_id,coalesce(u.preferences->>'is_temporary','false')='true' AS temporary,
   EXISTS(SELECT 1 FROM auth.users a WHERE a.id=u.id) AS direct_exists,
   EXISTS(SELECT 1 FROM auth.users a WHERE a.id=u.auth_user_id) AS linked_exists,
   (SELECT count(*) FROM auth.users a WHERE a.id=u.id OR a.id=u.auth_user_id) AS auth_count,
   (SELECT count(*) FROM auth.users a WHERE a.email=regexp_replace(coalesce(u.phone,''),'[^0-9]','','g')||'@youth-access.app'
      AND regexp_replace(coalesce(u.phone,''),'[^0-9]','','g')<>'' AND a.id<>u.id AND a.id IS DISTINCT FROM u.auth_user_id) AS extra_phone_candidates
 FROM public.users u
), conflicts AS (
 SELECT a.id,count(DISTINCT u.id) owners FROM auth.users a JOIN public.users u ON a.id=u.id OR a.id=u.auth_user_id GROUP BY a.id HAVING count(DISTINCT u.id)>1
)
SELECT jsonb_build_object(
 'profiles',(SELECT count(*) FROM profiles),
 'auth_accounts',(SELECT count(*) FROM auth.users),
 'profiles_one_auth',(SELECT count(*) FROM profiles WHERE auth_count=1),
 'profiles_two_auth',(SELECT count(*) FROM profiles WHERE auth_count=2),
 'profiles_no_auth_temporary',(SELECT count(*) FROM profiles WHERE auth_count=0 AND temporary),
 'profiles_no_auth_nontemporary',(SELECT count(*) FROM profiles WHERE auth_count=0 AND NOT temporary),
 'dangling_explicit_links',(SELECT count(*) FROM profiles WHERE auth_user_id IS NOT NULL AND NOT linked_exists),
 'cross_profile_auth_conflicts',(SELECT count(*) FROM conflicts),
 'phone_candidate_profiles',(SELECT count(*) FROM profiles WHERE extra_phone_candidates>0),
 'unlinked_auth',(SELECT count(*) FROM auth.users a WHERE NOT EXISTS(SELECT 1 FROM profiles p WHERE a.id=p.id OR a.id=p.auth_user_id)),
 'exceptions',(SELECT coalesce(jsonb_agg(jsonb_build_object('profile_id',id,'temporary',temporary,'auth_count',auth_count,'direct_exists',direct_exists,'linked_exists',linked_exists,'extra_phone_candidates',extra_phone_candidates)),'[]'::jsonb)
 FROM profiles WHERE auth_count>1 OR extra_phone_candidates>0 OR (auth_user_id IS NOT NULL AND NOT linked_exists))
) AS audit;
ROLLBACK;
