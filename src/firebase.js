import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { supabase } from './supabaseClient';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

let app;
let messaging;

export const parseStoredPushTokens = (value) => {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return [...new Set(parsed.filter(token => typeof token === 'string' && token))];
    } catch (_) {}
    return [String(value)];
};

export const storedPushTokenIncludes = (value, token) => Boolean(token) && parseStoredPushTokens(value).includes(token);

const base64UrlToBytes = (value) => {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, character => character.charCodeAt(0));
};

const getPushDeviceId = () => {
    const key = 'sci_push_device_id';
    let value = localStorage.getItem(key);
    if (!value) {
        value = crypto.randomUUID().replace(/-/g, '_');
        localStorage.setItem(key, value);
    }
    return value;
};

const getDeviceMetadata = () => {
    const agent = navigator.userAgent || '';
    const browser = /SamsungBrowser/i.test(agent) ? 'Samsung Internet'
        : /Edg/i.test(agent) ? 'Edge' : /Firefox/i.test(agent) ? 'Firefox'
        : /Chrome|CriOS/i.test(agent) ? 'Chrome' : /Safari/i.test(agent) ? 'Safari' : 'Other';
    const platform = /Android/i.test(agent) ? 'Android' : /iPhone|iPad|iPod/i.test(agent) ? 'iOS'
        : /Windows/i.test(agent) ? 'Windows' : /Mac/i.test(agent) ? 'macOS' : 'Other';
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    return { browser, platform, displayMode: standalone ? 'standalone' : 'browser' };
};

const registerPushDevice = async (provider, credential) => {
    const { data, error } = await supabase.functions.invoke('push-devices', { body: {
        action: 'register', deviceId: getPushDeviceId(), provider, credential, ...getDeviceMetadata(),
    }});
    if (error || !data?.success) throw error || new Error(data?.error || 'Push device registration failed.');
    return data;
};

const subscribeStandardWebPush = async (registration) => {
    const publicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY;
    if (!publicKey || !registration?.pushManager) return null;
    let existing = await registration.pushManager.getSubscription();
    const expectedKey = base64UrlToBytes(publicKey);
    const existingKey = existing?.options?.applicationServerKey ? new Uint8Array(existing.options.applicationServerKey) : null;
    if (existing && (!existingKey || existingKey.length !== expectedKey.length || existingKey.some((byte, index) => byte !== expectedKey[index]))) {
        await existing.unsubscribe();
        existing = null;
    }
    const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey,
    });
    await registerPushDevice('WEB_PUSH', subscription.toJSON());
    return subscription;
};

// Ensure this only runs in the browser
if (typeof window !== 'undefined') {
  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
  } catch (error) {
    console.error("Firebase initialization error", error);
  }
}

export const requestFirebaseToken = async (userId) => {
    if (!messaging || typeof window === 'undefined' || !('Notification' in window)) return null;
    try {
        const currentPermission = window.Notification?.permission;
        if (currentPermission !== 'granted') {
            if (typeof window.Notification?.requestPermission !== 'function') return null;
            const permission = await window.Notification.requestPermission();
            if (permission !== 'granted') return null;
        }

        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
            console.error("VITE_FIREBASE_VAPID_KEY is missing in .env");
            return null;
        }

        let swRegistration;
        if ('serviceWorker' in navigator) {
            try {
                swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js?v=20260904-delivery-receipts');
            } catch (swErr) {
                swRegistration = await navigator.serviceWorker.ready.catch(() => undefined);
            }
        }

        const getTokenOptions = { vapidKey };
        if (swRegistration) {
            getTokenOptions.serviceWorkerRegistration = swRegistration;
        }

        if (/SamsungBrowser/i.test(navigator.userAgent || '')) {
            const subscription = await subscribeStandardWebPush(swRegistration);
            if (subscription) return `WEB_PUSH:${getPushDeviceId()}`;
        }

        const token = await getToken(messaging, getTokenOptions);
        
        if (token) {
            console.log("FCM Token retrieved.");
            try {
                await registerPushDevice('FCM', { token });
                return token;
            } catch (registryError) {
                console.warn('Device registry unavailable; using legacy push storage.', registryError);
            }
            const { data: profile, error: readError } = await supabase.from('users').select('fcm_token').eq('id', userId).maybeSingle();
            if (readError) throw readError;
            const tokens = [...new Set([...parseStoredPushTokens(profile?.fcm_token), token])].slice(-10);
            const storedValue = tokens.length === 1 ? tokens[0] : JSON.stringify(tokens);
            const { error } = await supabase.from('users').update({ fcm_token: storedValue }).eq('id', userId);
            if (error) {
                console.error("Failed to save FCM token to Supabase:", error);
            }
            return token;
        } else {
            console.warn("No registration token available. Request permission to generate one.");
            return null;
        }
    } catch (error) {
        console.error("An error occurred while retrieving token. ", error);
        return null;
    }
};

