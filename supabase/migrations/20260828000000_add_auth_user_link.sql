-- Links legacy application profiles to Supabase Auth users without changing
-- existing profile IDs or any historical coffee-chat records.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS users_auth_user_id_idx
  ON public.users(auth_user_id);

NOTIFY pgrst, 'reload schema';
