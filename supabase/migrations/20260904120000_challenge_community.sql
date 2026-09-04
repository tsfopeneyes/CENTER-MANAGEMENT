-- Challenge-scoped community. Existing challenge and raw response data is preserved.
CREATE TABLE IF NOT EXISTS public.challenge_community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id bigint NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '', image_url text, mission_id text, mission_date date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(content)) > 0 OR image_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS challenge_community_posts_feed_idx ON public.challenge_community_posts(challenge_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.challenge_community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid NOT NULL REFERENCES public.challenge_community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, content text NOT NULL CHECK(length(trim(content)) > 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.challenge_community_reactions (
  post_id uuid NOT NULL REFERENCES public.challenge_community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, emoji text NOT NULL CHECK(length(emoji) BETWEEN 1 AND 32), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(post_id,user_id,emoji)
);

CREATE OR REPLACE FUNCTION public.is_challenge_participant(p_challenge_id bigint, p_profile_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.notice_responses nr JOIN public.users u ON u.id=nr.user_id
    WHERE nr.notice_id=p_challenge_id AND nr.status='JOIN'
      AND (u.id=COALESCE(p_profile_id,auth.uid()) OR u.auth_user_id=auth.uid())
  ) OR EXISTS (SELECT 1 FROM calendar_private.admin_identities ai WHERE ai.auth_user_id=auth.uid());
$$;

ALTER TABLE public.challenge_community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_community_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY challenge_posts_read ON public.challenge_community_posts FOR SELECT USING(public.is_challenge_participant(challenge_id));
CREATE POLICY challenge_posts_insert ON public.challenge_community_posts FOR INSERT WITH CHECK(public.is_challenge_participant(challenge_id,author_id));
CREATE POLICY challenge_posts_delete ON public.challenge_community_posts FOR DELETE USING(author_id IN (SELECT id FROM public.users WHERE id=auth.uid() OR auth_user_id=auth.uid()));
CREATE POLICY challenge_comments_read ON public.challenge_community_comments FOR SELECT USING(public.is_challenge_participant((SELECT challenge_id FROM public.challenge_community_posts WHERE id=post_id)));
CREATE POLICY challenge_comments_insert ON public.challenge_community_comments FOR INSERT WITH CHECK(user_id IN (SELECT id FROM public.users WHERE id=auth.uid() OR auth_user_id=auth.uid()) AND public.is_challenge_participant((SELECT challenge_id FROM public.challenge_community_posts WHERE id=post_id),user_id));
CREATE POLICY challenge_reactions_read ON public.challenge_community_reactions FOR SELECT USING(public.is_challenge_participant((SELECT challenge_id FROM public.challenge_community_posts WHERE id=post_id)));
CREATE POLICY challenge_reactions_write ON public.challenge_community_reactions FOR ALL USING(user_id IN (SELECT id FROM public.users WHERE id=auth.uid() OR auth_user_id=auth.uid())) WITH CHECK(user_id IN (SELECT id FROM public.users WHERE id=auth.uid() OR auth_user_id=auth.uid()) AND public.is_challenge_participant((SELECT challenge_id FROM public.challenge_community_posts WHERE id=post_id),user_id));

CREATE OR REPLACE FUNCTION public.create_challenge_community_post(p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_post_id uuid; v_statuses jsonb; v_mission_id text:=p_payload->>'mission_id';
BEGIN
  INSERT INTO public.challenge_community_posts(challenge_id,author_id,content,image_url,mission_id,mission_date)
  VALUES((p_payload->>'challenge_id')::bigint,(p_payload->>'author_id')::uuid,COALESCE(p_payload->>'content',''),p_payload->>'image_url',v_mission_id,NULLIF(p_payload->>'mission_date','')::date)
  RETURNING id INTO v_post_id;
  IF v_mission_id IS NOT NULL THEN
    SELECT COALESCE(challenge_mission_statuses,'{}'::jsonb) INTO v_statuses FROM public.notice_responses
      WHERE notice_id=(p_payload->>'challenge_id')::bigint AND user_id=(p_payload->>'author_id')::uuid AND status='JOIN' FOR UPDATE;
    IF NOT COALESCE((v_statuses->v_mission_id->>'completed')::boolean,false) THEN
      v_statuses:=jsonb_set(v_statuses,ARRAY[v_mission_id],jsonb_build_object('completed',true,'auth_type','community_post','post_id',v_post_id,'auth_text',COALESCE(p_payload->>'content',''),'auth_image',p_payload->>'image_url','submitted_at',now()));
      UPDATE public.notice_responses SET challenge_mission_statuses=v_statuses WHERE notice_id=(p_payload->>'challenge_id')::bigint AND user_id=(p_payload->>'author_id')::uuid AND status='JOIN';
    END IF;
  END IF;
  RETURN v_post_id;
END; $$;
