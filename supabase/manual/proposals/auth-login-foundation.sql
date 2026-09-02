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
