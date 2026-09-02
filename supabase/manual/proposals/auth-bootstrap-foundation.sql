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
