import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max);

async function verifiedProfileId(req: Request, supabaseUrl: string, publishableKey: string) {
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('A signed-in account is required.');
  const response = await fetch(`${supabaseUrl}/functions/v1/account-auth/session`, {
    method: 'POST',
    headers: { Authorization: authorization, apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'session-status', protocol: 1 }),
  });
  if (!response.ok) throw new Error('Unable to verify the signed-in account.');
  const result = await response.json();
  if (result?.decision !== 'retain' || !result?.profileId) throw new Error('Unable to verify the signed-in account.');
  return result.profileId as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const profileId = await verifiedProfileId(req, supabaseUrl, publishableKey);
    const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const payload = await req.json();
    const action = clean(payload?.action, 20);
    const deviceId = clean(payload?.deviceId, 128);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(deviceId)) throw new Error('Invalid device identifier.');

    if (action === 'status') {
      const { data, error } = await db.from('push_devices').select('provider,enabled,last_seen_at')
        .eq('user_id', profileId).eq('device_id', deviceId).maybeSingle();
      if (error) throw error;
      return Response.json({ registered: Boolean(data?.enabled), provider: data?.provider || null }, { headers: corsHeaders });
    }

    if (action === 'unregister') {
      const { error } = await db.from('push_devices').update({ enabled: false, updated_at: new Date().toISOString() })
        .eq('user_id', profileId).eq('device_id', deviceId);
      if (error) throw error;
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    if (action !== 'register') throw new Error('Unsupported action.');
    const provider = payload?.provider === 'WEB_PUSH' ? 'WEB_PUSH' : payload?.provider === 'FCM' ? 'FCM' : '';
    if (!provider) throw new Error('Invalid push provider.');
    const credential = payload?.credential;
    if (provider === 'FCM' && (typeof credential?.token !== 'string' || credential.token.length < 20)) throw new Error('Invalid FCM credential.');
    if (provider === 'WEB_PUSH' && (typeof credential?.endpoint !== 'string' || !credential.endpoint.startsWith('https://') ||
      typeof credential?.keys?.p256dh !== 'string' || typeof credential?.keys?.auth !== 'string')) throw new Error('Invalid Web Push credential.');

    const row = {
      user_id: profileId, device_id: deviceId, provider, credential,
      browser: clean(payload?.browser, 40) || 'unknown', platform: clean(payload?.platform, 40) || 'unknown',
      display_mode: payload?.displayMode === 'standalone' ? 'standalone' : 'browser', enabled: true,
      last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(), failure_count: 0, last_failure_code: null,
    };
    const { error } = await db.from('push_devices').upsert(row, { onConflict: 'user_id,device_id' });
    if (error) throw error;
    return Response.json({ success: true, provider }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Push registration failed.' },
      { status: 400, headers: corsHeaders });
  }
});
