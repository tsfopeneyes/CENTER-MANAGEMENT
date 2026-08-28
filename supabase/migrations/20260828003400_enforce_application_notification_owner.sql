-- Two legacy application notifications have no sender/recipient identity left.
-- Preserve the rows for audit purposes, but expose them to nobody.
UPDATE public.app_notifications
SET notification_type = 'PERSONAL',
    target_group = 'PRIVATE_UNRESOLVED'
WHERE sender_id IS NULL
  AND content LIKE '%프로그램 신청이 %되었습니다!%';

-- For every future application confirmation, the database derives the only
-- valid audience from the applicant identity. A missing applicant is rejected
-- instead of falling back to a region or broadcast.
CREATE OR REPLACE FUNCTION public.set_notice_notification_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    notice_regions text[];
BEGIN
    IF NEW.notification_type = 'APPLICATION' THEN
        IF NEW.sender_id IS NULL THEN
            RAISE EXCEPTION 'Application notifications require an applicant identity';
        END IF;
        NEW.target_group := 'USER_' || NEW.sender_id::text;
        RETURN NEW;
    END IF;

    IF NEW.notice_id IS NULL OR NEW.notification_type <> 'NOTICE' THEN
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
BEFORE INSERT OR UPDATE OF notice_id, notification_type, sender_id ON public.app_notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_notice_notification_target();
