-- Application notifications are state-change events. Generate them from the
-- response table in the database, rather than trusting the browser to insert
-- exactly once.
ALTER TABLE public.app_notifications
    ADD COLUMN IF NOT EXISTS is_current_application_state boolean NOT NULL DEFAULT false;

-- Preserve existing rows, but mark consecutive copies of the same application
-- state as duplicates. A cancellation between two applications keeps both
-- legitimate application events visible.
WITH ordered_application_notifications AS (
    SELECT
        id,
        content,
        lag(content) OVER (
            PARTITION BY sender_id, notice_id
            ORDER BY created_at, id
        ) AS previous_content
    FROM public.app_notifications
    WHERE notification_type = 'APPLICATION'
      AND is_hidden = false
)
UPDATE public.app_notifications AS notification
SET is_duplicate = true
FROM ordered_application_notifications AS ordered
WHERE notification.id = ordered.id
  AND ordered.content = ordered.previous_content;

-- Exactly one row represents the current application state per user/program.
WITH ranked_current_states AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY sender_id, notice_id
            ORDER BY created_at DESC, id DESC
        ) AS state_rank
    FROM public.app_notifications
    WHERE notification_type = 'APPLICATION'
      AND is_duplicate = false
      AND is_hidden = false
      AND sender_id IS NOT NULL
      AND notice_id IS NOT NULL
)
UPDATE public.app_notifications AS notification
SET is_current_application_state = (ranked.state_rank = 1)
FROM ranked_current_states AS ranked
WHERE notification.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS app_notifications_one_current_application_state_idx
    ON public.app_notifications (sender_id, notice_id)
    WHERE notification_type = 'APPLICATION'
      AND is_current_application_state = true;

CREATE OR REPLACE FUNCTION public.set_notice_notification_target()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    notice_regions text[];
    latest_application_content text;
BEGIN
    IF NEW.notification_type = 'APPLICATION' THEN
        IF NEW.sender_id IS NULL OR NEW.notice_id IS NULL THEN
            RAISE EXCEPTION 'Application notifications require applicant and program identities';
        END IF;

        NEW.target_group := 'USER_' || NEW.sender_id::text;

        IF TG_OP = 'INSERT' THEN
            SELECT content
            INTO latest_application_content
            FROM public.app_notifications
            WHERE notification_type = 'APPLICATION'
              AND sender_id = NEW.sender_id
              AND notice_id = NEW.notice_id
              AND is_current_application_state = true
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            FOR UPDATE;

            IF FOUND AND latest_application_content = NEW.content THEN
                RETURN NULL;
            END IF;

            UPDATE public.app_notifications
            SET is_current_application_state = false
            WHERE notification_type = 'APPLICATION'
              AND sender_id = NEW.sender_id
              AND notice_id = NEW.notice_id
              AND is_current_application_state = true;

            NEW.is_current_application_state := true;
        END IF;

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

CREATE OR REPLACE FUNCTION public.create_application_state_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    program_title text;
    notification_content text;
    response_user_id uuid;
    response_notice_id bigint;
    response_status text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- A response deleted as part of deleting the whole source notice must
        -- not create a new orphan cancellation notification.
        IF pg_trigger_depth() > 1 THEN
            RETURN OLD;
        END IF;

        response_user_id := OLD.user_id;
        response_notice_id := OLD.notice_id;
        response_status := OLD.status;

        IF response_status NOT IN ('JOIN', 'WAITLIST') THEN
            RETURN OLD;
        END IF;
    ELSE
        response_user_id := NEW.user_id;
        response_notice_id := NEW.notice_id;
        response_status := NEW.status;

        IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
            RETURN NEW;
        END IF;

        IF response_status NOT IN ('JOIN', 'WAITLIST') THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT title INTO program_title
    FROM public.notices
    WHERE id = response_notice_id;

    IF program_title IS NULL THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    notification_content := CASE
        WHEN TG_OP = 'DELETE' THEN '📭 [' || program_title || '] 프로그램 신청이 취소되었습니다.'
        WHEN response_status = 'WAITLIST' THEN '⏳ [' || program_title || '] 프로그램 대기 신청이 완료되었습니다!'
        ELSE '🎉 [' || program_title || '] 프로그램 신청이 완료되었습니다!'
    END;

    INSERT INTO public.app_notifications (
        sender_id,
        target_group,
        content,
        notice_id,
        notification_type
    ) VALUES (
        response_user_id,
        'USER_' || response_user_id::text,
        notification_content,
        response_notice_id,
        'APPLICATION'
    );

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_application_notification_after_response_change ON public.notice_responses;
CREATE TRIGGER create_application_notification_after_response_change
AFTER INSERT OR UPDATE OF status OR DELETE ON public.notice_responses
FOR EACH ROW
EXECUTE FUNCTION public.create_application_state_notification();
