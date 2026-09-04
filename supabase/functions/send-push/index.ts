// @ts-nocheck
// Deno 환경이므로 로컬 TS 에디터 에러를 무시합니다.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { GoogleAuth } from "npm:google-auth-library";
import webpush from "npm:web-push@3.6.7";

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

const parseStoredPushTokens = (value: unknown): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed.filter(token => typeof token === 'string' && token.length > 0);
  } catch (_) {}
  return [String(value)];
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, title, body, userIds, targetRegions, targetKind, schoolName, noticeId, notificationId, dispatchId: requestedDispatchId, url = '/', manual = false } = await req.json()

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

    // Every push is authorized through the same account-session boundary used
    // by the administrator and member screens. Browser-provided profile IDs
    // are never trusted for sending or attribution.
    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) throw new Error('A signed-in administrator is required.');
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const sessionResponse = await fetch(`${supabaseUrl}/functions/v1/account-auth/session`, {
      method: 'POST',
      headers: { Authorization: authorization, apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'session-status', protocol: 1 }),
    });
    if (!sessionResponse.ok) throw new Error('Your sign-in has expired. Please sign in again.');
    const identity = await sessionResponse.json();
    if (identity?.decision !== 'retain' || !identity?.profileId) throw new Error('Unable to verify the signed-in account.');
    const { data: sender, error: senderError } = await supabase.from('users').select('id,role,user_group').eq('id', identity.profileId).maybeSingle();
    if (senderError || !sender) throw new Error('Unable to verify administrator permissions.');
    const role = String(sender.role || '').toLowerCase();
    const group = String(sender.user_group || '').toLowerCase();
    if (!['admin','staff'].includes(role) && group !== 'staff' && sender.user_group !== '관리자') {
      throw new Error('Only administrators can send push notifications.');
    }

    if (action === 'delete-manual') {
      if (typeof notificationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(notificationId)) throw new Error('A valid notification is required.');
      const { data: source, error: sourceError } = await supabase.from('app_notifications')
        .select('id,content,created_at,sender_id,notification_type').eq('id', notificationId).maybeSingle();
      if (sourceError) throw sourceError;
      if (!source || source.notification_type !== 'MANUAL') throw new Error('The manual notification could not be found.');
      const { data: deleted, error: deleteError } = await supabase.from('app_notifications').delete()
        .eq('notification_type', 'MANUAL').eq('sender_id', source.sender_id)
        .eq('content', source.content).eq('created_at', source.created_at).select('id');
      if (deleteError) throw deleteError;
      return Response.json({ success: true, deletedCount: deleted?.length || 0 }, { headers: corsHeaders });
    }

    if (action === 'delete-dispatch') {
      if (typeof requestedDispatchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestedDispatchId)) throw new Error('A valid dispatch is required.');
      const { data: deleted, error: deleteError } = await supabase.from('push_dispatches').delete()
        .eq('id', requestedDispatchId).select('id');
      if (deleteError) throw deleteError;
      return Response.json({ success: true, deletedCount: deleted?.length || 0 }, { headers: corsHeaders });
    }

    if (action === 'list-dispatches') {
      const { data: dispatches, error: dispatchError } = await supabase.from('push_dispatches')
        .select('id,title,body,target_kind,target_label,created_at').order('created_at', { ascending: false }).limit(50);
      if (dispatchError) throw dispatchError;
      const ids = (dispatches || []).map(item => item.id);
      if (!ids.length) return Response.json({ dispatches: [] }, { headers: corsHeaders });
      const [{ data: recipientRows }, { data: attemptRows }] = await Promise.all([
        supabase.from('push_dispatch_recipients').select('dispatch_id,user_id').in('dispatch_id', ids),
        supabase.from('push_delivery_attempts').select('dispatch_id,device_id,accepted,response_code,displayed_at,clicked_at').in('dispatch_id', ids),
      ]);
      const recipientIds = [...new Set((recipientRows || []).map(row => row.user_id))];
      const deviceIds = [...new Set((attemptRows || []).map(row => row.device_id))];
      const [{ data: recipientUsers }, { data: attemptDevices }] = await Promise.all([
        recipientIds.length ? supabase.from('users').select('id,name,school,role,user_group').in('id', recipientIds) : { data: [] },
        deviceIds.length ? supabase.from('push_devices').select('id,user_id,browser,platform,display_mode').in('id', deviceIds) : { data: [] },
      ]);
      const usersById = new Map((recipientUsers || []).map(user => [user.id, user]));
      const devicesById = new Map((attemptDevices || []).map(device => [device.id, device]));
      const result = (dispatches || []).map(dispatch => ({
        ...dispatch,
        recipients: (recipientRows || []).filter(row => row.dispatch_id === dispatch.id).map(row => usersById.get(row.user_id)).filter(Boolean),
        attempts: (attemptRows || []).filter(row => row.dispatch_id === dispatch.id).map(row => ({
          accepted: row.accepted, responseCode: row.response_code, displayedAt: row.displayed_at,
          clickedAt: row.clicked_at, ...devicesById.get(row.device_id),
        })),
      }));
      return Response.json({ dispatches: result }, { headers: corsHeaders });
    }

    if (!String(title || '').trim() || !String(body || '').trim()) throw new Error('A title and message are required.');
    if (String(title).length > 50 || String(body).length > 160) throw new Error('The notification is too long.');
    if (targetKind === 'USERS' && (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 500)) throw new Error('Valid recipients are required.');
    if (targetKind === 'SCHOOL' && !String(schoolName || '').trim()) throw new Error('A school is required.');

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
    let query = supabase.from('users').select('id, fcm_token, school, role');
    let targetSchoolKeys: Set<string> | null = null;
    if (targetKind === 'USERS' && userIds && userIds.length > 0) {
      query = query.in('id', userIds);
    } else if (targetKind === 'SCHOOL' && String(schoolName || '').trim()) {
      targetSchoolKeys = new Set([normalizeSchoolName(String(schoolName).trim())]);
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

    const userIdsForDelivery = [...new Set(users.map(user => user.id).filter(Boolean))];
    const { data: registeredDevices, error: devicesError } = userIdsForDelivery.length
      ? await supabase.from('push_devices').select('id,user_id,provider,credential,failure_count,enabled').in('user_id', userIdsForDelivery)
      : { data: [], error: null };
    // During rollout an older database may not have the registry yet. The
    // legacy users.fcm_token path remains a direct-table fallback.
    if (devicesError && devicesError.code !== '42P01') throw devicesError;
    const allDevices = devicesError ? [] : (registeredDevices || []);
    const devices = allDevices.filter(device => device.enabled);
    const registeredUsers = new Set(allDevices.map(device => device.user_id));
    const legacyTokens = users.filter(user => !registeredUsers.has(user.id)).flatMap(user => parseStoredPushTokens(user.fcm_token));
    const registeredFcm = devices.filter(device => device.provider === 'FCM' && typeof device.credential?.token === 'string');
    const registeredWebPush = devices.filter(device => device.provider === 'WEB_PUSH' && device.credential?.endpoint);
    const tokens = [...new Set([...registeredFcm.map(device => device.credential.token), ...legacyTokens])];
    const targetCount = tokens.length + registeredWebPush.length;

    if (targetCount === 0) {
      return new Response(JSON.stringify({ message: "No valid tokens found" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let dispatchId: string | null = null;
    if (manual) {
      const targetLabel = targetKind === 'SCHOOL' ? String(schoolName || '').trim()
        : targetKind === 'USERS' ? `${userIdsForDelivery.length}명`
        : effectiveTargetRegions.length === 1 ? effectiveTargetRegions[0]
        : '전체';
      const { data: dispatch, error: dispatchError } = await supabase.from('push_dispatches').insert({
        sender_id: sender.id, title: String(title).trim(), body: String(body).trim(),
        target_kind: String(targetKind || 'ALL'), target_label: targetLabel,
      }).select('id').single();
      if (dispatchError) throw dispatchError;
      dispatchId = dispatch.id;
      if (userIdsForDelivery.length) {
        const { error: recipientsError } = await supabase.from('push_dispatch_recipients').insert(
          userIdsForDelivery.map(userId => ({ dispatch_id: dispatchId, user_id: userId }))
        );
        if (recipientsError) throw recipientsError;
      }
    }

    const receiptTokenByDevice = new Map<string, string>();
    if (dispatchId) {
      const trackedDevices = [...registeredFcm, ...registeredWebPush];
      const pendingAttempts = trackedDevices.map(device => {
        const receiptToken = crypto.randomUUID();
        receiptTokenByDevice.set(device.id, receiptToken);
        return {
          dispatch_id: dispatchId,
          device_id: device.id,
          provider: device.provider,
          accepted: false,
          response_code: 'PENDING',
          receipt_token: receiptToken,
        };
      });
      if (pendingAttempts.length) {
        const { error: pendingError } = await supabase.from('push_delivery_attempts').insert(pendingAttempts);
        if (pendingError) throw pendingError;
      }
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
    const publicAppUrl = Deno.env.get('PUBLIC_APP_URL')?.trim() || 'https://app.schoolchurchimpact.org';
    const pushLink = new URL(String(url || '/'), publicAppUrl).href;

    // Send the pushes concurrently
    const fcmDeviceByToken = new Map(registeredFcm.map(device => [device.credential.token, device]));
    const fcmResponses = await Promise.all(tokens.map(async (token) => {
      const trackedDevice = fcmDeviceByToken.get(token) || null;
      const receiptToken = trackedDevice ? receiptTokenByDevice.get(trackedDevice.id) || '' : '';
      const fcmPayload = {
        message: {
          token: token,
          notification: { title, body },
          data: { url: String(url || '/'), ...(noticeId ? { noticeId: String(noticeId) } : {}),
            ...(dispatchId ? { dispatchId } : {}), ...(receiptToken ? { receiptToken } : {}) },
          webpush: { fcm_options: { link: pushLink } },
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
      return { ok: res.ok, result: await res.json(), device: trackedDevice, provider: 'FCM', receiptToken };
    }));

    const webPushPublicKey = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY')?.trim();
    const webPushPrivateKey = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY')?.trim();
    const webPushSubject = Deno.env.get('WEB_PUSH_VAPID_SUBJECT')?.trim() || 'mailto:admin@schoolchurchimpact.org';
    if (registeredWebPush.length && (!webPushPublicKey || !webPushPrivateKey)) throw new Error('Standard Web Push credentials are not configured.');
    if (registeredWebPush.length) webpush.setVapidDetails(webPushSubject, webPushPublicKey!, webPushPrivateKey!);
    const webPushResponses = await Promise.all(registeredWebPush.map(async (device) => {
      const receiptToken = receiptTokenByDevice.get(device.id) || '';
      const webPushPayload = JSON.stringify({ notification: { title, body }, data: {
        url: String(url || '/'), ...(noticeId ? { noticeId: String(noticeId) } : {}),
        ...(dispatchId ? { dispatchId } : {}), ...(receiptToken ? { receiptToken } : {}),
      } });
      try {
        const result = await webpush.sendNotification(device.credential, webPushPayload, {
          TTL: 86400,
          // Samsung Internet's push service still has installations that only
          // wake reliably with the legacy aesgcm encoding. Other standards-
          // based subscribers use the current aes128gcm encoding.
          contentEncoding: device.browser === 'Samsung Internet' ? 'aesgcm' : 'aes128gcm',
        });
        return { ok: result.statusCode >= 200 && result.statusCode < 300, result: { status: String(result.statusCode) }, device, provider: 'WEB_PUSH', receiptToken };
      } catch (error) {
        return { ok: false, result: { error: { status: String(error?.statusCode || 'WEB_PUSH_FAILED'), message: error?.message } }, device, provider: 'WEB_PUSH', receiptToken };
      }
    }));
    const responses = [...fcmResponses, ...webPushResponses];

    await Promise.all(responses.filter(item => item.device).map(async item => {
      const code = item.ok ? null : String(item.result?.error?.status || 'SEND_FAILED').slice(0, 120);
      const permanent = ['404', '410', 'UNREGISTERED', 'NOT_FOUND'].includes(code || '');
      await supabase.from('push_devices').update(item.ok
        ? { last_success_at: new Date().toISOString(), failure_count: 0, last_failure_code: null }
        : { failure_count: Number(item.device.failure_count || 0) + 1, last_failure_code: code, ...(permanent ? { enabled: false } : {}) })
        .eq('id', item.device.id);
      if (dispatchId && item.receiptToken) {
        await supabase.from('push_delivery_attempts').update({
          accepted: item.ok, response_code: item.ok ? 'ACCEPTED' : code,
        }).eq('receipt_token', item.receiptToken);
      } else {
        await supabase.from('push_delivery_attempts').insert({ dispatch_id: dispatchId, device_id: item.device.id, provider: item.provider, accepted: item.ok, response_code: item.ok ? 'ACCEPTED' : code });
      }
    }));

    if (manual) {
      const targetGroup = targetKind === 'SCHOOL' ? `SCHOOL_${String(schoolName).trim()}`
        : targetKind === 'USERS' ? null
        : effectiveTargetRegions.length === 1 ? `REGION_${effectiveTargetRegions[0]}` : '전체';
      const notificationRows = targetKind === 'USERS'
        ? [...new Set(users.map(user => user.id).filter(Boolean))].map(id => ({
            sender_id: sender.id, target_group: `USER_${id}`, content: `${String(title).trim()}\n${String(body).trim()}`,
            notice_id: null, notification_type: 'MANUAL', dispatch_id: dispatchId
          }))
        : [{
        sender_id: sender.id,
        target_group: targetGroup,
        content: `${String(title).trim()}\n${String(body).trim()}`,
        notice_id: null,
        notification_type: 'MANUAL', dispatch_id: dispatchId,
      }];
      const { error: historyError } = await supabase.from('app_notifications').insert(notificationRows);
      if (historyError) throw historyError;
    }

    const failureReasons = [...new Set(responses.filter(item => !item.ok).map(item =>
      item.result?.error?.status || item.result?.error?.message || 'FCM_SEND_FAILED'
    ))];
    return new Response(JSON.stringify({ success: true, dispatchId, targetCount, successCount: responses.filter(item => item.ok).length, failureCount: responses.filter(item => !item.ok).length, failureReasons }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
