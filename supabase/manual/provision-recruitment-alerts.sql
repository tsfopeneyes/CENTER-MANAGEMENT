-- Approved activation only: additive extensions and two dedicated Vault entries.
-- Random secret is generated inside the database, never embedded in this file.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='recruitment_alerts_cron_secret') THEN
        PERFORM vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),
            'recruitment_alerts_cron_secret','Recruitment alert worker only');
    END IF;
    IF NOT EXISTS(SELECT 1 FROM vault.secrets WHERE name='recruitment_alerts_url') THEN
        PERFORM vault.create_secret('https://erecqalsxoxrufggvmcc.supabase.co/functions/v1/send-recruitment-alerts',
            'recruitment_alerts_url','Recruitment alert worker URL');
    END IF;
END $$;
COMMIT;
