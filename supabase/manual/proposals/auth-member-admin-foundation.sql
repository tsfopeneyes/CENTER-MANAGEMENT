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
