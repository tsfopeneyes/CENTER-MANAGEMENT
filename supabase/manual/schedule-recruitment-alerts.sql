-- MANUAL, after approved function/database deployment and secret provisioning.
-- Existing pg_cron, pg_net and Vault extensions are required. Never paste
-- service-role keys into this script. Vault secrets must be created securely:
-- recruitment_alerts_url: https://<project>/functions/v1/send-recruitment-alerts
-- recruitment_alerts_cron_secret: same >=32-character random function secret.
BEGIN;
DO $$
BEGIN
    IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name IN
        ('recruitment_alerts_url','recruitment_alerts_cron_secret'))<>2 THEN
        RAISE EXCEPTION 'Provision the two named Vault secrets first';
    END IF;
    IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='recruitment-start-alerts') THEN
        RAISE EXCEPTION 'Job already exists; inspect it before changing scheduling';
    END IF;
END $$;
SELECT cron.schedule('recruitment-start-alerts','* * * * *',$job$
    SELECT net.http_post(
        url:=(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='recruitment_alerts_url'),
        headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='recruitment_alerts_cron_secret')),
        body:='{}'::jsonb,timeout_milliseconds:=120000
    );
$job$);
COMMIT;
