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
