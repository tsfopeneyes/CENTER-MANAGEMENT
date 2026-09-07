BEGIN;

GRANT SELECT,UPDATE(status,credential_version,must_change_password)
    ON account_security.accounts TO account_member_admin_worker;
GRANT SELECT,UPDATE(enabled) ON account_security.login_identifiers TO account_member_admin_worker;
GRANT SELECT,UPDATE(enabled) ON account_security.account_roles TO account_member_admin_worker;
GRANT SELECT,UPDATE(status) ON account_security.session_assurances TO account_member_admin_worker;
GRANT SELECT,DELETE ON account_security.temporary_credentials,account_security.legacy_credentials
    TO account_member_admin_worker;
GRANT SELECT(id,user_group),UPDATE(name,gender,school,church,birth,phone,phone_back4,password,
    guardian_name,guardian_phone,guardian_relation,profile_image_url,fcm_token,bio,auth_user_id,status,preferences)
    ON public.users TO account_member_admin_worker;

DROP POLICY IF EXISTS member_admin_account_access ON account_security.accounts;
CREATE POLICY member_admin_account_access ON account_security.accounts TO account_member_admin_worker
    USING(profile_id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid)
    WITH CHECK(profile_id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid
        AND mapping_verified AND status IN ('active','blocked'));
CREATE POLICY member_admin_identifier_withdraw ON account_security.login_identifiers TO account_member_admin_worker
    USING(profile_id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid)
    WITH CHECK(profile_id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid AND enabled=false);
CREATE POLICY member_admin_assurance_withdraw ON account_security.session_assurances TO account_member_admin_worker
    USING(profile_id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid)
    WITH CHECK(profile_id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid AND status='revoked');
CREATE POLICY member_admin_credential_cleanup ON account_security.temporary_credentials TO account_member_admin_worker
    USING(profile_id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid);
CREATE POLICY member_admin_legacy_cleanup ON account_security.legacy_credentials TO account_member_admin_worker
    USING(profile_id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid);

DROP POLICY IF EXISTS member_admin_profile_update ON public.users;
DROP POLICY IF EXISTS member_admin_profile_guard ON public.users;
CREATE POLICY member_admin_profile_update ON public.users FOR UPDATE TO account_member_admin_worker
    USING(id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid)
    WITH CHECK(id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid AND
        ((user_group='STAFF' AND role IN ('user','admin')) OR status='withdrawn'));
CREATE POLICY member_admin_profile_guard ON public.users AS RESTRICTIVE FOR UPDATE TO account_member_admin_worker
    USING(id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid)
    WITH CHECK(id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid AND
        ((user_group='STAFF' AND role IN ('user','admin')) OR status='withdrawn'));

COMMIT;