export const removeFirebaseToken = async (userId) => {
    if (!userId) return false;
    try {
        await supabase.functions.invoke('push-devices', { body: {
            action: 'unregister', deviceId: getPushDeviceId(),
        }}).catch(() => null);
        let currentToken = null;
        if (messaging && typeof window !== 'undefined' && window.Notification?.permission === 'granted' && 'serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js?v=20260904-delivery-receipts');
            currentToken = await getToken(messaging, {
                vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
                serviceWorkerRegistration: registration,
            }).catch(() => null);
        }
        if (!currentToken) return true;
        const { data, error: readError } = await supabase.from('users').select('fcm_token').eq('id', userId).maybeSingle();
        if (readError) throw readError;
        const remainingTokens = parseStoredPushTokens(data?.fcm_token).filter(token => token !== currentToken);
        const storedValue = remainingTokens.length === 0 ? null : remainingTokens.length === 1 ? remainingTokens[0] : JSON.stringify(remainingTokens);
        const { error } = await supabase.from('users').update({ fcm_token: storedValue }).eq('id', userId);
        if (error) {
            console.error("Failed to remove FCM token from Supabase:", error);
            return false;
        }
        return true;
    } catch (err) {
        console.error("Failed to remove FCM token:", err);
        return false;
    }
};

export const promptAndEnableNotification = async (userId) => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        alert('현재 브라우저에서는 웹 푸시 알림을 지원하지 않습니다.');
        return { success: false, reason: 'unsupported' };
    }

    try {
        let permission = window.Notification.permission;

        // 권한이 이미 허용 상태가 아니라면 매번 클릭할 때마다 권한 요청 팝업 시도
        if (permission !== 'granted') {
            if (typeof window.Notification.requestPermission === 'function') {
                permission = await window.Notification.requestPermission();
            }
        }

        if (permission === 'granted') {
            const token = await requestFirebaseToken(userId);
            if (token) {
                return { success: true, token };
            } else {
                alert('알림 토큰 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.');
                return { success: false, reason: 'token_failed' };
            }
        } else if (permission === 'denied') {
            alert("⚠️ 브라우저에서 알림 권한이 차단되어 있습니다.\n\n주소창 좌측의 🔒(자물쇠) 아이콘 또는 스마트폰 브라우저 설정 > 사이트 설정에서 '알림'을 [허용]으로 변경한 후 다시 켜주세요.");
            return { success: false, reason: 'denied' };
        } else {
            alert('알림 권한 허용이 취소되었습니다.');
            return { success: false, reason: 'dismissed' };
        }
    } catch (e) {
        console.error("Error prompting notification permission:", e);
        alert('알림 권한 요청 중 오류가 발생했습니다: ' + e.message);
        return { success: false, reason: 'error', error: e.message };
    }
};

export const listenForForegroundMessages = (handler) => {
    if (!messaging || typeof handler !== 'function') return () => {};
    return onMessage(messaging, handler);
};

export const reportPushReceipt = async (receiptToken, event = 'DISPLAYED') => {
    if (!receiptToken) return false;
    try {
        const response = await fetch('https://erecqalsxoxrufggvmcc.supabase.co/functions/v1/push-receipts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiptToken, event }),
        });
        return response.ok;
    } catch (_) {
        return false;
    }
};

export { app, messaging };

// Recruitment opt-ins store this device token only in their owner-protected
// table. Do not reuse requestFirebaseToken's public users-table writes here.
export const requestRecruitmentPushToken = async () => {
    if (typeof window==='undefined' || !window.Notification || !messaging || !('serviceWorker' in navigator)) {
        throw new Error('이 브라우저에서는 푸시 알림을 사용할 수 없습니다. 알림을 지원하는 브라우저나 설치된 앱에서 시도해주세요.');
    }
    const permission = window.Notification.permission==='granted'
        ? 'granted' : await window.Notification.requestPermission();
    if (permission!=='granted') throw new Error('알림을 받으려면 브라우저 알림을 허용해주세요. 아직 관심 등록은 저장하지 않았습니다.');
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) throw new Error('푸시 알림 설정을 준비 중입니다. 잠시 후 다시 시도해주세요.');
    let timeout;
    try {
        return await Promise.race([
            (async () => {
                const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js?v=20260904-delivery-receipts');
                const token = await getToken(messaging,{vapidKey,serviceWorkerRegistration:registration});
                if (!token) throw new Error('이 기기의 알림 등록을 완료하지 못했습니다. 다시 시도해주세요.');
                return token;
            })(),
            new Promise((_,reject)=>{timeout=window.setTimeout(()=>reject(new Error('알림 설정 시간이 초과되었습니다. 다시 시도해주세요.')),20000);}),
        ]);
    } finally { window.clearTimeout(timeout); }
};
