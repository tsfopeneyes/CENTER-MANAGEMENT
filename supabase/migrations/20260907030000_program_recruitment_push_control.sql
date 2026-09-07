BEGIN;

CREATE OR REPLACE FUNCTION public.guard_recruitment_interest() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
BEGIN
    NEW.updated_at := statement_timestamp();
    IF coalesce(auth.role(),'')='service_role' OR
        (nullif(auth.role(),'') IS NULL AND session_user IN ('postgres','supabase_admin')) THEN
        RETURN NEW;
    END IF;
    IF NEW.auth_user_id IS DISTINCT FROM auth.uid() OR coalesce(auth.jwt()->>'is_anonymous','false')<>'false' THEN
        RAISE EXCEPTION 'Sign in to manage your own recruitment alerts' USING ERRCODE='42501';
    END IF;
    IF TG_OP='UPDATE' AND
        (to_jsonb(NEW)-ARRAY['enabled','fcm_token','updated_at']) IS DISTINCT FROM
        (to_jsonb(OLD)-ARRAY['enabled','fcm_token','updated_at']) THEN
        RAISE EXCEPTION 'Alert delivery fields are server-managed' USING ERRCODE='42501';
    END IF;
    IF NEW.enabled THEN
        IF NOT EXISTS(SELECT 1 FROM public.notices n WHERE n.id=NEW.notice_id
            AND n.category='PROGRAM' AND n.is_recruiting IS TRUE AND coalesce(n.is_private,false)=false
            AND n.recruitment_start_at>statement_timestamp()
            AND n.recruitment_deadline>n.recruitment_start_at
            AND coalesce(n.program_status,'ACTIVE') NOT IN ('CANCELLED','COMPLETED')
            AND coalesce(n.guest_properties->>'is_ended','false')<>'true') THEN
            RAISE EXCEPTION 'Recruitment alert registration is not available' USING ERRCODE='23514';
        END IF;
        IF TG_OP='UPDATE' AND OLD.delivery_state IN ('sent','sending','uncertain') THEN
            RAISE EXCEPTION 'Recruitment alert already dispatched or awaiting confirmation' USING ERRCODE='23514';
        END IF;
    END IF;
    NEW.revision := gen_random_uuid();
    NEW.attempt_id := NULL;
    IF TG_OP='INSERT' OR OLD.delivery_state NOT IN ('sent','sending','uncertain') THEN
        NEW.delivery_state := 'pending'; NEW.attempts := 0;
        NEW.next_attempt_at := statement_timestamp(); NEW.last_error_code := NULL;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_recruitment_interest() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE VIEW public.program_recruitment_alert_due WITH (security_barrier=true) AS
SELECT i.*, n.title, n.recruitment_start_at, n.recruitment_deadline
FROM public.program_recruitment_interests i
JOIN public.notices n ON n.id=i.notice_id
JOIN auth.users a ON a.id=i.auth_user_id
WHERE i.enabled AND i.delivery_state IN ('pending','retry','sending')
    AND i.next_attempt_at<=statement_timestamp()
    AND coalesce(a.is_anonymous,false)=false
    AND (a.banned_until IS NULL OR a.banned_until<=statement_timestamp())
    AND n.category='PROGRAM' AND n.is_recruiting IS TRUE AND coalesce(n.is_private,false)=false
    AND n.recruitment_details_ready IS TRUE
    AND n.recruitment_start_at<=statement_timestamp()
    AND n.recruitment_deadline>statement_timestamp()
    AND n.recruitment_deadline>n.recruitment_start_at
    AND coalesce(n.program_status,'ACTIVE') NOT IN ('CANCELLED','COMPLETED')
    AND coalesce(n.guest_properties->>'is_ended','false')<>'true'
    AND ((n.is_challenge IS TRUE AND (n.program_end_date IS NULL OR
        statement_timestamp()<((left(n.program_end_date::text,10)::date+1)::timestamp AT TIME ZONE 'Asia/Seoul')))
        OR (n.is_challenge IS DISTINCT FROM true AND (n.program_date IS NULL OR n.program_date>statement_timestamp())));
REVOKE ALL ON public.program_recruitment_alert_due FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.program_recruitment_alert_due TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
