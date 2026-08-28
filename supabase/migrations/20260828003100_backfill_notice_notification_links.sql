-- Old notice notifications were stored without the notice ID, and some were
-- broadcast before regional target groups existed. Link them by the title
-- embedded in their content so their original regional visibility is restored.
-- notices.id is a numeric legacy key, while the first linking migration was
-- created with uuid by mistake. This migration had not applied any data yet,
-- so correct the empty link column before backfilling it.
ALTER TABLE public.app_notifications
    ALTER COLUMN notice_id TYPE bigint
    USING notice_id::text::bigint;

UPDATE public.app_notifications AS notification
SET notice_id = (
    SELECT notice.id
    FROM public.notices AS notice
    WHERE COALESCE(notice.title, '') <> ''
      AND notification.content LIKE '%' || notice.title || '%'
    ORDER BY char_length(notice.title) DESC, notice.created_at DESC
    LIMIT 1
)
WHERE notification.notice_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM public.notices AS notice
      WHERE COALESCE(notice.title, '') <> ''
        AND notification.content LIKE '%' || notice.title || '%'
  );
