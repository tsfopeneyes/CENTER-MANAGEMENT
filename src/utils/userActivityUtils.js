import { supabase } from '../supabaseClient';
import { requestSupabaseRest } from './supabaseRest';

export const trackUserWebActivity = async (user, { force = false } = {}) => {
    if (!user || !user.id) return user;
    try {
        const nowIso = new Date().toISOString();
        const lastTracked = user.preferences?.last_web_login_at;

        // A local session can contain a timestamp which was never committed to
        // the database. Critical actions such as a program application pass
        // force=true so their web access record is always persisted.
        if (force || !lastTracked || (new Date() - new Date(lastTracked)) > 3 * 60 * 1000) {
            const updatedPreferences = { ...(user.preferences || {}), last_web_login_at: nowIso };
            const { data, error } = await supabase
                .from('users')
                .update({ preferences: updatedPreferences })
                .eq('id', user.id)
                .select('id, preferences')
                .maybeSingle();

            if (error) throw error;
            if (!data?.id) throw new Error('웹 접속 시각 저장 결과를 확인하지 못했습니다.');

            const updatedUser = { ...user, preferences: data.preferences || updatedPreferences };
            
            try {
                const localUser = localStorage.getItem('user');
                if (localUser) {
                    const parsed = JSON.parse(localUser);
                    if (parsed.id === user.id) {
                        localStorage.setItem('user', JSON.stringify(updatedUser));
                    }
                }
                const localAdmin = localStorage.getItem('admin_user');
                if (localAdmin) {
                    const parsedAdmin = JSON.parse(localAdmin);
                    if (parsedAdmin.id === user.id) {
                        localStorage.setItem('admin_user', JSON.stringify(updatedUser));
                    }
                }
            } catch (storageErr) {}

            return updatedUser;
        }
    } catch (e) {
        // Samsung Internet/PWA restoration can abort the Supabase client even
        // when the page is otherwise usable. Retry the same single-row update
        // through the resilient REST helper before reporting a failure.
        try {
            const nowIso = new Date().toISOString();
            const updatedPreferences = { ...(user.preferences || {}), last_web_login_at: nowIso };
            const result = await requestSupabaseRest(
                `users?id=eq.${encodeURIComponent(user.id)}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Prefer: 'return=representation'
                    },
                    body: JSON.stringify({ preferences: updatedPreferences })
                },
                1,
                10000
            );

            if (!Array.isArray(result) || !result[0]?.id) {
                throw new Error('웹 접속 시각 REST 저장 결과를 확인하지 못했습니다.');
            }

            const updatedUser = { ...user, preferences: result[0].preferences || updatedPreferences };
            try {
                const localUser = localStorage.getItem('user');
                if (localUser && JSON.parse(localUser).id === user.id) localStorage.setItem('user', JSON.stringify(updatedUser));
                const localAdmin = localStorage.getItem('admin_user');
                if (localAdmin && JSON.parse(localAdmin).id === user.id) localStorage.setItem('admin_user', JSON.stringify(updatedUser));
            } catch (storageErr) {}
            return updatedUser;
        } catch (fallbackError) {
            console.error('Failed to track user web activity:', e, fallbackError);
        }
    }
    return user;
};
