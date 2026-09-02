-- Auth security foundations reviewed and tested as an ordered composition.
-- PROPOSAL / ISOLATED TEST ONLY. Not a migration and not approved for production.
-- No automatic seed, public.users modification, auth credential rotation or log deletion.
-- This must fail if objects/roles already exist; never silently reuse unknown grants.
BEGIN;
CREATE ROLE account_session_reader NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA account_security;
REVOKE ALL ON SCHEMA account_security FROM PUBLIC, anon, authenticated;

CREATE TABLE account_security.accounts (
    profile_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
    auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
    mapping_verified boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','blocked')),
    credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
    must_change_password boolean NOT NULL DEFAULT true
);
CREATE TABLE account_security.session_assurances (
    -- Deliberately no FK to auth.sessions: recording assurance must not prevent
    -- Auth logout/session cleanup. Live session existence is checked on every request.
    session_id uuid PRIMARY KEY,
    auth_user_id uuid NOT NULL,
    profile_id uuid NOT NULL REFERENCES account_security.accounts(profile_id) ON DELETE RESTRICT,
    credential_version integer NOT NULL CHECK (credential_version > 0),
    status text NOT NULL DEFAULT 'revoked' CHECK (status IN ('trusted','revoked')),
    valid_until timestamptz NOT NULL
);
ALTER TABLE account_security.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_security.session_assurances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA account_security FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA account_security, auth TO account_session_reader;
GRANT SELECT ON account_security.accounts, account_security.session_assurances TO account_session_reader;
CREATE POLICY session_reader_accounts ON account_security.accounts FOR SELECT TO account_session_reader USING (true);
CREATE POLICY session_reader_assurances ON account_security.session_assurances FOR SELECT TO account_session_reader USING (true);
-- Column grants only; no password/hash/email/refresh-token columns.
GRANT SELECT (id, user_id, not_after) ON auth.sessions TO account_session_reader;
GRANT SELECT (id, is_anonymous, banned_until) ON auth.users TO account_session_reader;
-- No login role is created or attached, no INSERT/UPDATE/DELETE granted.
COMMIT;

-- ISOLATED PROPOSAL ONLY; requires reviewed auth-session-foundation.sql first.
-- No existing credential import/rotation, account edits or production activation.
BEGIN;
CREATE ROLE account_login_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT account_session_reader TO account_login_worker;
CREATE TABLE account_security.login_identifiers (
    profile_id uuid PRIMARY KEY REFERENCES account_security.accounts(profile_id) ON DELETE RESTRICT,
    login_email text NOT NULL UNIQUE,
    name_key text NOT NULL CHECK (name_key ~ '^[a-f0-9]{64}$'),
    phone_key text CHECK (phone_key ~ '^[a-f0-9]{64}$'),
    credential_mode text NOT NULL DEFAULT 'legacy_pending' CHECK (credential_mode IN ('legacy_pending','legacy_bridge','supabase_password')),
    enabled boolean NOT NULL DEFAULT false
);
CREATE INDEX login_identifiers_lookup ON account_security.login_identifiers(name_key,phone_key);
CREATE TABLE account_security.legacy_credentials (
    profile_id uuid PRIMARY KEY REFERENCES account_security.accounts(profile_id) ON DELETE RESTRICT,
    password_digest text NOT NULL CHECK(password_digest ~ '^[a-f0-9]{64}$'),
    provider_version integer NOT NULL DEFAULT 1 CHECK(provider_version = 1)
);
ALTER TABLE account_security.legacy_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_security.legacy_credentials FROM PUBLIC,anon,authenticated;
-- Any later change to an identifier invalidates prior proofs, even if a future
-- account-management caller forgets to advance the credential version itself.
CREATE FUNCTION account_security.invalidate_login_identifier() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE account_security.accounts SET credential_version=credential_version+1 WHERE profile_id=OLD.profile_id;
        RETURN OLD;
    END IF;
    IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
        RAISE EXCEPTION 'Login identifier ownership cannot be reassigned';
    END IF;
    IF ROW(NEW.login_email,NEW.name_key,NEW.phone_key,NEW.credential_mode,NEW.enabled)
        IS DISTINCT FROM ROW(OLD.login_email,OLD.name_key,OLD.phone_key,OLD.credential_mode,OLD.enabled) THEN
        UPDATE account_security.accounts SET credential_version=credential_version+1 WHERE profile_id=OLD.profile_id;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION account_security.invalidate_login_identifier() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER login_identifier_changed BEFORE UPDATE OR DELETE ON account_security.login_identifiers
    FOR EACH ROW EXECUTE FUNCTION account_security.invalidate_login_identifier();
