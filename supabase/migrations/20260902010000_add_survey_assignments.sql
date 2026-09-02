-- A survey can be assigned to multiple centers, while each center/event pair
-- resolves to at most one survey.
DROP INDEX IF EXISTS public.surveys_one_active_per_type;

CREATE INDEX IF NOT EXISTS surveys_status_type_idx
  ON public.surveys (survey_type, status);

CREATE TABLE IF NOT EXISTS public.survey_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  center_code TEXT NOT NULL CHECK (center_code IN ('HAIFN', 'ENOUGH_PLACE')),
  survey_type TEXT NOT NULL CHECK (survey_type IN ('CHECKIN', 'CHECKOUT')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (center_code, survey_type)
);

CREATE INDEX IF NOT EXISTS survey_assignments_survey_id_idx
  ON public.survey_assignments (survey_id);

ALTER TABLE public.survey_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read survey assignments" ON public.survey_assignments;
CREATE POLICY "Anyone can read survey assignments"
  ON public.survey_assignments FOR SELECT
  USING (enabled = true OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage survey assignments" ON public.survey_assignments;
CREATE POLICY "Authenticated users can manage survey assignments"
  ON public.survey_assignments FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Preserve today's behavior: existing active surveys are initially connected
-- to HAIFN only. ENOUGH_PLACE remains opt-in from the admin survey page.
INSERT INTO public.survey_assignments (survey_id, center_code, survey_type)
SELECT s.id, 'HAIFN', s.survey_type
FROM public.surveys s
WHERE s.status = 'ACTIVE'
ON CONFLICT (center_code, survey_type) DO NOTHING;

NOTIFY pgrst, 'reload schema';
