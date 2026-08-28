-- Personal application confirmations and broadcast notices are different
-- notification types. Store that distinction so a title match can never turn
-- a private notification into a regional or global broadcast.
ALTER TABLE public.app_notifications
    ADD COLUMN IF NOT EXISTS notification_type text NOT NULL DEFAULT 'GENERAL';

-- Restore application confirmations to the applicant who created them.
UPDATE public.app_notifications
SET notification_type = 'APPLICATION',
    target_group = 'USER_' || sender_id::text
WHERE sender_id IS NOT NULL
  AND content LIKE '%프로그램 신청이 %되었습니다!%';

-- Restore wait-list promotion notifications from the matching private message.
UPDATE public.app_notifications AS notification
SET notification_type = 'PERSONAL',
    target_group = 'USER_' || (
        SELECT message.receiver_id::text
        FROM public.messages AS message
        WHERE message.content = notification.content
        ORDER BY ABS(EXTRACT(EPOCH FROM (message.created_at - notification.created_at)))
        LIMIT 1
    )
WHERE notification.content LIKE '%대기 중이던 프로그램%'
  AND EXISTS (
      SELECT 1
      FROM public.messages AS message
      WHERE message.content = notification.content
  );

-- Only actual published-notice messages may inherit a notice audience.
UPDATE public.app_notifications
SET notification_type = 'NOTICE'
WHERE notice_id IS NOT NULL
  AND (
      content LIKE '%지금 바로 앱에서 확인해보세요!%'
      OR content LIKE '%등록되었습니다. 앱에서 확인해보세요!%'
  );

CREATE OR REPLACE FUNCTION public.set_notice_notification_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    notice_regions text[];
BEGIN
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
BEFORE INSERT OR UPDATE OF notice_id, notification_type ON public.app_notifications
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
    WHERE notice_id = NEW.id
      AND notification_type = 'NOTICE';
    RETURN NEW;
END;
$$;

-- Re-apply the source audience only to real published-notice messages.
UPDATE public.app_notifications AS notification
SET target_group = CASE
    WHEN array_length(notice.target_regions, 1) = 1 THEN 'REGION_' || notice.target_regions[1]
    ELSE '전체'
END
FROM public.notices AS notice
WHERE notification.notice_id = notice.id
  AND notification.notification_type = 'NOTICE';