CREATE TABLE account_security.login_limits (
    key text NOT NULL CHECK (key ~ '^[a-f0-9]{64}$'),
    bucket bigint NOT NULL,
    attempts integer NOT NULL CHECK (attempts > 0),
    PRIMARY KEY(key,bucket)
);
ALTER TABLE account_security.login_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_security.login_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_security.login_identifiers, account_security.login_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT ON account_security.login_identifiers,account_security.legacy_credentials TO account_login_worker;
GRANT USAGE ON SCHEMA public TO account_login_worker;
GRANT SELECT(id,name,school,user_group) ON public.users TO account_login_worker;
CREATE POLICY login_candidate_read ON public.users FOR SELECT TO account_login_worker USING(
    EXISTS(SELECT 1 FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
        WHERE a.profile_id=public.users.id AND a.mapping_verified AND a.status='active' AND i.enabled));
CREATE POLICY login_candidate_read_guard ON public.users AS RESTRICTIVE FOR SELECT TO account_login_worker USING(
    EXISTS(SELECT 1 FROM account_security.accounts a JOIN account_security.login_identifiers i USING(profile_id)
        WHERE a.profile_id=public.users.id AND a.mapping_verified AND a.status='active' AND i.enabled));
GRANT SELECT,INSERT,UPDATE ON account_security.login_limits TO account_login_worker;
GRANT INSERT ON account_security.session_assurances TO account_login_worker;
-- PostgreSQL row locking requires UPDATE privilege on at least one column.
-- This trusted server role can lock accounts but has no grants on profile/auth writes.
GRANT UPDATE(credential_version) ON account_security.accounts TO account_login_worker;
CREATE POLICY login_identifier_read ON account_security.login_identifiers FOR SELECT TO account_login_worker USING(true);
CREATE POLICY legacy_credential_read ON account_security.legacy_credentials FOR SELECT TO account_login_worker USING(true);
CREATE POLICY login_limit_access ON account_security.login_limits FOR ALL TO account_login_worker USING(true) WITH CHECK(true);
CREATE POLICY login_assurance_insert ON account_security.session_assurances FOR INSERT TO account_login_worker WITH CHECK(true);
CREATE POLICY login_account_lock ON account_security.accounts FOR UPDATE TO account_login_worker USING(true) WITH CHECK(true);
-- No LOGIN role is attached, no protected accounts seeded, no public access added.
COMMIT;

-- ISOLATED PROPOSAL ONLY. Server/operator role for resumable legacy credential
-- migration. It cannot create/delete profiles, roles, sessions or activity data.
BEGIN;
CREATE ROLE account_migration_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA account_security,public TO account_migration_worker;
GRANT SELECT ON account_security.accounts,account_security.login_identifiers,account_security.legacy_credentials TO account_migration_worker;
GRANT UPDATE(credential_mode) ON account_security.login_identifiers TO account_migration_worker;
GRANT INSERT ON account_security.legacy_credentials TO account_migration_worker;
GRANT SELECT(id,password),UPDATE(password) ON public.users TO account_migration_worker;
CREATE POLICY migration_account_read ON account_security.accounts FOR SELECT TO account_migration_worker USING(true);
CREATE POLICY migration_identifier_access ON account_security.login_identifiers TO account_migration_worker USING(true) WITH CHECK(true);
CREATE POLICY migration_legacy_access ON account_security.legacy_credentials TO account_migration_worker USING(true) WITH CHECK(true);
CREATE POLICY migration_profile_read ON public.users FOR SELECT TO account_migration_worker USING(true);
CREATE POLICY migration_profile_update ON public.users FOR UPDATE TO account_migration_worker USING(true)
    WITH CHECK(password IS NULL OR password ~ '^[a-f0-9]{64}$');
COMMIT;

