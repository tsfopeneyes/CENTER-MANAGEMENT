-- 1. notices 테이블에 view_count 컬럼 추가
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

-- 2. 원자적 조회수 증가 SQL 함수 생성
CREATE OR REPLACE FUNCTION increment_notice_views(p_notice_id BIGINT)
RETURNS void AS $$
BEGIN
    UPDATE public.notices
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = p_notice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
