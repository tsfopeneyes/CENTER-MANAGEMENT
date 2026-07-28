import { useState, useCallback } from 'react';
import { promptAndEnableNotification, removeFirebaseToken } from '../firebase';

export const useNotificationManager = (user) => {
    const [isPushEnabled, setIsPushEnabled] = useState(Boolean(user?.fcm_token));
    const [pushLoading, setPushLoading] = useState(false);

    const toggleNotification = useCallback(async () => {
        if (!user?.id) return { success: false, reason: 'no_user' };
        setPushLoading(true);
        try {
            if (isPushEnabled) {
                const ok = await removeFirebaseToken(user.id);
                if (ok) {
                    setIsPushEnabled(false);
                    return { success: true, enabled: false };
                }
            } else {
                const res = await promptAndEnableNotification(user.id);
                if (res.success) {
                    setIsPushEnabled(true);
                    return { success: true, enabled: true };
                }
                return res;
            }
        } finally {
            setPushLoading(false);
        }
    }, [user?.id, user?.fcm_token, isPushEnabled]);

    return {
        isPushEnabled,
        pushLoading,
        toggleNotification
    };
};
