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
