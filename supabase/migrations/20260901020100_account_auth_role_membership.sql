-- The platform's server-only postgres connection may assume only these
-- narrowly scoped NOLOGIN/NOBYPASSRLS roles. Browser roles receive none.
GRANT account_session_reader, account_login_worker, account_migration_worker,
  account_credential_worker, account_confirmation_writer,
  account_registration_worker, account_membership_worker,
  account_bootstrap_worker, account_profile_worker,
  account_member_admin_worker, account_merge_worker TO postgres;
