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
                swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            } catch (swErr) {
                swRegistration = await navigator.serviceWorker.ready.catch(() => undefined);
            }
        }

        const getTokenOptions = { vapidKey };
        if (swRegistration) {
            getTokenOptions.serviceWorkerRegistration = swRegistration;
        }

        const token = await getToken(messaging, getTokenOptions);
        
        if (token) {
            console.log("FCM Token retrieved.");
            // 다른 계정에 동일한 토큰이 등록되어 있다면 먼저 제거하여 중복 발송 방지
            await supabase.from('users').update({ fcm_token: null }).eq('fcm_token', token).neq('id', userId);
            
            const { error } = await supabase.from('users').update({ fcm_token: token }).eq('id', userId);
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
        const { error } = await supabase.from('users').update({ fcm_token: null }).eq('id', userId);
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

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (messaging) {
        onMessage(messaging, (payload) => {
            resolve(payload);
        });
    }
  });

export { app, messaging };
