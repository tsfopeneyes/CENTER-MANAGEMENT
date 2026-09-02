-- Narrow hardening: no data/schema/row-policy change, normal CRUD preserved.
-- User authorized DB security restructuring. Existing grants recorded separately.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.users FROM anon, authenticated;
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated')) AS roles(role_name)
        WHERE NOT has_table_privilege(role_name,'public.users','SELECT')
        OR NOT has_table_privilege(role_name,'public.users','INSERT')
        OR NOT has_table_privilege(role_name,'public.users','UPDATE')
        OR NOT has_table_privilege(role_name,'public.users','DELETE')
        OR has_table_privilege(role_name,'public.users','TRUNCATE')
        OR has_table_privilege(role_name,'public.users','REFERENCES')
        OR has_table_privilege(role_name,'public.users','TRIGGER')) THEN
        RAISE EXCEPTION 'Unexpected client grant state; hardening aborted';
    END IF;
END $$;
SELECT role_name,
    has_table_privilege(role_name,'public.users','SELECT') AS can_select,
    has_table_privilege(role_name,'public.users','INSERT') AS can_insert,
    has_table_privilege(role_name,'public.users','UPDATE') AS can_update,
    has_table_privilege(role_name,'public.users','DELETE') AS can_delete,
    has_table_privilege(role_name,'public.users','TRUNCATE') AS can_truncate,
    has_table_privilege(role_name,'public.users','REFERENCES') AS can_reference,
    has_table_privilege(role_name,'public.users','TRIGGER') AS can_trigger
FROM (VALUES('anon'),('authenticated')) AS roles(role_name);
COMMIT;
