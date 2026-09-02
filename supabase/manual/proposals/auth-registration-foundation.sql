-- ISOLATED PROPOSAL ONLY. No existing profile/schema changes or account imports.
BEGIN;
CREATE ROLE account_registration_worker NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA account_security, auth TO account_registration_worker;
CREATE TABLE account_security.registration_operations (
    id uuid PRIMARY KEY,
    request_key text NOT NULL UNIQUE CHECK (request_key ~ '^[a-f0-9]{64}$'),
    identity_key text NOT NULL UNIQUE CHECK (identity_key ~ '^[a-f0-9]{64}$'),
    details_key text NOT NULL CHECK (details_key ~ '^[a-f0-9]{64}$'),
    login_email text NOT NULL UNIQUE,
    state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','creating','auth_ready')),
    auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    valid_until timestamptz NOT NULL,
    ready_at timestamptz,
    CHECK ((state = 'auth_ready' AND auth_user_id IS NOT NULL AND ready_at IS NOT NULL)
        OR (state <> 'auth_ready' AND auth_user_id IS NULL AND ready_at IS NULL))
);
-- Long-lived identity claims require verified enrollment evidence BEFORE reserve.
-- Expiry never frees a claim automatically: an Auth create can complete late.
-- No raw form, password, request secret, phone or token is stored here.
ALTER TABLE account_security.registration_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_security.registration_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON account_security.registration_operations TO account_registration_worker;
CREATE POLICY registration_worker ON account_security.registration_operations TO account_registration_worker USING(true) WITH CHECK(true);
-- Server-written app metadata is used only with a fresh native password proof.
GRANT SELECT (id,email,raw_app_meta_data,is_anonymous) ON auth.users TO account_registration_worker;
-- No profile/account/assurance writes, Auth writes, DELETE, or LOGIN role attachment.
COMMIT;
