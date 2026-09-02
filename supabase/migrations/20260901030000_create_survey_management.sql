-- Add a survey library without replacing or deleting legacy survey data.
CREATE TABLE IF NOT EXISTS public.surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  survey_type TEXT NOT NULL CHECK (survey_type IN ('CHECKIN', 'CHECKOUT')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  is_legacy BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS surveys_one_active_per_type
  ON public.surveys (survey_type) WHERE status = 'ACTIVE';

ALTER TABLE public.checkin_surveys
  ADD COLUMN IF NOT EXISTS survey_id UUID REFERENCES public.surveys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS survey_snapshot JSONB;

CREATE INDEX IF NOT EXISTS checkin_surveys_survey_id_idx
  ON public.checkin_surveys(survey_id);

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active surveys" ON public.surveys;
CREATE POLICY "Anyone can read active surveys"
  ON public.surveys FOR SELECT
  USING (status = 'ACTIVE' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage surveys" ON public.surveys;
CREATE POLICY "Authenticated users can manage surveys"
  ON public.surveys FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Turn the two existing configs into first-class surveys. The notice rows remain
-- untouched because older clients use them as a compatibility fallback.
INSERT INTO public.surveys (title, survey_type, config, status, is_legacy)
SELECT
  CASE WHEN n.title = 'CHECKIN_SURVEY_CONFIG' THEN '기존 입실 설문' ELSE '기존 퇴실 설문' END,
  CASE WHEN n.title = 'CHECKIN_SURVEY_CONFIG' THEN 'CHECKIN' ELSE 'CHECKOUT' END,
  n.content::jsonb,
  'ACTIVE',
  true
FROM public.notices n
WHERE n.category = 'SYSTEM'
  AND n.title IN ('CHECKIN_SURVEY_CONFIG', 'CHECKOUT_SURVEY_CONFIG')
  AND n.content IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.surveys s
    WHERE s.survey_type = CASE WHEN n.title = 'CHECKIN_SURVEY_CONFIG' THEN 'CHECKIN' ELSE 'CHECKOUT' END
  );

NOTIFY pgrst, 'reload schema';
