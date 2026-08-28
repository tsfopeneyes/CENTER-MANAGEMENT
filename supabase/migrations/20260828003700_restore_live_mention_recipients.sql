-- Live mention notifications are always personal. A legacy regional repair
-- matched the center name in "[하이픈 라이브]" and misclassified them as
-- regional notices. Restore the recipient from the tagged account name.
WITH parsed_mentions AS (
    SELECT
        notification.id,
        substring(notification.content from '@([^[:space:]"]+)') AS mentioned_name
    FROM public.app_notifications AS notification
    WHERE notification.content LIKE '[% 라이브] %태그했습니다:%'
), matched_mentions AS (
    SELECT parsed.id, users.id AS recipient_id
    FROM parsed_mentions AS parsed
    JOIN public.users AS users
      ON replace(users.name, '(guest)', '') = parsed.mentioned_name
)
UPDATE public.app_notifications AS notification
SET notification_type = 'PERSONAL',
    notice_id = NULL,
    target_group = 'USER_' || matched.recipient_id::text,
    is_hidden = false
FROM matched_mentions AS matched
WHERE notification.id = matched.id;

-- If an old mention no longer maps to an existing account, preserve it for
-- audit but expose it to nobody rather than broadcasting it to a center.
UPDATE public.app_notifications
SET notification_type = 'PERSONAL',
    notice_id = NULL,
    target_group = 'PRIVATE_UNRESOLVED',
    is_hidden = true
WHERE content LIKE '[% 라이브] %태그했습니다:%'
  AND target_group NOT LIKE 'USER_%';
