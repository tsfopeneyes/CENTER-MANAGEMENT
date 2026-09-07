BEGIN;

GRANT UPDATE(grade,memo) ON public.users TO account_member_admin_worker;

CREATE POLICY member_admin_role_withdraw ON account_security.account_roles
    FOR UPDATE TO account_member_admin_worker
    USING(profile_id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid)
    WITH CHECK(profile_id=NULLIF(current_setting('app.target_profile_id',true),'')::uuid AND enabled=false);

COMMIT;
