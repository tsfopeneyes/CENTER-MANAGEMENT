BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.program_push_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_id bigint NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
    plan_key text NOT NULL,
    timing text NOT NULL CHECK (timing IN ('AT_START','BEFORE_PROGRAM_1D','BEFORE_PROGRAM_1H','CUSTOM','NOW')),
    audience text NOT NULL CHECK (audience IN ('TARGET_REGIONS','ALL','APPLICANTS')),
    scheduled_at timestamptz NOT NULL,
    state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','SENDING','SENT','PARTIAL','FAILED','UNCERTAIN','CANCELLED')),
    target_count integer NOT NULL DEFAULT 0,
    success_count integer NOT NULL DEFAULT 0,
    failure_count integer NOT NULL DEFAULT 0,
    sent_at timestamptz,
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(notice_id,plan_key)
);
CREATE INDEX program_push_jobs_due_idx ON public.program_push_jobs(scheduled_at)
    WHERE state IN ('PENDING','FAILED');
ALTER TABLE public.program_push_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_push_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.program_push_jobs TO service_role;

CREATE TABLE public.program_push_recipients (
    job_id uuid NOT NULL REFERENCES public.program_push_jobs(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING','SENDING','SENT','FAILED','UNCERTAIN','SKIPPED')),
    device_count integer NOT NULL DEFAULT 0,
    success_count integer NOT NULL DEFAULT 0,
    failure_count integer NOT NULL DEFAULT 0,
    last_error_code text,
    sent_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(job_id,user_id)
);
ALTER TABLE public.program_push_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_push_recipients FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.program_push_recipients TO service_role;

CREATE OR REPLACE FUNCTION public.sync_program_push_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
    plan jsonb;
    plan_key_value text;
    timing_value text;
    audience_value text;
    due_at timestamptz;
    resend_requested boolean := false;
BEGIN
    IF TG_OP='UPDATE' THEN
        resend_requested := nullif(OLD.guest_properties->>'recruitment_push_dispatched_at','') IS NOT NULL
            AND nullif(NEW.guest_properties->>'recruitment_push_dispatched_at','') IS NULL;
    END IF;
    IF TG_OP='UPDATE' AND NEW.guest_properties IS NOT DISTINCT FROM OLD.guest_properties
        AND NEW.recruitment_start_at IS NOT DISTINCT FROM OLD.recruitment_start_at
        AND NEW.program_date IS NOT DISTINCT FROM OLD.program_date
        AND NEW.program_start_date IS NOT DISTINCT FROM OLD.program_start_date
        AND NEW.is_private IS NOT DISTINCT FROM OLD.is_private
        AND NEW.program_status IS NOT DISTINCT FROM OLD.program_status THEN
        RETURN NEW;
    END IF;

    IF NEW.category<>'PROGRAM' OR coalesce((NEW.guest_properties->>'recruitment_push_enabled')::boolean,false)=false
        OR coalesce(NEW.is_private,false) OR coalesce(NEW.program_status,'ACTIVE') IN ('CANCELLED','COMPLETED') THEN
        UPDATE public.program_push_jobs SET state='CANCELLED',updated_at=statement_timestamp()
        WHERE notice_id=NEW.id AND state NOT IN ('SENT','PARTIAL');
        RETURN NEW;
    END IF;

    UPDATE public.program_push_jobs SET state='CANCELLED',updated_at=statement_timestamp()
    WHERE notice_id=NEW.id AND state NOT IN ('SENT','PARTIAL')
      AND plan_key NOT IN (SELECT coalesce(value->>'id',value->>'timing') FROM jsonb_array_elements(coalesce(NEW.guest_properties->'recruitment_push_plans','[]'::jsonb)));

    FOR plan IN SELECT value FROM jsonb_array_elements(coalesce(NEW.guest_properties->'recruitment_push_plans','[]'::jsonb)) LOOP
        timing_value := plan->>'timing';
        plan_key_value := coalesce(nullif(plan->>'id',''),timing_value);
        audience_value := coalesce(plan->>'audience','TARGET_REGIONS');
        IF timing_value IN ('BEFORE_PROGRAM_1D','BEFORE_PROGRAM_1H') THEN audience_value := 'APPLICANTS'; END IF;
        IF audience_value NOT IN ('TARGET_REGIONS','ALL','APPLICANTS') THEN audience_value := 'TARGET_REGIONS'; END IF;
        due_at := CASE timing_value
            WHEN 'AT_START' THEN NEW.recruitment_start_at
            WHEN 'BEFORE_PROGRAM_1D' THEN coalesce(NEW.program_date, NEW.program_start_date::timestamp AT TIME ZONE 'Asia/Seoul') - interval '1 day'
            WHEN 'BEFORE_PROGRAM_1H' THEN coalesce(NEW.program_date, NEW.program_start_date::timestamp AT TIME ZONE 'Asia/Seoul') - interval '1 hour'
            WHEN 'NOW' THEN statement_timestamp()
            WHEN 'CUSTOM' THEN CASE WHEN coalesce(plan->>'scheduled_at','') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' THEN (plan->>'scheduled_at')::timestamptz END
            ELSE NULL END;
        IF due_at IS NULL THEN CONTINUE; END IF;
        INSERT INTO public.program_push_jobs(notice_id,plan_key,timing,audience,scheduled_at)
        VALUES(NEW.id,plan_key_value,timing_value,audience_value,due_at)
        ON CONFLICT(notice_id,plan_key) DO UPDATE SET timing=EXCLUDED.timing,audience=EXCLUDED.audience,scheduled_at=EXCLUDED.scheduled_at,
            state='PENDING',target_count=0,success_count=0,failure_count=0,sent_at=NULL,last_error_code=NULL,updated_at=statement_timestamp()
        WHERE program_push_jobs.state NOT IN ('SENT','PARTIAL','SENDING','UNCERTAIN') OR resend_requested;
    END LOOP;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_program_push_job() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS sync_program_push_job_after_notice_write ON public.notices;
CREATE TRIGGER sync_program_push_job_after_notice_write
AFTER INSERT OR UPDATE OF guest_properties,recruitment_start_at,program_date,program_start_date,is_private,program_status ON public.notices
FOR EACH ROW EXECUTE FUNCTION public.sync_program_push_job();

-- Interest opt-ins are a separate, unconditional recruitment-start alert.
CREATE OR REPLACE VIEW public.program_recruitment_alert_due WITH (security_barrier=true) AS
SELECT i.*, n.title, n.recruitment_start_at, n.recruitment_deadline
FROM public.program_recruitment_interests i
JOIN public.notices n ON n.id=i.notice_id
JOIN auth.users a ON a.id=i.auth_user_id
WHERE i.enabled AND i.delivery_state IN ('pending','retry','sending') AND i.next_attempt_at<=statement_timestamp()
    AND coalesce(a.is_anonymous,false)=false AND (a.banned_until IS NULL OR a.banned_until<=statement_timestamp())
    AND n.category='PROGRAM' AND n.is_recruiting IS TRUE AND coalesce(n.is_private,false)=false
    AND n.recruitment_details_ready IS TRUE AND n.recruitment_start_at<=statement_timestamp()
    AND n.recruitment_deadline>statement_timestamp() AND n.recruitment_deadline>n.recruitment_start_at
    AND coalesce(n.program_status,'ACTIVE') NOT IN ('CANCELLED','COMPLETED');
REVOKE ALL ON public.program_recruitment_alert_due FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.program_recruitment_alert_due TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
