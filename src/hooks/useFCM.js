import { useEffect } from 'react';
import { requestFirebaseToken } from '../firebase';

export const useFCM = (user) => {
    useEffect(() => {
        if (!user || typeof window === 'undefined' || !('Notification' in window)) return;

        const setupFCM = async () => {
            try {
                await requestFirebaseToken(user.id);
            } catch (e) {
                console.error("FCM setup error:", e);
            }
        };

        setupFCM();
    }, [user?.id]);
};
