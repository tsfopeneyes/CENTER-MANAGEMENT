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
