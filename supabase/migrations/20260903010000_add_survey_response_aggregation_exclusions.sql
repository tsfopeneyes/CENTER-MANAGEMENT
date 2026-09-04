-- Preserve survey responses while allowing administrators to exclude test or
-- invalid submissions from reporting. No response content is deleted.

BEGIN;

ALTER TABLE public.checkin_surveys
  ADD COLUMN IF NOT EXISTS aggregation_excluded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aggregation_excluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS aggregation_excluded_by uuid;

COMMENT ON COLUMN public.checkin_surveys.aggregation_excluded IS
  'When true, keep this response for audit but omit it from survey aggregates.';

REVOKE UPDATE ON public.checkin_surveys FROM authenticated;
GRANT UPDATE (aggregation_excluded, aggregation_excluded_at, aggregation_excluded_by)
  ON public.checkin_surveys TO authenticated;

DROP POLICY IF EXISTS survey_response_admin_exclusion_update ON public.checkin_surveys;
CREATE POLICY survey_response_admin_exclusion_update
  ON public.checkin_surveys
  FOR UPDATE TO authenticated
  USING (public.calendar_is_admin())
  WITH CHECK (public.calendar_is_admin());

CREATE OR REPLACE FUNCTION public.set_survey_response_aggregation_excluded(
  response_id uuid,
  should_exclude boolean
) RETURNS public.checkin_surveys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_response public.checkin_surveys;
BEGIN
  IF NOT public.calendar_is_admin() THEN
    RAISE EXCEPTION 'administrator access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.checkin_surveys
     SET aggregation_excluded = should_exclude,
         aggregation_excluded_at = CASE WHEN should_exclude THEN now() ELSE NULL END,
         aggregation_excluded_by = CASE WHEN should_exclude THEN auth.uid() ELSE NULL END
   WHERE id = response_id
   RETURNING * INTO updated_response;

  IF updated_response.id IS NULL THEN
    RAISE EXCEPTION 'survey response not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN updated_response;
END;
$$;

REVOKE ALL ON FUNCTION public.set_survey_response_aggregation_excluded(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_survey_response_aggregation_excluded(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
