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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, body, userIds, targetRegions } = await req.json()

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

    // Fetch tokens based on userIds or targetRegions if provided
    let query = supabase.from('users').select('fcm_token, school, role').not('fcm_token', 'is', null);
    if (userIds && userIds.length > 0) {
      query = query.in('id', userIds);
    } else if (targetRegions && Array.isArray(targetRegions) && targetRegions.length > 0) {
      // 1. Get school names associated with target regions (e.g. ['강동'] or ['강서'])
      const { data: schools } = await supabase
        .from('schools')
        .select('name')
        .in('region', targetRegions);

      const targetSchoolNames = (schools || []).map((s: { name: string }) => s.name).filter(Boolean);

      if (targetSchoolNames.length > 0) {
        // Target users from those schools OR admin/staff roles
        query = query.or(`school.in.("${targetSchoolNames.join('","')}"),role.in.(admin,staff,master)`);
      }
    }
    
    const { data: users, error } = await query;
    if (error) throw error;

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
