-- Keep notification history for audit, while excluding notifications whose
-- source post no longer exists from every user's bell list.
ALTER TABLE public.app_notifications
    ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- Repair legacy published-post notifications that already lost their source.
UPDATE public.app_notifications
SET is_hidden = true
WHERE notice_id IS NULL
  AND (
      content LIKE '%등록되었습니다. 앱에서 확인해보세요!%'
      OR content LIKE '%지금 바로 앱에서 확인해보세요!%'
  );

CREATE OR REPLACE FUNCTION public.hide_notifications_for_deleted_notice()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.app_notifications
    SET is_hidden = true
    WHERE notice_id = OLD.id;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS hide_notifications_before_notice_delete ON public.notices;
CREATE TRIGGER hide_notifications_before_notice_delete
BEFORE DELETE ON public.notices
FOR EACH ROW
EXECUTE FUNCTION public.hide_notifications_for_deleted_notice();
