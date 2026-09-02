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
