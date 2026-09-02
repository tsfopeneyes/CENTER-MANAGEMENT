-- ISOLATED PROPOSAL ONLY. No live execution. Requires the session, login and
-- registration proposals. Existing public schema/triggers require review first.
BEGIN;
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='users' AND c.relrowsecurity) THEN
        RAISE EXCEPTION 'Membership finalization requires reviewed, enabled users RLS';
    END IF;
END $$;
CREATE ROLE account_membership_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT account_session_reader TO account_membership_worker;
CREATE TABLE account_security.membership_receipts (
    operation_id uuid PRIMARY KEY REFERENCES account_security.registration_operations(id) ON DELETE RESTRICT,
    profile_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
    auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
    phone_key text NOT NULL UNIQUE CHECK (phone_key ~ '^[a-f0-9]{64}$'),
    details_key text NOT NULL CHECK (details_key ~ '^[a-f0-9]{64}$'),
    result text NOT NULL CHECK (result='registered'),
    completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE account_security.guest_link_reviews (
    operation_id uuid PRIMARY KEY REFERENCES account_security.registration_operations(id) ON DELETE RESTRICT,
    new_profile_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    candidate_profile_ids uuid[] NOT NULL CHECK(cardinality(candidate_profile_ids)>0),
    reason text NOT NULL CHECK(reason IN ('ambiguous','details_mismatch')),
    status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    resolved_at timestamptz,
    resolved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
    CHECK((status='pending' AND resolved_at IS NULL AND resolved_by IS NULL)
        OR (status='resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL))
);
ALTER TABLE account_security.membership_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_security.guest_link_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_security.membership_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON account_security.guest_link_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON account_security.membership_receipts TO account_membership_worker;
GRANT SELECT,INSERT ON account_security.guest_link_reviews TO account_membership_worker;
CREATE POLICY membership_receipt_read ON account_security.membership_receipts FOR SELECT TO account_membership_worker USING(true);
CREATE POLICY membership_receipt_insert ON account_security.membership_receipts FOR INSERT TO account_membership_worker WITH CHECK(true);
CREATE POLICY membership_guest_review_read ON account_security.guest_link_reviews FOR SELECT TO account_membership_worker USING(true);
CREATE POLICY membership_guest_review_insert ON account_security.guest_link_reviews FOR INSERT TO account_membership_worker
    WITH CHECK(status='pending' AND resolved_at IS NULL AND resolved_by IS NULL);
GRANT SELECT,UPDATE(state) ON account_security.registration_operations TO account_membership_worker;
CREATE POLICY membership_operation_read ON account_security.registration_operations FOR SELECT TO account_membership_worker USING(true);
CREATE POLICY membership_operation_lock ON account_security.registration_operations FOR UPDATE TO account_membership_worker USING(true) WITH CHECK(true);
GRANT SELECT(email,raw_app_meta_data) ON auth.users TO account_membership_worker;
GRANT USAGE ON SCHEMA public TO account_membership_worker;
GRANT SELECT(id,name,birth,phone,user_group,preferences,auth_user_id,memo) ON public.users TO account_membership_worker;
GRANT INSERT(id,auth_user_id,name,gender,school,church,birth,phone,phone_back4,user_group,role,status,
    guardian_name,guardian_phone,guardian_relation,preferences) ON public.users TO account_membership_worker;
GRANT UPDATE(auth_user_id,name,gender,school,church,birth,phone,phone_back4,user_group,role,status,
    guardian_name,guardian_phone,guardian_relation,preferences,memo,password) ON public.users TO account_membership_worker;
CREATE POLICY membership_profile_read ON public.users FOR SELECT TO account_membership_worker USING(true);
CREATE POLICY membership_profile_insert ON public.users FOR INSERT TO account_membership_worker
    WITH CHECK(role='user' AND user_group IN ('청소년','졸업생') AND status IN ('approved','pending') AND password IS NULL AND auth_user_id=id);
-- A pre-existing permissive PUBLIC policy must not bypass these invariants.
CREATE POLICY membership_profile_guard ON public.users AS RESTRICTIVE FOR INSERT TO account_membership_worker
    WITH CHECK(role='user' AND user_group IN ('청소년','졸업생') AND status IN ('approved','pending') AND password IS NULL AND auth_user_id=id);
CREATE POLICY membership_guest_update ON public.users FOR UPDATE TO account_membership_worker
    USING(id=NULLIF(current_setting('app.guest_profile_id',true),'')::uuid)
    WITH CHECK(id=NULLIF(current_setting('app.guest_profile_id',true),'')::uuid AND role='user'
        AND user_group IN ('청소년','졸업생') AND status IN ('approved','pending') AND password IS NULL);
CREATE POLICY membership_guest_update_guard ON public.users AS RESTRICTIVE FOR UPDATE TO account_membership_worker
    USING(id=NULLIF(current_setting('app.guest_profile_id',true),'')::uuid)
    WITH CHECK(id=NULLIF(current_setting('app.guest_profile_id',true),'')::uuid AND role='user'
        AND user_group IN ('청소년','졸업생') AND status IN ('approved','pending') AND password IS NULL);
GRANT SELECT,INSERT ON account_security.accounts TO account_membership_worker;
GRANT INSERT ON account_security.login_identifiers TO account_membership_worker;
CREATE POLICY membership_account_read ON account_security.accounts FOR SELECT TO account_membership_worker USING(true);
CREATE POLICY membership_account_insert ON account_security.accounts FOR INSERT TO account_membership_worker
    WITH CHECK(mapping_verified AND credential_version=1 AND NOT must_change_password AND status='active');
CREATE POLICY membership_identifier_insert ON account_security.login_identifiers FOR INSERT TO account_membership_worker
    WITH CHECK(credential_mode='supabase_password');
-- Password can only be cleared while a strictly matched guest is upgraded. No profile DELETE, receipt UPDATE/DELETE,
-- assurance issuance, Auth writes, existing-account merges, or LOGIN role attachment.
COMMIT;
