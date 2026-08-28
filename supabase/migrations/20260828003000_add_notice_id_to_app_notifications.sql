-- Connect in-app notice notifications to their original notice.  Existing
-- records remain intact and are handled by the client title fallback.
ALTER TABLE public.app_notifications
    ADD COLUMN IF NOT EXISTS notice_id uuid NULL;

CREATE INDEX IF NOT EXISTS app_notifications_notice_id_idx
    ON public.app_notifications (notice_id)
    WHERE notice_id IS NOT NULL;
