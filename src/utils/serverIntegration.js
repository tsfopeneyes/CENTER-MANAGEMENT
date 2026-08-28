import { supabase } from '../supabaseClient';

// Keeps the current notification path active until the Edge Function secrets
// have been configured and tested in production.
export const serverIntegrationsEnabled = () =>
    import.meta.env.VITE_SERVER_INTEGRATIONS_ENABLED === 'true';

// Local verification must never notify a real LINE group or Slack channel.
// Production can also be muted explicitly while a release is being verified.
export const areExternalNotificationsMuted = () => {
    if (import.meta.env.DEV) return true;
    return typeof window !== 'undefined' && localStorage.getItem('notifications_muted_for_testing') === 'true';
};

/**
 * Sends a notification without exposing external-service keys to the browser.
 * When the feature flag is off, callers continue using the existing path.
 */
export const dispatchServerNotification = async (payload) => {
    if (areExternalNotificationsMuted()) return { handled: false, muted: true };
    if (!serverIntegrationsEnabled()) return { handled: false };

    const { data, error } = await supabase.functions.invoke('dispatch-notification', {
        body: { action: 'notify', ...payload },
    });

    if (error) throw error;
    return { handled: true, data };
};

// Slack alerts always use the server-side bot token and configured channel.
// The browser never receives either credential.
export const dispatchSlackAlert = async (message, { threadTs, notificationCategory, locationName } = {}) => {
    if (areExternalNotificationsMuted()) return { skipped: true, muted: true };
    const { data, error } = await supabase.functions.invoke('dispatch-notification', {
        body: {
            action: 'notify',
            message,
            sendLine: false,
            sendDiscord: false,
            sendSlack: true,
            slackThreadTs: threadTs,
            notificationCategory,
            locationName,
        },
    });

    if (error) throw error;
    return data;
};

const slackThreadKey = (userId) => `slack_visit_thread:${userId}`;

export const dispatchVisitSlackAlert = async ({ message, userId, eventType, locationName = '' }) => {
    if (areExternalNotificationsMuted()) return { skipped: true, muted: true };
    // 방문 알림은 장소를 추측하지 않고 하이픈으로 명확히 확인된 경우에만 보냅니다.
    // 이높플레이스뿐 아니라 장소가 불명확한 방문 알림도 차단해 우회 발송을 막습니다.
    const locationText = `${locationName} ${message || ''}`;
    const isEnoughPlace = /이높플레이스|이높|ENOUGH[_\s-]?PLACE|강서/i.test(locationText);
    const isHaifn = /하이픈|HAIFN|강동/i.test(locationText);
    if (isEnoughPlace || !isHaifn) {
        return { skipped: true, reason: 'non-haifn-location' };
    }

    let enabled = (localStorage.getItem('slack_visit_notifications_enabled') ?? localStorage.getItem('slack_notifications_enabled')) !== 'false';
    try {
        const { data: setting } = await supabase
            .from('global_settings')
            .select('value')
            .eq('key', 'slack_visit_notifications_enabled')
            .maybeSingle();
        if (setting?.value !== undefined) {
            enabled = setting.value !== 'false';
            localStorage.setItem('slack_visit_notifications_enabled', String(enabled));
        }
    } catch (error) {
        console.error('Failed to load Slack notification setting:', error);
    }
    if (!enabled) return { skipped: true };
    if (!userId || !['CHECKIN', 'CHECKOUT'].includes(eventType)) {
        return dispatchSlackAlert(message, { notificationCategory: 'visit', locationName });
    }

    const key = slackThreadKey(userId);
    let threadTs = '';
    if (eventType === 'CHECKOUT') {
        try {
            const { data: saved } = await supabase
                .from('global_settings')
                .select('value')
                .eq('key', key)
                .maybeSingle();
            threadTs = JSON.parse(saved?.value || '{}').threadTs || '';
        } catch (error) {
            console.error('Failed to load Slack check-in thread:', error);
        }
    }

    const result = await dispatchSlackAlert(message, { threadTs, notificationCategory: 'visit', locationName });
    const postedThreadTs = result?.results?.slackThreadTs;

    try {
        if (eventType === 'CHECKIN' && postedThreadTs) {
            await supabase.from('global_settings').upsert({
                key,
                value: JSON.stringify({ threadTs: postedThreadTs, createdAt: new Date().toISOString() }),
            }, { onConflict: 'key' });
        }
        if (eventType === 'CHECKOUT') {
            await supabase.from('global_settings').upsert({ key, value: '' }, { onConflict: 'key' });
        }
    } catch (error) {
        console.error('Failed to save Slack visit thread:', error);
    }

    return result;
};
