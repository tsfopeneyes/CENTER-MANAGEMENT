-- Keep duplicate rows for audit history, but hide duplicate deliveries.
ALTER TABLE public.app_notifications
    ADD COLUMN IF NOT EXISTS is_duplicate boolean NOT NULL DEFAULT false;

-- Some legacy center notices outlived their source post, so they cannot be
-- linked by notice_id. Their center name is still explicit in the message.
UPDATE public.app_notifications
SET notification_type = 'NOTICE',
    target_group = 'REGION_강서'
WHERE notice_id IS NULL
  AND content LIKE '%이높플레이스%';

UPDATE public.app_notifications
SET notification_type = 'NOTICE',
    target_group = 'REGION_강동'
WHERE notice_id IS NULL
  AND content LIKE '%하이픈%';

-- Mark only rapid repeated deliveries of the same published notice. The first
-- row remains visible; later deliberate re-announcements outside five minutes
-- are left intact.
UPDATE public.app_notifications AS repeated
SET is_duplicate = true
WHERE repeated.notification_type = 'NOTICE'
  AND EXISTS (
      SELECT 1
      FROM public.app_notifications AS original
      WHERE original.id <> repeated.id
        AND original.notification_type = 'NOTICE'
        AND original.notice_id IS NOT DISTINCT FROM repeated.notice_id
        AND original.target_group = repeated.target_group
        AND original.content = repeated.content
        AND original.created_at < repeated.created_at
        AND repeated.created_at - original.created_at <= interval '5 minutes'
  );

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

    IF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1
        FROM public.app_notifications AS existing
        WHERE existing.notification_type = 'NOTICE'
          AND existing.notice_id = NEW.notice_id
          AND existing.target_group = NEW.target_group
          AND existing.content = NEW.content
          AND existing.created_at >= now() - interval '5 minutes'
    ) THEN
        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;
