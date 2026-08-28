ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS host_ids UUID[] DEFAULT '{}';
UPDATE public.notices SET host_ids = ARRAY[host_id] WHERE host_id IS NOT NULL;
