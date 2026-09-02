-- Reviewed rollout only. Additive: preserves every existing program and log.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.notices
    ADD COLUMN IF NOT EXISTS recruitment_start_at timestamptz,
    ADD COLUMN IF NOT EXISTS recruitment_details_ready boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notices.recruitment_start_at IS
    'NULL preserves legacy recruitment. New application programs use [start, deadline).';
COMMENT ON COLUMN public.notices.recruitment_details_ready IS
    'Required application details are complete; independent of program completion/rewards.';

CREATE TABLE IF NOT EXISTS public.center_duty_assignments (
    center_code text NOT NULL CHECK (center_code = 'HAIFN'),
    duty_date date NOT NULL,
    staff_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    staff_name text,
    duty_status text NOT NULL DEFAULT 'ASSIGNED' CHECK (duty_status IN ('ASSIGNED', 'OFF')),
    label text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (center_code, duty_date),
    CHECK ((duty_status = 'ASSIGNED' AND nullif(btrim(staff_name), '') IS NOT NULL)
        OR (duty_status = 'OFF' AND staff_name IS NULL AND staff_id IS NULL))
);

-- Only a verified Supabase identity may edit duty assignments. Never trust a
-- browser-supplied role, name, localStorage value, or custom request header.
CREATE OR REPLACE FUNCTION public.calendar_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users u
        WHERE (u.id = auth.uid() OR u.auth_user_id = auth.uid())
          AND (u.role = 'admin' OR u.user_group = '관리자')
    );
$$;
REVOKE ALL ON FUNCTION public.calendar_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calendar_is_admin() TO anon, authenticated, service_role;

ALTER TABLE public.center_duty_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_duty_read ON public.center_duty_assignments
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY calendar_duty_insert ON public.center_duty_assignments
    FOR INSERT TO authenticated WITH CHECK (public.calendar_is_admin());
CREATE POLICY calendar_duty_update ON public.center_duty_assignments
    FOR UPDATE TO authenticated USING (public.calendar_is_admin()) WITH CHECK (public.calendar_is_admin());
GRANT SELECT ON public.center_duty_assignments TO anon, authenticated;
GRANT INSERT, UPDATE ON public.center_duty_assignments TO authenticated;
GRANT ALL ON public.center_duty_assignments TO service_role;

CREATE OR REPLACE FUNCTION public.validate_program_recruitment_period()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NEW.category <> 'PROGRAM' OR NEW.is_recruiting IS DISTINCT FROM true THEN RETURN NEW; END IF;
    IF NEW.recruitment_start_at IS NULL THEN
        IF TG_OP = 'UPDATE' AND OLD.recruitment_start_at IS NOT NULL THEN
            RAISE EXCEPTION '설정한 모집 시작 일시는 삭제할 수 없습니다.' USING ERRCODE = '23514';
        END IF;
        -- DB rollout precedes hosting deployment. Old clients cannot send a
        -- start timestamp yet, so preserve their inserts as well as old rows.
        -- The new form requires both timestamps; never remove an existing one.
        RETURN NEW;
    END IF;
    IF NEW.recruitment_deadline IS NULL OR NEW.recruitment_start_at >= NEW.recruitment_deadline THEN
        RAISE EXCEPTION '모집 종료는 시작보다 뒤여야 합니다.' USING ERRCODE = '23514';
    END IF;
    IF NEW.is_challenge IS DISTINCT FROM true AND (NEW.program_date IS NULL OR NEW.recruitment_deadline > NEW.program_date::timestamptz) THEN
        RAISE EXCEPTION '모집 종료는 프로그램 시작 시각보다 늦을 수 없습니다.' USING ERRCODE = '23514';
    END IF;
    IF NEW.is_challenge = true AND (NEW.program_end_date IS NULL OR NEW.recruitment_deadline >= ((NEW.program_end_date::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul')) THEN
        RAISE EXCEPTION '모집 종료는 챌린지 종료일 이내여야 합니다.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_program_recruitment_period
    BEFORE INSERT OR UPDATE ON public.notices
    FOR EACH ROW EXECUTE FUNCTION public.validate_program_recruitment_period();

CREATE OR REPLACE FUNCTION public.guard_program_recruitment_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    program public.notices%ROWTYPE;
    check_time timestamptz;
BEGIN
    -- Attendance, mission progress and rewards must remain independent.
    IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status
        AND NEW.notice_id IS NOT DISTINCT FROM OLD.notice_id
        AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;
    IF TG_OP <> 'DELETE' AND NEW.status NOT IN ('JOIN', 'WAITLIST') THEN RETURN NEW; END IF;

    SELECT * INTO program FROM public.notices
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.notice_id ELSE NEW.notice_id END FOR SHARE;
    IF NOT FOUND OR program.category <> 'PROGRAM' OR program.is_recruiting IS DISTINCT FROM true
        OR program.recruitment_start_at IS NULL THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- Admin corrections remain possible, but only with a server-verified role.
    IF auth.role() = 'service_role' OR public.calendar_is_admin() THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    check_time := clock_timestamp();
    IF check_time < program.recruitment_start_at THEN
        RAISE EXCEPTION '아직 모집 시작 전입니다.' USING ERRCODE = '23514';
    END IF;
    IF program.recruitment_deadline IS NULL OR check_time >= program.recruitment_deadline
        OR program.program_status IN ('COMPLETED', 'CANCELLED')
        OR coalesce((program.guest_properties->>'is_ended')::boolean, (to_jsonb(program)->>'is_ended')::boolean, false) THEN
        RAISE EXCEPTION '신청 및 취소 기간이 종료되었습니다.' USING ERRCODE = '23514';
    END IF;
    IF TG_OP <> 'DELETE' AND program.recruitment_details_ready IS DISTINCT FROM true THEN
        RAISE EXCEPTION '상세 정보 준비 중입니다.' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER guard_program_recruitment_response
    BEFORE INSERT OR UPDATE OR DELETE ON public.notice_responses
    FOR EACH ROW EXECUTE FUNCTION public.guard_program_recruitment_response();

NOTIFY pgrst, 'reload schema';
COMMIT;
