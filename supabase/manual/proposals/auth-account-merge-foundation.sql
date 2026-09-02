-- Apply after membership and role foundations. The worker can only be entered
-- by the account server and has no LOGIN/BYPASSRLS capability.
BEGIN;
CREATE ROLE account_merge_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA account_security,public TO account_merge_worker;
CREATE TABLE account_security.account_merge_receipts (
    request_id uuid PRIMARY KEY,
    source_profile_id uuid NOT NULL,
    target_profile_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    actor_profile_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    status text NOT NULL CHECK(status='completed'),
    completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(source_profile_id,target_profile_id)
);
ALTER TABLE account_security.account_merge_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_security.account_merge_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON account_security.account_merge_receipts TO account_merge_worker;
CREATE POLICY account_merge_receipt_access ON account_security.account_merge_receipts TO account_merge_worker
    USING(true) WITH CHECK(status='completed');
GRANT SELECT ON account_security.accounts,account_security.account_roles TO account_merge_worker;
CREATE POLICY account_merge_account_read ON account_security.accounts FOR SELECT TO account_merge_worker USING(true);
CREATE POLICY account_merge_role_read ON account_security.account_roles FOR SELECT TO account_merge_worker USING(true);
GRANT SELECT,UPDATE(candidate_profile_ids,status,resolved_at,resolved_by)
    ON account_security.guest_link_reviews TO account_merge_worker;
CREATE POLICY account_merge_review_access ON account_security.guest_link_reviews TO account_merge_worker
    USING(true) WITH CHECK(true);
GRANT SELECT(id,auth_user_id,name,birth,phone,user_group,preferences,current_haifn,school),
    UPDATE(current_haifn,school),DELETE ON public.users TO account_merge_worker;
CREATE POLICY account_merge_profile_read ON public.users FOR SELECT TO account_merge_worker USING(true);
CREATE POLICY account_merge_profile_update ON public.users FOR UPDATE TO account_merge_worker
    USING(id=NULLIF(current_setting('app.merge_target_id',true),'')::uuid)
    WITH CHECK(id=NULLIF(current_setting('app.merge_target_id',true),'')::uuid);
CREATE POLICY account_merge_profile_update_guard ON public.users AS RESTRICTIVE FOR UPDATE TO account_merge_worker
    USING(id=NULLIF(current_setting('app.merge_target_id',true),'')::uuid)
    WITH CHECK(id=NULLIF(current_setting('app.merge_target_id',true),'')::uuid);
CREATE POLICY account_merge_profile_delete ON public.users FOR DELETE TO account_merge_worker
    USING(id=NULLIF(current_setting('app.merge_source_id',true),'')::uuid
        AND auth_user_id IS NULL
        AND (preferences->>'is_temporary'='true' OR user_group IN ('게스트','미가입'))
        AND NOT EXISTS(SELECT 1 FROM account_security.accounts a WHERE a.profile_id=public.users.id));
CREATE POLICY account_merge_profile_delete_guard ON public.users AS RESTRICTIVE FOR DELETE TO account_merge_worker
    USING(id=NULLIF(current_setting('app.merge_source_id',true),'')::uuid
        AND auth_user_id IS NULL
        AND (preferences->>'is_temporary'='true' OR user_group IN ('게스트','미가입'))
        AND NOT EXISTS(SELECT 1 FROM account_security.accounts a WHERE a.profile_id=public.users.id));
-- Only reviewed activity relations are writable. Missing optional relations are
-- skipped so the proposal remains compatible with installations that never used them.
DO $grants$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'logs','haifn_transactions','notice_responses','user_badges','program_feedback',
    'guest_posts','guestbook_posts','guest_post_reactions','notice_poll_responses',
    'notice_reactions','community_posts','community_comments','community_likes',
    'user_challenges','visit_notes','checkin_surveys','messages','coffee_chats','comments','guest_comments',
    'notice_likes','rental_bookings','store_orders','user_notification_reads','center_daily_chats',
    'app_notifications','admin_templates','calling_forest_progress','school_logs'
  ] LOOP
    IF to_regclass('public.'||relation_name) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT,UPDATE,DELETE ON public.%I TO account_merge_worker',relation_name);
      EXECUTE format('CREATE POLICY %I ON public.%I TO account_merge_worker USING(true) WITH CHECK(true)',
        'account_merge_'||relation_name,relation_name);
    END IF;
  END LOOP;
END
$grants$;
-- Read-only audit access to every current single-column FK referencing users.
-- An unreviewed reference containing the source blocks the merge even when its
-- FK is ON DELETE CASCADE, preventing silent record loss.
DO $audit_grants$
DECLARE item record; policy_name text;
BEGIN
  FOR item IN SELECT DISTINCT c.relname
    FROM pg_constraint fk JOIN pg_class c ON c.oid=fk.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE fk.contype='f' AND fk.confrelid='public.users'::regclass AND n.nspname='public'
      AND cardinality(fk.conkey)=1 AND cardinality(fk.confkey)=1
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO account_merge_worker',item.relname);
    policy_name='account_merge_audit_'||substr(md5(item.relname),1,16);
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=item.relname AND policyname=policy_name) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO account_merge_worker USING(true)',policy_name,item.relname);
    END IF;
  END LOOP;
END
$audit_grants$;
COMMIT;
