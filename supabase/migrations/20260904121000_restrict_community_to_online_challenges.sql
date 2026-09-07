-- Community channels are available only for online challenges.
CREATE OR REPLACE FUNCTION public.sync_notice_community_channel() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.community_enabled AND NEW.is_challenge AND NEW.challenge_format='ONLINE' THEN
  INSERT INTO public.community_channels(name,channel_type,source_notice_id,status) VALUES(NEW.title,'CHALLENGE',NEW.id,'ACTIVE')
  ON CONFLICT(source_notice_id) DO UPDATE SET name=EXCLUDED.name,status='ACTIVE',updated_at=now();
 ELSE
  UPDATE public.community_channels SET status='CLOSED',updated_at=now() WHERE source_notice_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_notice_community_channel ON public.notices;
CREATE TRIGGER trg_sync_notice_community_channel
AFTER INSERT OR UPDATE OF community_enabled,title,is_challenge,challenge_format ON public.notices
FOR EACH ROW EXECUTE FUNCTION public.sync_notice_community_channel();

UPDATE public.notices
SET community_enabled=false, community_mission_mode='NONE', community_image_required=false
WHERE is_challenge=true AND challenge_format='OFFLINE' AND community_enabled=true;

UPDATE public.community_channels c SET status='CLOSED',updated_at=now()
FROM public.notices n
WHERE c.source_notice_id=n.id AND n.challenge_format='OFFLINE';
