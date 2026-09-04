import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { resolveSchoolRegion } from '../../utils/schoolRegionUtils';
import { recruitmentNotificationGroup } from '../../utils/recruitmentNotificationAudience';

export const useDashboardNotifications = (user) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
    const [showNotificationsModal, setShowNotificationsModal] = useState(false);

    const getNotificationGroups = useCallback(async (currentUser) => {
        const groups = ['전체', currentUser.user_group, `USER_${currentUser.id}`];
        if (currentUser.school) groups.push(`SCHOOL_${currentUser.school}`);
        const { data: auth, error: authError } = await supabase.auth.getSession();
        if (!authError) {
            const ownGroup = recruitmentNotificationGroup(currentUser, auth?.session?.user);
            if (ownGroup) groups.push(ownGroup);
        }
        if (currentUser.role === 'admin' || currentUser.user_group === 'STAFF') groups.push('STAFF');

        // Notifications can target a center region without exposing the full
        // recipient list. Resolve the student's school to its configured
        // region, with the legacy school-name fallback used elsewhere.
        if (currentUser.school) {
            try {
                const region = await resolveSchoolRegion(currentUser.school);
                if (region) {
                    // 새 알림(REGION_*)과 기존에 저장된 지역/센터 이름 표기를
                    // 모두 지원하되, 해당 학교 지역에만 포함한다.
                    groups.push(`REGION_${region}`, region);
                    groups.push(region === '강동' ? '하이픈' : '이높플레이스');
                }
            } catch (error) {
                console.error('Failed to resolve notification region:', error);
            }
        }
        return [...new Set(groups.filter(Boolean))];
    }, []);

    const fetchNotifications = useCallback(async (currentUser) => {
        if (!currentUser) return;
        try {
            const groups = await getNotificationGroups(currentUser);

            const { data: notifs, error: notifErr } = await supabase
                .from('app_notifications')
                .select('*')
                .in('target_group', groups)
                .eq('is_duplicate', false)
                .eq('is_hidden', false)
                .order('created_at', { ascending: false });

            if (notifErr) throw notifErr;

            // Older notices were sometimes saved as a broadcast before
            // target_group supported regions. When their source notice is
            // known, enforce that notice's region here as well.
            const noticeIds = [...new Set((notifs || [])
                .filter((notif) => notif.notification_type === 'NOTICE')
                .map((notif) => notif.notice_id)
                .filter(Boolean))];
            let visibleNotifs = notifs || [];
            if (noticeIds.length > 0 && currentUser.role !== 'admin' && currentUser.user_group !== 'STAFF') {
                const [{ data: sourceNotices, error: sourceNoticeError }, previews] = await Promise.all([
                    supabase.from('notices').select('id, target_regions').in('id', noticeIds),
                    supabase.from('program_calendar_previews').select('id, target_regions').in('id', noticeIds)
                ]);

                if (!sourceNoticeError) {
                    const regionsByNoticeId = new Map([...(previews.data || []), ...(sourceNotices || [])].map((notice) => [notice.id, notice.target_regions]));
                    visibleNotifs = (notifs || []).filter((notif) => {
                        if (notif.notification_type !== 'NOTICE') return true;
                        const targetRegions = regionsByNoticeId.get(notif.notice_id);
                        if (!Array.isArray(targetRegions) || targetRegions.length === 0 || targetRegions.length >= 2) return true;
                        return targetRegions.some((region) => groups.includes(`REGION_${region}`));
                    });
                }
            }

            const { data: reads, error: readErr } = await supabase
                .from('user_notification_reads')
                .select('notification_id')
                .eq('user_id', currentUser.id);

            if (readErr) throw readErr;

            const readNotifIds = new Set(reads.map(r => r.notification_id));
            const unreadCount = visibleNotifs.filter(n => !readNotifIds.has(n.id)).length;

            setNotifications(visibleNotifs);
            setUnreadNotificationCount(unreadCount);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        }
    }, [getNotificationGroups]);

    const markNotificationsAsRead = useCallback(async () => {
        if (!user || unreadNotificationCount === 0) return;
        try {
            const { data: reads } = await supabase
                .from('user_notification_reads')
                .select('notification_id')
                .eq('user_id', user.id);
            const readNotifIds = new Set((reads || []).map(r => r.notification_id));

            const unreadNotifs = notifications.filter(n => !readNotifIds.has(n.id));
            if (unreadNotifs.length === 0) return;

            const inserts = unreadNotifs.map(n => ({
                user_id: user.id,
                notification_id: n.id
            }));

            await supabase.from('user_notification_reads').insert(inserts);
            setUnreadNotificationCount(0);
        } catch (err) {
            console.error('Error marking notifications read:', err);
        }
    }, [user, unreadNotificationCount, notifications]);

    // Realtime subscription for incoming mention notifications
    useEffect(() => {
        if (!user?.id) return;

        fetchNotifications(user);

        const channelName = `app_notifs:${user.id}`;
        const subscription = supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'app_notifications'
            }, async (payload) => {
                const targetGroup = payload.new?.target_group;
                const groups = await getNotificationGroups(user);
                if (groups.includes(targetGroup)) {
                    fetchNotifications(user);

                    // Trigger Web Browser Push Notification if target is current user
                    if ((targetGroup === `USER_${user.id}` || targetGroup?.startsWith('REGION_')) && typeof window !== 'undefined' && 'Notification' in window) {
                        if (Notification.permission === 'granted') {
                            try {
                                new Notification('새 알림', {
                                    body: payload.new?.content || '새로운 알림이 도착했습니다.',
                                    icon: '/favicon.ico'
                                });
                            } catch (e) {
                                console.error('Failed to display browser notification:', e);
                            }
                        }
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [user?.id, fetchNotifications, getNotificationGroups]);

    // Database repairs and audience changes may update existing rows rather
    // than insert new ones. Always refresh when the bell list is opened so a
    // long-running preview cannot keep showing stale recipients or duplicates.
    useEffect(() => {
        if (showNotificationsModal && user?.id) {
            fetchNotifications(user);
        }
    }, [showNotificationsModal, user?.id, fetchNotifications]);

    // Realtime is not guaranteed after a backgrounded mobile browser resumes.
    useEffect(() => {
        if (!user?.id) return;
        const refresh = () => {
            if (document.visibilityState === 'visible') fetchNotifications(user);
        };
        window.addEventListener('focus', refresh);
        window.addEventListener('recruitment-interest-changed', refresh);
        document.addEventListener('visibilitychange', refresh);
        const timer = window.setInterval(refresh, 60000);
        return () => {
            window.removeEventListener('focus', refresh);
            window.removeEventListener('recruitment-interest-changed', refresh);
            document.removeEventListener('visibilitychange', refresh);
            window.clearInterval(timer);
        };
    }, [user, fetchNotifications]);

    return {
        notifications,
        unreadNotificationCount,
        showNotificationsModal,
        setShowNotificationsModal,
        fetchNotifications,
        markNotificationsAsRead
    };
};
