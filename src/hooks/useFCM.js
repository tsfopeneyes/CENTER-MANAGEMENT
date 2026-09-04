import { useEffect } from 'react';
import { listenForForegroundMessages, reportPushReceipt, requestFirebaseToken } from '../firebase';

export const useFCM = (user) => {
    useEffect(() => {
        if (!user || typeof window === 'undefined' || !('Notification' in window)) return;

        const setupFCM = async () => {
            if (window.Notification.permission !== 'granted') return;
            try {
                await requestFirebaseToken(user.id);
            } catch (e) {
                console.error("FCM setup error:", e);
            }
        };

        setupFCM();
        const stopForegroundMessages = listenForForegroundMessages(async (payload) => {
            if (window.Notification.permission !== 'granted') return;
            const title = payload?.notification?.title || payload?.data?.title || '새 알림';
            const body = payload?.notification?.body || payload?.data?.body || '새로운 알림이 도착했습니다.';
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification(title, {
                    body,
                    icon: '/icon-512.png',
                    badge: '/icon-512.png',
                    data: payload?.data,
                });
                await reportPushReceipt(payload?.data?.receiptToken, 'DISPLAYED');
            } catch (error) {
                console.error('Failed to display foreground push notification:', error);
            }
        });
        const reconnect = () => {
            if (document.visibilityState === 'visible') setupFCM();
        };
        window.addEventListener('focus', reconnect);
        document.addEventListener('visibilitychange', reconnect);
        return () => {
            stopForegroundMessages();
            window.removeEventListener('focus', reconnect);
            document.removeEventListener('visibilitychange', reconnect);
        };
    }, [user?.id]);
};
