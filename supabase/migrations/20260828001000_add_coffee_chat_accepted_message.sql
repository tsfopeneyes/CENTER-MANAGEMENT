ALTER TABLE public.coffee_chats
  ADD COLUMN IF NOT EXISTS accepted_message TEXT;

COMMENT ON COLUMN public.coffee_chats.accepted_message
  IS 'Optional short message sent by the staff member when accepting a coffee chat.';
