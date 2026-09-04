CREATE TABLE IF NOT EXISTS public.push_dispatches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    title text NOT NULL CHECK (length(title) BETWEEN 1 AND 50),
    body text NOT NULL CHECK (length(body) BETWEEN 1 AND 160),
    target_kind text NOT NULL,
    target_label text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_dispatches_created_idx ON public.push_dispatches (created_at DESC);
ALTER TABLE public.push_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_dispatches FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.push_dispatch_recipients (
    dispatch_id uuid NOT NULL REFERENCES public.push_dispatches(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    PRIMARY KEY (dispatch_id, user_id)
);

ALTER TABLE public.push_dispatch_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_dispatch_recipients FROM anon, authenticated;

ALTER TABLE public.push_delivery_attempts
    ADD COLUMN IF NOT EXISTS dispatch_id uuid REFERENCES public.push_dispatches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS push_delivery_attempts_dispatch_idx
    ON public.push_delivery_attempts (dispatch_id, created_at);

ALTER TABLE public.app_notifications
    ADD COLUMN IF NOT EXISTS dispatch_id uuid REFERENCES public.push_dispatches(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS app_notifications_dispatch_idx
    ON public.app_notifications (dispatch_id) WHERE dispatch_id IS NOT NULL;

DO $$
DECLARE
    legacy record;
    new_dispatch_id uuid;
    recipient_id uuid;
BEGIN
    FOR legacy IN
        SELECT sender_id, content, created_at, min(target_group) AS target_group
        FROM public.app_notifications
        WHERE notification_type = 'MANUAL'
          AND dispatch_id IS NULL
          AND sender_id IS NOT NULL
        GROUP BY sender_id, content, created_at
    LOOP
        INSERT INTO public.push_dispatches (sender_id, title, body, target_kind, target_label, created_at)
        VALUES (
            legacy.sender_id,
            left(split_part(legacy.content, E'\n', 1), 50),
            left(coalesce(nullif(regexp_replace(legacy.content, '^[^\n]*\n?', ''), ''), '(내용 없음)'), 160),
            CASE WHEN legacy.target_group LIKE 'USER_%' THEN 'USERS' ELSE 'LEGACY' END,
            CASE WHEN legacy.target_group LIKE 'USER_%' THEN '특정 이용자' ELSE coalesce(legacy.target_group, '전체') END,
            legacy.created_at
        ) RETURNING id INTO new_dispatch_id;

        UPDATE public.app_notifications SET dispatch_id = new_dispatch_id
        WHERE notification_type = 'MANUAL' AND sender_id = legacy.sender_id
          AND content = legacy.content AND created_at = legacy.created_at;

        FOR recipient_id IN
            SELECT substring(target_group FROM 6)::uuid
            FROM public.app_notifications
            WHERE dispatch_id = new_dispatch_id AND target_group ~ '^USER_[0-9a-f-]{36}$'
        LOOP
            INSERT INTO public.push_dispatch_recipients (dispatch_id, user_id)
            SELECT new_dispatch_id, recipient_id FROM public.users WHERE id = recipient_id
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;
