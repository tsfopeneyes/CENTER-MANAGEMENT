ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS community_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS community_mission_mode text NOT NULL DEFAULT 'NONE' CHECK (community_mission_mode IN ('NONE','AUTO','REVIEW'));
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS community_image_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.notices ADD COLUMN IF NOT EXISTS community_after_end text NOT NULL DEFAULT 'READ_ONLY' CHECK (community_after_end IN ('READ_ONLY','CLOSED'));

CREATE TABLE IF NOT EXISTS public.community_channels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 channel_type text NOT NULL DEFAULT 'CHALLENGE' CHECK(channel_type IN ('GLOBAL','CHALLENGE','PROGRAM','COHORT','PRIVATE')),
 source_notice_id bigint UNIQUE REFERENCES public.notices(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','READ_ONLY','CLOSED','ARCHIVED')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.community_channel_members (
 channel_id uuid NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 member_role text NOT NULL DEFAULT 'MEMBER' CHECK(member_role IN ('MEMBER','MODERATOR')),
 joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(channel_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.community_channel_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, content text NOT NULL DEFAULT '', image_url text,
 mission_id text, mission_date date, is_hidden boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(length(trim(content))>0 OR image_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS community_channel_posts_feed_idx ON public.community_channel_posts(channel_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.community_channel_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid NOT NULL REFERENCES public.community_channel_posts(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, content text NOT NULL CHECK(length(trim(content))>0), is_hidden boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.community_channel_reactions (
 post_id uuid NOT NULL REFERENCES public.community_channel_posts(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, emoji text NOT NULL CHECK(length(emoji) BETWEEN 1 AND 32),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(post_id,user_id,emoji)
);

CREATE OR REPLACE FUNCTION public.sync_notice_community_channel() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.community_enabled AND NEW.is_challenge THEN
  INSERT INTO public.community_channels(name,channel_type,source_notice_id,status) VALUES(NEW.title,'CHALLENGE',NEW.id,'ACTIVE')
  ON CONFLICT(source_notice_id) DO UPDATE SET name=EXCLUDED.name,status='ACTIVE',updated_at=now();
 ELSE UPDATE public.community_channels SET status='CLOSED',updated_at=now() WHERE source_notice_id=NEW.id; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_notice_community_channel ON public.notices;
CREATE TRIGGER trg_sync_notice_community_channel AFTER INSERT OR UPDATE OF community_enabled,title,is_challenge ON public.notices FOR EACH ROW EXECUTE FUNCTION public.sync_notice_community_channel();

CREATE OR REPLACE FUNCTION public.can_access_community_channel(p_channel_id uuid,p_profile_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM calendar_private.admin_identities ai WHERE ai.auth_user_id=auth.uid()) OR EXISTS(
  SELECT 1 FROM public.community_channels c JOIN public.notices n ON n.id=c.source_notice_id JOIN public.notice_responses nr ON nr.notice_id=c.source_notice_id JOIN public.users u ON u.id=nr.user_id
  WHERE c.id=p_channel_id AND c.status<>'CLOSED' AND NOT(n.program_end_date<CURRENT_DATE AND n.community_after_end='CLOSED') AND nr.status='JOIN' AND (u.id=COALESCE(p_profile_id,auth.uid()) OR u.auth_user_id=auth.uid())
 ) OR EXISTS(SELECT 1 FROM public.community_channel_members m JOIN public.users u ON u.id=m.user_id
  WHERE m.channel_id=p_channel_id AND (u.id=COALESCE(p_profile_id,auth.uid()) OR u.auth_user_id=auth.uid()));
$$;

ALTER TABLE public.community_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_channel_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_channel_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_channel_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_channels_read ON public.community_channels FOR SELECT USING(public.can_access_community_channel(id));
CREATE POLICY community_channels_admin_update ON public.community_channels FOR UPDATE USING(EXISTS(SELECT 1 FROM calendar_private.admin_identities ai WHERE ai.auth_user_id=auth.uid()));
CREATE POLICY channel_posts_read ON public.community_channel_posts FOR SELECT USING(public.can_access_community_channel(channel_id));
CREATE POLICY channel_posts_insert ON public.community_channel_posts FOR INSERT WITH CHECK(public.can_access_community_channel(channel_id,author_id) AND EXISTS(SELECT 1 FROM public.community_channels c LEFT JOIN public.notices n ON n.id=c.source_notice_id WHERE c.id=channel_id AND c.status='ACTIVE' AND (n.id IS NULL OR n.program_end_date IS NULL OR n.program_end_date>=CURRENT_DATE)));
CREATE POLICY channel_posts_update ON public.community_channel_posts FOR UPDATE USING(author_id IN(SELECT id FROM public.users WHERE id=auth.uid() OR auth_user_id=auth.uid()));
CREATE POLICY channel_posts_delete ON public.community_channel_posts FOR DELETE USING(author_id IN(SELECT id FROM public.users WHERE id=auth.uid() OR auth_user_id=auth.uid()));
CREATE POLICY channel_posts_admin_update ON public.community_channel_posts FOR UPDATE USING(EXISTS(SELECT 1 FROM calendar_private.admin_identities ai WHERE ai.auth_user_id=auth.uid()));
CREATE POLICY channel_comments_read ON public.community_channel_comments FOR SELECT USING(public.can_access_community_channel((SELECT channel_id FROM public.community_channel_posts WHERE id=post_id)));
CREATE POLICY channel_comments_insert ON public.community_channel_comments FOR INSERT WITH CHECK(user_id IN(SELECT id FROM public.users WHERE id=auth.uid() OR auth_user_id=auth.uid()) AND public.can_access_community_channel((SELECT channel_id FROM public.community_channel_posts WHERE id=post_id),user_id));
CREATE POLICY channel_reactions_read ON public.community_channel_reactions FOR SELECT USING(public.can_access_community_channel((SELECT channel_id FROM public.community_channel_posts WHERE id=post_id)));
CREATE POLICY channel_reactions_write ON public.community_channel_reactions FOR ALL USING(user_id IN(SELECT id FROM public.users WHERE id=auth.uid() OR auth_user_id=auth.uid())) WITH CHECK(user_id IN(SELECT id FROM public.users WHERE id=auth.uid() OR auth_user_id=auth.uid()) AND public.can_access_community_channel((SELECT channel_id FROM public.community_channel_posts WHERE id=post_id),user_id));

CREATE OR REPLACE FUNCTION public.create_channel_post(p_payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_post_id uuid; v_channel_id uuid; v_statuses jsonb; v_mission_id text:=p_payload->>'mission_id'; v_mode text;
BEGIN
 SELECT id INTO v_channel_id FROM public.community_channels WHERE source_notice_id=(p_payload->>'notice_id')::bigint;
 SELECT community_mission_mode INTO v_mode FROM public.notices WHERE id=(p_payload->>'notice_id')::bigint;
 IF EXISTS(SELECT 1 FROM public.notices WHERE id=(p_payload->>'notice_id')::bigint AND community_image_required AND v_mission_id IS NOT NULL AND NULLIF(p_payload->>'image_url','') IS NULL) THEN
  RAISE EXCEPTION 'Mission image is required.' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.community_channel_posts(channel_id,author_id,content,image_url,mission_id,mission_date)
 VALUES(v_channel_id,(p_payload->>'author_id')::uuid,COALESCE(p_payload->>'content',''),p_payload->>'image_url',v_mission_id,NULLIF(p_payload->>'mission_date','')::date) RETURNING id INTO v_post_id;
 IF v_mission_id IS NOT NULL AND v_mode IN('AUTO','REVIEW') THEN
  SELECT COALESCE(challenge_mission_statuses,'{}'::jsonb) INTO v_statuses FROM public.notice_responses
   WHERE notice_id=(p_payload->>'notice_id')::bigint AND user_id=(p_payload->>'author_id')::uuid AND status='JOIN' FOR UPDATE;
  IF NOT COALESCE((v_statuses->v_mission_id->>'completed')::boolean,false) THEN
   v_statuses:=jsonb_set(v_statuses,ARRAY[v_mission_id],jsonb_build_object('completed',v_mode='AUTO','pending',v_mode='REVIEW','auth_type','community_post','post_id',v_post_id,'auth_text',COALESCE(p_payload->>'content',''),'auth_image',p_payload->>'image_url','submitted_at',now()));
   UPDATE public.notice_responses SET challenge_mission_statuses=v_statuses WHERE notice_id=(p_payload->>'notice_id')::bigint AND user_id=(p_payload->>'author_id')::uuid AND status='JOIN';
  END IF;
 END IF;
 RETURN v_post_id;
END $$;
