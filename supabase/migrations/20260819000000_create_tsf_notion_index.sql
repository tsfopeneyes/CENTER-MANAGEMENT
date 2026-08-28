-- Dedicated search cache for the TSF Slack assistant.
-- It mirrors identifiers and searchable labels only; it never replaces Notion data.
CREATE TABLE IF NOT EXISTS public.tsf_notion_index (
  notion_page_id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type IN ('project', 'task', 'note')),
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  notion_url TEXT,
  project_page_id TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS tsf_notion_index_type_idx
  ON public.tsf_notion_index (record_type);
CREATE INDEX IF NOT EXISTS tsf_notion_index_title_idx
  ON public.tsf_notion_index (normalized_title);
CREATE INDEX IF NOT EXISTS tsf_notion_index_project_idx
  ON public.tsf_notion_index (project_page_id);

ALTER TABLE public.tsf_notion_index ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
