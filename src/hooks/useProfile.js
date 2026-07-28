import { useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { userApi } from '../api/userApi';
import { compressImage } from '../utils/imageUtils';
import { isConsecutiveWorkingDay } from '../utils/analyticsUtils';
import { trackUserWebActivity } from '../utils/userActivityUtils';

export const useProfile = (initialUser) => {
    const [user, setUser] = useState(initialUser);
    const [totalHours, setTotalHours] = useState(0);
    const [visitCount, setVisitCount] = useState(0);
    const [programCount, setProgramCount] = useState(0);
    const [loading, setLoading] = useState(false);

    const fetchStats = useCallback(async (userId) => {
        if (!userId) return;
        try {
            if (user) {
                trackUserWebActivity(user);
            }
            const logs = await userApi.fetchLogs(userId);

            // Helper to get local YYYY-MM-DD
            const getLocalDateKey = (dateStr) => {
                if (!dateStr) return '';
                try {
                    const d = new Date(dateStr);
                    if (isNaN(d.getTime())) return '';
                    const offset = d.getTimezoneOffset() * 60000;
                    const local = new Date(d.getTime() - offset);
                    return local.toISOString().split('T')[0];
                } catch (e) {
                    return '';
                }
            };

            // 1. Visit Count (Unique Days)
            const uniqueDaysSet = new Set(
                logs
                    ?.filter(l => l.type === 'CHECKIN' || l.type === 'MOVE')
                    .map(l => getLocalDateKey(l.created_at)) || []
            );
            const sortedDates = Array.from(uniqueDaysSet).sort();
            setVisitCount(uniqueDaysSet.size);

            // 2. Total Hours
            let totalMs = 0;
            let lastCheckInTime = null;
            logs?.forEach(log => {
                const time = new Date(log.created_at).getTime();
                if (log.type === 'CHECKIN') lastCheckInTime = time;
                else if ((log.type === 'CHECKOUT' || log.type === 'MOVE') && lastCheckInTime) {
                    totalMs += (time - lastCheckInTime);
                    lastCheckInTime = log.type === 'MOVE' ? time : null;
                }
            });
            setTotalHours((totalMs / (1000 * 60 * 60)).toFixed(1));

            // 3. Program Count & History
            const { data: responses } = await supabase
                .from('notice_responses')
                .select('notices(title)')
                .eq('user_id', userId)
                .eq('is_attended', true);

            setProgramCount(responses?.length || 0);

            // 4. Special Stats (Birthday, Locations, Streak)
            let isBirthdayVisited = false;
            let visitedLocations = new Set();
            let maxConsecutiveDays = 0;

            // Fetch total locations for dynamic threshold
            const { count: totalLocationsCount } = await supabase
                .from('locations')
                .select('*', { count: 'exact', head: true });

            if (uniqueDaysSet.size > 0) {
                // Birthday check
                if (user?.birth) {
                    const birthMMDD = user.birth.substring(2, 6); // YYMMDD -> MMDD
                    isBirthdayVisited = sortedDates.some(d => {
                        const [year, month, day] = d.split('-');
                        return (month + day) === birthMMDD;
                    });
                }

                // Unique Locations (include MOVE and CHECKIN)
                logs?.filter(l => l.type === 'CHECKIN' || l.type === 'MOVE').forEach(l => {
                    if (l.location_id) visitedLocations.add(l.location_id);
                });

                // Streak (Consecutive Days - Skipping Tue, Sat, Sun)
                if (sortedDates.length > 0) {
                    let currentStreak = 1;
                    for (let i = 1; i < sortedDates.length; i++) {
                        const prev = sortedDates[i - 1]; // sortedDates are YYYY-MM-DD
                        const curr = sortedDates[i];

                        if (isConsecutiveWorkingDay(prev, curr)) {
                            currentStreak++;
                        } else {
                            maxConsecutiveDays = Math.max(maxConsecutiveDays, currentStreak);
                            currentStreak = 1;
                        }
                    }
                    maxConsecutiveDays = Math.max(maxConsecutiveDays, currentStreak);
                }
            }

            // Fetch earned manual badges
            let { data: earnedChallenges, error: badgeError } = await supabase
                .from('user_badges')
                .select('badge_id, challenge_id')
                .eq('user_id', userId);

            if (badgeError) {
                const { data: fallbackChallenges } = await supabase
                    .from('user_challenges')
                    .select('challenge_id')
                    .eq('user_id', userId);
                earnedChallenges = fallbackChallenges;
            }
            const earnedChallengeIds = earnedChallenges?.map(ec => ec.badge_id || ec.challenge_id) || [];

            return {
                attendedPrograms: responses?.map(r => r.notices?.title).filter(Boolean) || [],
                specialStats: {
                    isBirthdayVisited,
                    uniqueLocationsCount: visitedLocations.size,
                    totalLocationsCount: totalLocationsCount || 0,
                    maxConsecutiveDays,
                    earnedChallengeIds
                }
            };

        } catch (err) {
            console.error('Error fetching stats:', err);
        }
    }, []);

    const updateProfile = async (updates, profileImage) => {
        if (!user) {
            return { success: false, error: '유저 정보를 찾을 수 없습니다.' };
        }
        setLoading(true);
        try {
            let imageUrl = user?.profile_image_url || null;

            if (profileImage) {
                // Apply automatic compression before upload
                const compressedFile = await compressImage(profileImage);
                const fileExt = compressedFile.name ? compressedFile.name.split('.').pop() : 'jpg';
                const fileName = `profile_${user.id}_${Date.now()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, compressedFile, { upsert: true });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(fileName);

                imageUrl = publicUrl;
            }

            const finalUpdates = { ...updates, profile_image_url: imageUrl };
            await userApi.updateProfile(user.id, finalUpdates);

            const updatedUser = { ...user, ...finalUpdates };
            setUser(updatedUser);
            localStorage.setItem('user', JSON.stringify(updatedUser));

            // Also sync 'admin_user' in localStorage if same user ID
            try {
                const localAdmin = localStorage.getItem('admin_user');
                if (localAdmin) {
                    const parsedAdmin = JSON.parse(localAdmin);
                    if (parsedAdmin && parsedAdmin.id === user.id) {
                        localStorage.setItem('admin_user', JSON.stringify({ ...parsedAdmin, ...finalUpdates }));
                    }
                }
            } catch (e) {
                console.error('Failed to sync admin_user in localStorage:', e);
            }

            return { success: true, user: updatedUser };
        } catch (err) {
            console.error('Error updating profile:', err);
            return { success: false, error: err.message || '프로필 업데이트 중 오류가 발생했습니다.' };
        } finally {
            setLoading(false);
        }
    };

    const withdrawMembership = async (targetUser) => {
        const u = targetUser || user;
        if (!u || !u.id) {
            return { success: false, error: '유저 정보를 찾을 수 없습니다.' };
        }
        setLoading(true);
        try {
            // Clean up personal non-historical data
            await supabase.from('calling_forest_progress').delete().eq('student_id', u.id);
            const { error: delBadgeErr } = await supabase.from('user_badges').delete().eq('user_id', u.id);
            if (delBadgeErr) {
                await supabase.from('user_challenges').delete().eq('user_id', u.id);
            }

            // Anonymize user row while retaining name as '이름 (탈퇴 회원)'
            const rawName = (u.name || '').replace(/\(탈퇴 회원\)$/, '').trim();
            const anonymizedName = `${rawName} (탈퇴 회원)`;

            const anonymizedData = {
                name: anonymizedName,
                phone: null,
                phone_back4: null,
                password: null,
                guardian_name: null,
                guardian_phone: null,
                guardian_relation: null,
                profile_image_url: null,
                fcm_token: null,
                status: 'withdrawn',
                bio: null,
                preferences: {
                    ...(u.preferences || {}),
                    withdrawn_at: new Date().toISOString()
                }
            };

            const { error: updateErr } = await supabase
                .from('users')
                .update(anonymizedData)
                .eq('id', u.id);

            if (updateErr) throw updateErr;

            // Clear authentication session & local storage
            await supabase.auth.signOut();
            localStorage.removeItem('user');
            localStorage.removeItem('admin_user');

            setUser(null);
            return { success: true };
        } catch (err) {
            console.error('Error in withdrawMembership:', err);
            return { success: false, error: err.message || '회원 탈퇴 처리 중 오류가 발생했습니다.' };
        } finally {
            setLoading(false);
        }
    };

    return {
        user,
        setUser,
        totalHours,
        visitCount,
        programCount,
        loading,
        fetchStats,
        updateProfile,
        withdrawMembership
    };
};
