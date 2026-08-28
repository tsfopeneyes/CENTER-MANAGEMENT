// @ts-nocheck
// Deno 환경이므로 로컬 TS 에디터 에러를 무시합니다.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleAuth } from "npm:google-auth-library";

// Load the Service Account configuration from Environment Variables
// (e.g. Deno.env.get('FIREBASE_SERVICE_ACCOUNT'))

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const normalizeSchoolName = (name: string = '') => name
  .replace(/\s+/g, '')
  .replace(/여자고등학교$/, '여고')
  .replace(/여자중학교$/, '여중')
  .replace(/과학고등학교$/, '과고')
  .replace(/외국어고등학교$/, '외고')
  .replace(/고등학교$/, '고')
  .replace(/중학교$/, '중')
  .replace(/초등학교$/, '초');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, body, userIds, targetRegions, noticeId } = await req.json()

    // 1. 보안을 위해 환경변수에서 Firebase 키를 가져옵니다.
    const serviceAccountStr = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!serviceAccountStr) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set.");
    }
    const serviceAccount = JSON.parse(serviceAccountStr);

    if (!serviceAccount || !serviceAccount.project_id || !serviceAccount.client_email) {
      throw new Error("Firebase Service Account is not configured properly");
    }

    // Instantiate Supabase client to fetch FCM tokens
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // A notice's target must always come from its saved source record, never
    // from a browser-provided region value. This keeps the push recipient list
    // aligned with the notice even when an old tab has stale form data.
    let effectiveTargetRegions = Array.isArray(targetRegions) ? targetRegions : [];
    if (noticeId) {
      const { data: sourceNotice, error: sourceNoticeError } = await supabase
        .from('notices')
        .select('target_regions')
        .eq('id', noticeId)
        .maybeSingle();

      if (sourceNoticeError || !sourceNotice) {
        throw new Error('The source notice for this push notification could not be found.');
      }
      effectiveTargetRegions = Array.isArray(sourceNotice.target_regions)
        ? sourceNotice.target_regions.filter(Boolean)
        : [];
    }

    // No selection or both center regions means a notice for everyone.
    if (effectiveTargetRegions.length >= 2) {
      effectiveTargetRegions = [];
    }

    // Fetch tokens based on userIds or the verified notice region if provided
    let query = supabase.from('users').select('fcm_token, school, role').not('fcm_token', 'is', null);
    let targetSchoolKeys: Set<string> | null = null;
    if (userIds && userIds.length > 0) {
      query = query.in('id', userIds);
    } else if (effectiveTargetRegions.length > 0) {
      // 1. Get school names associated with target regions (e.g. ['강동'] or ['강서'])
      const { data: schools, error: schoolsError } = await supabase
        .from('schools')
        .select('name')
        .in('region', effectiveTargetRegions);
      if (schoolsError) throw schoolsError;

      targetSchoolKeys = new Set((schools || [])
        .map((school: { name: string }) => normalizeSchoolName(school.name))
        .filter(Boolean));

      // Regional program alerts belong only to students in schools assigned
      // to that region. An unknown/empty region mapping must send to nobody,
      // never fall through to a broadcast.
    }
    
    const { data: queriedUsers, error } = await query;
    if (error) throw error;

    const users = targetSchoolKeys
      ? (queriedUsers || []).filter((user) => targetSchoolKeys.has(normalizeSchoolName(user.school || '')))
      : (queriedUsers || []);

    // Deduplicate FCM tokens to prevent duplicate pushes to the same device
    const rawTokens = users.map(u => u.fcm_token).filter(Boolean);
    const tokens = [...new Set(rawTokens)];

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ message: "No valid tokens found" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Initialize GoogleAuth to get the dynamic OAuth2 token
    const auth = new GoogleAuth({
      credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
      },
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });

    const accessToken = await auth.getAccessToken();
    const projectId = serviceAccount.project_id;

    // Send the pushes concurrently
    const responses = await Promise.all(tokens.map(async (token) => {
      const fcmPayload = {
        message: {
          token: token,
          notification: { title, body },
        }
      };

      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmPayload)
      });
      return res.json();
    }));

    return new Response(JSON.stringify({ success: true, results: responses }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
