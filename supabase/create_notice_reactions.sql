-- 1. Create notice_reactions table
CREATE TABLE IF NOT EXISTS public.notice_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_id BIGINT NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT notice_reactions_notice_user_emoji_unique UNIQUE (notice_id, user_id, emoji)
);

-- 2. Enable RLS
ALTER TABLE public.notice_reactions ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- Allow anyone (authenticated or anon) to read reactions
CREATE POLICY "Allow public select on notice_reactions" 
    ON public.notice_reactions FOR SELECT 
    USING (true);

-- Allow authenticated users to insert their own reactions
CREATE POLICY "Allow authenticated insert on notice_reactions" 
    ON public.notice_reactions FOR INSERT 
    WITH CHECK (auth.uid() = user_id OR user_id IS NOT NULL);

-- Allow authenticated users to delete their own reactions
CREATE POLICY "Allow authenticated delete on notice_reactions" 
    ON public.notice_reactions FOR DELETE 
    USING (auth.uid() = user_id OR user_id IS NOT NULL);
