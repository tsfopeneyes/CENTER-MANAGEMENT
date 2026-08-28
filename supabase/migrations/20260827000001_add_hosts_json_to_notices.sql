ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS hosts JSONB DEFAULT '[]'::jsonb;
UPDATE public.notices SET hosts = json_build_array(json_build_object('host_id', host_id, 'one_liner', host_one_liner)) WHERE host_id IS NOT NULL AND (hosts IS NULL OR hosts = '[]'::jsonb);
