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
