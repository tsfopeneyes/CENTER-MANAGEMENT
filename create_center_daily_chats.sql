-- Create center_daily_chats table
CREATE TABLE IF NOT EXISTS public.center_daily_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_code TEXT NOT NULL,       -- '하이픈' | '이높플레이스'
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    user_role TEXT DEFAULT '학생',   -- '학생', '스처쌤'
    message TEXT NOT NULL,
    image_url TEXT,                 -- 사진 첨부 URL
    reactions JSONB DEFAULT '{}'::jsonb, -- 이모지 리액션 { "👍": ["user_id1"], ... }
    is_hidden BOOLEAN DEFAULT false,
    report_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure columns exist if table was created previously
ALTER TABLE public.center_daily_chats ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.center_daily_chats ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;

-- Create Index for fast querying by center and date
CREATE INDEX IF NOT EXISTS idx_center_daily_chats_center_created 
ON public.center_daily_chats (center_code, created_at DESC);

-- Enable RLS
ALTER TABLE public.center_daily_chats ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow ALL authenticated/public users to read, insert, update, delete
DROP POLICY IF EXISTS "Allow select for center_daily_chats" ON public.center_daily_chats;
CREATE POLICY "Allow select for center_daily_chats" 
ON public.center_daily_chats FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Allow insert for center_daily_chats" ON public.center_daily_chats;
CREATE POLICY "Allow insert for center_daily_chats" 
ON public.center_daily_chats FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for center_daily_chats" ON public.center_daily_chats;
CREATE POLICY "Allow update for center_daily_chats" 
ON public.center_daily_chats FOR UPDATE 
USING (true);

DROP POLICY IF EXISTS "Allow delete for center_daily_chats" ON public.center_daily_chats;
CREATE POLICY "Allow delete for center_daily_chats" 
ON public.center_daily_chats FOR DELETE 
USING (true);

-- Enable Supabase Realtime for center_daily_chats
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'center_daily_chats'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.center_daily_chats;
    END IF;
END $$;
