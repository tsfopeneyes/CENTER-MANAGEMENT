ALTER TABLE public.notice_responses
ADD COLUMN IF NOT EXISTS application_answers jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.notice_responses.application_answers IS
'프로그램별 관리자 정의 추가 신청 항목의 답변';