-- ISOLATED PROPOSAL ONLY. Never apply automatically to the live database.
BEGIN;
CREATE ROLE account_credential_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT account_session_reader TO account_credential_worker;
CREATE TABLE account_security.credential_confirmations (
    id uuid PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES account_security.accounts(profile_id) ON DELETE RESTRICT,
    actor_profile_id uuid NOT NULL REFERENCES account_security.accounts(profile_id) ON DELETE RESTRICT,
    purpose text NOT NULL CHECK(purpose = 'password_reset'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    valid_until timestamptz NOT NULL CHECK(valid_until > created_at)
);
CREATE TABLE account_security.credential_operations (
    id uuid PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES account_security.accounts(profile_id) ON DELETE RESTRICT,
    auth_user_id uuid NOT NULL,
    credential_version integer NOT NULL CHECK (credential_version > 0),
    kind text NOT NULL CHECK (kind IN ('admin_reset','temporary_change','self_change')),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','completed')),
    actor_id uuid NOT NULL,
    confirmation_id uuid UNIQUE REFERENCES account_security.credential_confirmations(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    temporary_until timestamptz,
    completed_at timestamptz,
    CHECK ((kind = 'admin_reset' AND confirmation_id IS NOT NULL AND temporary_until IS NOT NULL)
        OR (kind IN ('temporary_change','self_change') AND confirmation_id IS NULL AND temporary_until IS NULL))
);
CREATE UNIQUE INDEX one_pending_credential_operation ON account_security.credential_operations(profile_id) WHERE state = 'pending';
CREATE TABLE account_security.temporary_credentials (
    profile_id uuid PRIMARY KEY REFERENCES account_security.accounts(profile_id) ON DELETE RESTRICT,
    credential_version integer NOT NULL CHECK (credential_version > 0),
    valid_until timestamptz NOT NULL,
    password_digest text NOT NULL CHECK(length(password_digest) BETWEEN 32 AND 512)
);
-- Only a slow password-KDF digest of the one-use value is stored. No raw
-- password, bearer token, phone number or identity document is stored here.
ALTER TABLE account_security.credential_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_security.temporary_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_security.credential_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_security.credential_operations, account_security.temporary_credentials,
    account_security.credential_confirmations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON account_security.login_identifiers TO account_credential_worker;
CREATE POLICY credential_identifiers ON account_security.login_identifiers FOR SELECT TO account_credential_worker USING (true);
GRANT SELECT,DELETE ON account_security.legacy_credentials TO account_credential_worker;
CREATE POLICY credential_legacy_read ON account_security.legacy_credentials FOR SELECT TO account_credential_worker USING (true);
CREATE POLICY credential_legacy_delete ON account_security.legacy_credentials FOR DELETE TO account_credential_worker USING (true);
GRANT UPDATE(credential_mode) ON account_security.login_identifiers TO account_credential_worker;
CREATE POLICY credential_identifier_update ON account_security.login_identifiers FOR UPDATE TO account_credential_worker USING(true) WITH CHECK(true);
GRANT SELECT, INSERT, UPDATE ON account_security.credential_operations, account_security.temporary_credentials TO account_credential_worker;
GRANT INSERT ON account_security.session_assurances TO account_credential_worker;
GRANT SELECT ON account_security.credential_confirmations TO account_credential_worker;
GRANT SELECT (id,phone,phone_back4) ON public.users TO account_credential_worker;
CREATE POLICY credential_operations ON account_security.credential_operations TO account_credential_worker USING (true) WITH CHECK (true);
CREATE POLICY temporary_credentials ON account_security.temporary_credentials TO account_credential_worker USING (true) WITH CHECK (true);
CREATE POLICY credential_confirmations ON account_security.credential_confirmations FOR SELECT TO account_credential_worker USING (true);
GRANT UPDATE (status, credential_version, must_change_password) ON account_security.accounts TO account_credential_worker;
CREATE POLICY credential_accounts ON account_security.accounts FOR UPDATE TO account_credential_worker USING (true) WITH CHECK (true);
-- Confirmation INSERT belongs to a separate audited administrator workflow.
-- No DELETE, public profile writes, auth table writes, or login role attachment.
COMMIT;

-- ISOLATED PROPOSAL ONLY. No existing profile/schema changes or account imports.
BEGIN;
CREATE ROLE account_registration_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA account_security, auth TO account_registration_worker;
CREATE TABLE account_security.registration_operations (
    id uuid PRIMARY KEY,
    request_key text NOT NULL UNIQUE CHECK (request_key ~ '^[a-f0-9]{64}$'),
    identity_key text NOT NULL UNIQUE CHECK (identity_key ~ '^[a-f0-9]{64}$'),
    details_key text NOT NULL CHECK (details_key ~ '^[a-f0-9]{64}$'),
    login_email text NOT NULL UNIQUE,
    state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','creating','auth_ready')),
    auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    valid_until timestamptz NOT NULL,
    ready_at timestamptz,
    CHECK ((state = 'auth_ready' AND auth_user_id IS NOT NULL AND ready_at IS NOT NULL)
        OR (state <> 'auth_ready' AND auth_user_id IS NULL AND ready_at IS NULL))
);
-- Long-lived identity claims require verified enrollment evidence BEFORE reserve.
-- Expiry never frees a claim automatically: an Auth create can complete late.
-- No raw form, password, request secret, phone or token is stored here.
ALTER TABLE account_security.registration_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_security.registration_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON account_security.registration_operations TO account_registration_worker;
CREATE POLICY registration_worker ON account_security.registration_operations TO account_registration_worker USING(true) WITH CHECK(true);
-- Server-written app metadata is used only with a fresh native password proof.
GRANT SELECT (id,email,raw_app_meta_data,is_anonymous) ON auth.users TO account_registration_worker;
-- No profile/account/assurance writes, Auth writes, DELETE, or LOGIN role attachment.
COMMIT;

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

-- ISOLATED PROPOSAL ONLY. No existing roles imported or automatically trusted.
BEGIN;
CREATE TABLE account_security.account_roles (
    profile_id uuid PRIMARY KEY REFERENCES account_security.accounts(profile_id) ON DELETE RESTRICT,
    role text NOT NULL DEFAULT 'member' CHECK(role IN ('member','staff','admin')),
    enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE account_security.account_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_security.account_roles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON account_security.account_roles TO account_session_reader;
CREATE POLICY account_role_read ON account_security.account_roles FOR SELECT TO account_session_reader USING(true);
CREATE ROLE account_confirmation_writer NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT account_session_reader TO account_confirmation_writer;
GRANT SELECT ON account_security.account_roles TO account_confirmation_writer;
GRANT INSERT ON account_security.credential_confirmations TO account_confirmation_writer;
CREATE POLICY credential_confirmation_write ON account_security.credential_confirmations FOR INSERT TO account_confirmation_writer
    WITH CHECK(actor_profile_id=NULLIF(current_setting('app.actor_profile_id',true),'')::uuid
        AND EXISTS(SELECT 1 FROM account_security.account_roles r WHERE r.profile_id=actor_profile_id
            AND r.enabled AND r.role='admin')
        AND EXISTS(SELECT 1 FROM account_security.accounts a WHERE a.profile_id=profile_id
            AND a.mapping_verified AND a.status='active'));
-- Assignment/revocation needs a separately audited server workflow. No client,
-- login worker or membership worker can write this table. No default admin.
COMMIT;

-- ISOLATED PROPOSAL ONLY. One-time, resumable bootstrap from reviewed existing
-- profile/Auth links. No LOGIN, BYPASSRLS, profile edits or Auth edits.
BEGIN;
CREATE ROLE account_bootstrap_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA account_security,public,auth TO account_bootstrap_worker;
GRANT SELECT(id,auth_user_id,name,phone,password,user_group,role,status,preferences,is_master) ON public.users TO account_bootstrap_worker;
GRANT SELECT(id,email,is_anonymous,banned_until) ON auth.users TO account_bootstrap_worker;
GRANT SELECT(id,user_id,not_after) ON auth.sessions TO account_bootstrap_worker;
GRANT SELECT,INSERT ON account_security.accounts,account_security.login_identifiers,
    account_security.legacy_credentials,account_security.account_roles,account_security.session_assurances TO account_bootstrap_worker;
CREATE POLICY bootstrap_account_access ON account_security.accounts TO account_bootstrap_worker USING(true) WITH CHECK(true);
CREATE POLICY bootstrap_identifier_access ON account_security.login_identifiers TO account_bootstrap_worker USING(true) WITH CHECK(true);
CREATE POLICY bootstrap_legacy_access ON account_security.legacy_credentials TO account_bootstrap_worker USING(true) WITH CHECK(true);
CREATE POLICY bootstrap_role_access ON account_security.account_roles TO account_bootstrap_worker USING(true) WITH CHECK(true);
CREATE POLICY bootstrap_assurance_access ON account_security.session_assurances TO account_bootstrap_worker USING(true) WITH CHECK(true);
CREATE POLICY bootstrap_profile_read ON public.users FOR SELECT TO account_bootstrap_worker USING(true);
-- auth tables already have platform policies; this role is server-only and has
-- read grants solely for exact mapping/live-session evidence.
COMMIT;

-- ISOLATED PROPOSAL. Current profile UI remains unchanged until all save modes
-- (including image/password) and actual DB policy compatibility are verified.
BEGIN;
DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.users'::regclass AND relrowsecurity) THEN
        RAISE EXCEPTION 'public.users RLS must already be enabled';
    END IF;
END $$;
CREATE ROLE account_profile_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT account_session_reader TO account_profile_worker;
GRANT USAGE ON SCHEMA public TO account_profile_worker;
GRANT SELECT(id,name,gender,school,church,birth,phone,phone_back4,user_group,status,
    guardian_name,guardian_phone,guardian_relation,preferences,bio,profile_image_url) ON public.users TO account_profile_worker;
GRANT UPDATE(school,church,bio,preferences,profile_image_url) ON public.users TO account_profile_worker;
GRANT SELECT ON account_security.account_roles TO account_profile_worker;
CREATE POLICY profile_worker_read ON public.users FOR SELECT TO account_profile_worker
    USING(id=NULLIF(current_setting('app.profile_id',true),'')::uuid);
CREATE POLICY profile_worker_read_guard ON public.users AS RESTRICTIVE FOR SELECT TO account_profile_worker
    USING(id=NULLIF(current_setting('app.profile_id',true),'')::uuid);
CREATE POLICY profile_worker_update ON public.users FOR UPDATE TO account_profile_worker
    USING(id=NULLIF(current_setting('app.profile_id',true),'')::uuid)
    WITH CHECK(id=NULLIF(current_setting('app.profile_id',true),'')::uuid);
CREATE POLICY profile_worker_update_guard ON public.users AS RESTRICTIVE FOR UPDATE TO account_profile_worker
    USING(id=NULLIF(current_setting('app.profile_id',true),'')::uuid)
    WITH CHECK(id=NULLIF(current_setting('app.profile_id',true),'')::uuid);
-- The GUC is set transaction-locally by the server, never a browser identity.
-- This role cannot write IDs, roles, passwords, approval state, balances or Auth.
COMMIT;

-- Isolated proposal. Canonical administrator assignment is server-only and
-- mirrors the existing public display role without trusting that display role.
BEGIN;
CREATE ROLE account_member_admin_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA account_security,public TO account_member_admin_worker;
GRANT SELECT,UPDATE(role,enabled) ON account_security.account_roles TO account_member_admin_worker;
GRANT SELECT ON account_security.accounts TO account_member_admin_worker;
GRANT SELECT(id,user_group),UPDATE(role) ON public.users TO account_member_admin_worker;
CREATE POLICY member_admin_role_access ON account_security.account_roles TO account_member_admin_worker
    USING(true) WITH CHECK(role IN ('staff','admin'));
CREATE POLICY member_admin_account_access ON account_security.accounts TO account_member_admin_worker
    USING(true) WITH CHECK(mapping_verified AND status='active');
CREATE POLICY member_admin_profile_read ON public.users FOR SELECT TO account_member_admin_worker USING(true);
CREATE POLICY member_admin_profile_update ON public.users FOR UPDATE TO account_member_admin_worker
    USING(id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid AND user_group='STAFF')
    WITH CHECK(id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid AND user_group='STAFF'
        AND role IN ('user','admin'));
CREATE POLICY member_admin_profile_guard ON public.users AS RESTRICTIVE FOR UPDATE TO account_member_admin_worker
    USING(id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid AND user_group='STAFF')
    WITH CHECK(id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid AND user_group='STAFF'
        AND role IN ('user','admin'));
COMMIT;

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

