-- Separate the stable location identity from its editable display name.
--
-- The Enough Place row was originally created with the misleading primary key
-- "하이픈 5층 회의실" while its display name and group identify it as
-- 이높플레이스. Move every exact reference to a canonical, name-independent
-- key without deleting visit history or other related records.

BEGIN;

DO $$
DECLARE
  legacy_id constant text := '하이픈 5층 회의실';
  canonical_id constant text := 'ENOUGH_PLACE';
  enough_group_id uuid;
  constraint_row record;
  constraint_definition text;
  column_row record;
BEGIN
  SELECT id
    INTO enough_group_id
    FROM public.location_groups
   WHERE name = '이높플레이스'
   LIMIT 1;

  IF enough_group_id IS NULL THEN
    RAISE EXCEPTION '이높플레이스 location group is missing';
  END IF;

  IF EXISTS (SELECT 1 FROM public.locations WHERE id = canonical_id)
     AND EXISTS (SELECT 1 FROM public.locations WHERE id = legacy_id) THEN
    RAISE EXCEPTION 'Both legacy and canonical Enough Place locations exist; manual reconciliation is required';
  END IF;

  -- Recreate every FK to locations(id) with ON UPDATE CASCADE so changing a
  -- location key cannot orphan related data now or in future migrations.
  FOR constraint_row IN
    SELECT c.conrelid::regclass AS table_name,
           c.conname,
           pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.locations'::regclass
  LOOP
    constraint_definition := constraint_row.definition;
    IF constraint_definition !~* 'ON UPDATE' THEN
      IF constraint_definition ~* ' ON DELETE ' THEN
        constraint_definition := regexp_replace(
          constraint_definition,
          ' ON DELETE ',
          ' ON UPDATE CASCADE ON DELETE ',
          'i'
        );
      ELSIF constraint_definition ~* ' DEFERRABLE' THEN
        constraint_definition := regexp_replace(
          constraint_definition,
          ' DEFERRABLE',
          ' ON UPDATE CASCADE DEFERRABLE',
          'i'
        );
      ELSE
        constraint_definition := constraint_definition || ' ON UPDATE CASCADE';
      END IF;
    ELSE
      constraint_definition := regexp_replace(
        constraint_definition,
        'ON UPDATE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)',
        'ON UPDATE CASCADE',
        'i'
      );
    END IF;

    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      constraint_row.table_name,
      constraint_row.conname
    );
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      constraint_row.table_name,
      constraint_row.conname,
      constraint_definition
    );
  END LOOP;

  UPDATE public.locations
     SET id = canonical_id,
         name = '이높플레이스',
         group_id = enough_group_id
   WHERE id = legacy_id;

  -- Some historical tables (notably logs) intentionally store polymorphic
  -- location text without an FK. Update only the exact legacy value and leave
  -- program/log payloads untouched.
  FOR column_row IN
    SELECT c.table_schema, c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND c.column_name = 'location_id'
       AND c.data_type IN ('text', 'character varying')
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET location_id = $1 WHERE location_id = $2',
      column_row.table_schema,
      column_row.table_name
    ) USING canonical_id, legacy_id;
  END LOOP;
END $$;

COMMIT;
