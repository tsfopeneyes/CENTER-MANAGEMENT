import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const payload = await req.json();
    const receiptToken = String(payload?.receiptToken || '').trim();
    const event = String(payload?.event || '').toUpperCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptToken)) {
      throw new Error('Invalid receipt token.');
    }
    if (!['DISPLAYED', 'CLICKED'].includes(event)) throw new Error('Invalid receipt event.');

    const db = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      { auth: { persistSession: false } },
    );
    const now = new Date().toISOString();
    const changes = event === 'CLICKED'
      ? { displayed_at: now, clicked_at: now }
      : { displayed_at: now };
    const { data, error } = await db.from('push_delivery_attempts')
      .update(changes).eq('receipt_token', receiptToken).select('id').maybeSingle();
    if (error) throw error;
    return Response.json({ success: Boolean(data) }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to record push receipt.' },
      { status: 400, headers: corsHeaders },
    );
  }
});

