-- A notice notification must inherit its audience from the source notice.
-- This prevents a stale browser or a manually supplied target_group from
-- turning a regional notice into a broadcast.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'app_notifications_notice_id_fkey'
    ) THEN
        ALTER TABLE public.app_notifications
            ADD CONSTRAINT app_notifications_notice_id_fkey
            FOREIGN KEY (notice_id)
            REFERENCES public.notices(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_notice_notification_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    notice_regions text[];
BEGIN
    IF NEW.notice_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT target_regions
    INTO notice_regions
    FROM public.notices
    WHERE id = NEW.notice_id;

    NEW.target_group := CASE
        WHEN array_length(notice_regions, 1) = 1 THEN 'REGION_' || notice_regions[1]
        ELSE '전체'
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_notice_notification_target_before_write ON public.app_notifications;
CREATE TRIGGER set_notice_notification_target_before_write
BEFORE INSERT OR UPDATE OF notice_id ON public.app_notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_notice_notification_target();

CREATE OR REPLACE FUNCTION public.sync_notice_notification_targets()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.app_notifications
    SET target_group = CASE
        WHEN array_length(NEW.target_regions, 1) = 1 THEN 'REGION_' || NEW.target_regions[1]
        ELSE '전체'
    END
    WHERE notice_id = NEW.id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_notice_notification_targets_after_region_update ON public.notices;
CREATE TRIGGER sync_notice_notification_targets_after_region_update
AFTER UPDATE OF target_regions ON public.notices
FOR EACH ROW
WHEN (OLD.target_regions IS DISTINCT FROM NEW.target_regions)
EXECUTE FUNCTION public.sync_notice_notification_targets();

-- Correct the target groups of the historical records that were linked in
-- the previous migration. This changes only their audience metadata.
UPDATE public.app_notifications AS notification
SET target_group = CASE
    WHEN array_length(notice.target_regions, 1) = 1 THEN 'REGION_' || notice.target_regions[1]
    ELSE '전체'
END
FROM public.notices AS notice
WHERE notification.notice_id = notice.id;
