-- Phase 1: introduce the correctly branded column without breaking older clients.
ALTER TABLE public.notices
ADD COLUMN IF NOT EXISTS challenge_show_haifn_btn boolean DEFAULT false;

UPDATE public.notices
SET challenge_show_haifn_btn = COALESCE(challenge_show_hyphen_btn, false)
WHERE challenge_show_haifn_btn IS DISTINCT FROM COALESCE(challenge_show_hyphen_btn, false);

CREATE OR REPLACE FUNCTION public.sync_challenge_show_haifn_btn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.challenge_show_haifn_btn := COALESCE(NEW.challenge_show_haifn_btn, NEW.challenge_show_hyphen_btn, false);
        NEW.challenge_show_hyphen_btn := NEW.challenge_show_haifn_btn;
    ELSIF NEW.challenge_show_haifn_btn IS DISTINCT FROM OLD.challenge_show_haifn_btn THEN
        NEW.challenge_show_hyphen_btn := NEW.challenge_show_haifn_btn;
    ELSIF NEW.challenge_show_hyphen_btn IS DISTINCT FROM OLD.challenge_show_hyphen_btn THEN
        NEW.challenge_show_haifn_btn := NEW.challenge_show_hyphen_btn;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_challenge_show_haifn_btn ON public.notices;
CREATE TRIGGER trg_sync_challenge_show_haifn_btn
BEFORE INSERT OR UPDATE OF challenge_show_haifn_btn, challenge_show_hyphen_btn
ON public.notices
FOR EACH ROW
EXECUTE FUNCTION public.sync_challenge_show_haifn_btn();

COMMENT ON COLUMN public.notices.challenge_show_haifn_btn IS
'정식 표기(haifn)를 사용하는 챌린지 완료 후 회원 전환 버튼 노출 여부';
