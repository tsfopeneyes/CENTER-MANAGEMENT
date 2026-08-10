import { supabase } from '../supabaseClient';

/**
 * Direct client-side user data migration fallback.
 * Migrates logs, haifn_transactions, notice_responses, badges, feedback, etc.
 * then deletes the source temporary user.
 */
const mergeUserStatsDirect = async (tempUserId, primaryUserId) => {
    try {
        // 1. Fetch source & target users
        const { data: sourceUser } = await supabase.from('users').select('*').eq('id', tempUserId).maybeSingle();
        const { data: targetUser } = await supabase.from('users').select('*').eq('id', primaryUserId).maybeSingle();

        if (!sourceUser || !targetUser) {
            throw new Error('병합할 사용자를 찾을 수 없습니다.');
        }

        // 2. Transfer haifn points if source has positive balance
        const sourceHaifn = sourceUser.current_haifn || 0;
        if (sourceHaifn > 0) {
            const newHaifn = (targetUser.current_haifn || 0) + sourceHaifn;
            await supabase.from('users').update({ current_haifn: newHaifn }).eq('id', primaryUserId);
        }

        // 3. Migrate logs
        await supabase.from('logs').update({ user_id: primaryUserId }).eq('user_id', tempUserId);

        // 4. Migrate haifn_transactions (correct table name!)
        await supabase.from('haifn_transactions').update({ user_id: primaryUserId }).eq('user_id', tempUserId);

        // 5. Migrate notice_responses (handling unique notice_id, user_id conflicts)
        const { data: sourceResponses } = await supabase.from('notice_responses').select('*').eq('user_id', tempUserId);
        if (sourceResponses && sourceResponses.length > 0) {
            const { data: targetResponses } = await supabase.from('notice_responses').select('notice_id').eq('user_id', primaryUserId);
            const targetNoticeIds = new Set((targetResponses || []).map(r => r.notice_id));

            for (const resp of sourceResponses) {
                if (targetNoticeIds.has(resp.notice_id)) {
                    await supabase.from('notice_responses').delete().eq('notice_id', resp.notice_id).eq('user_id', tempUserId);
                } else {
                    await supabase.from('notice_responses').update({ user_id: primaryUserId }).eq('notice_id', resp.notice_id).eq('user_id', tempUserId);
                }
            }
        }

        // 6. Migrate user_badges (handling unique badge_id, user_id conflicts)
        const { data: sourceBadges } = await supabase.from('user_badges').select('*').eq('user_id', tempUserId);
        if (sourceBadges && sourceBadges.length > 0) {
            const { data: targetBadges } = await supabase.from('user_badges').select('badge_id').eq('user_id', primaryUserId);
            const targetBadgeIds = new Set((targetBadges || []).map(b => b.badge_id));

            for (const b of sourceBadges) {
                if (targetBadgeIds.has(b.badge_id)) {
                    await supabase.from('user_badges').delete().eq('badge_id', b.badge_id).eq('user_id', tempUserId);
                } else {
                    await supabase.from('user_badges').update({ user_id: primaryUserId }).eq('badge_id', b.badge_id).eq('user_id', tempUserId);
                }
            }
        }

        // 7. Migrate program_feedback & guestbook_posts
        await supabase.from('program_feedback').update({ user_id: primaryUserId }).eq('user_id', tempUserId);
        await supabase.from('guestbook_posts').update({ user_id: primaryUserId }).eq('user_id', tempUserId);

        // 8. Delete temporary/source user from users table
        const { error: deleteErr } = await supabase.from('users').delete().eq('id', tempUserId);
        if (deleteErr) {
            console.error('Error deleting temp user after migration:', deleteErr);
            throw deleteErr;
        }

        return { success: true };
    } catch (err) {
        console.error('Direct user merge failed:', err);
        return { success: false, error: err.message };
    }
};

/**
 * Merges data from a temporary/guest user into a primary user account.
 * @param {string} tempUserId - The ID of the temporary/guest user to be merged.
 * @param {string} primaryUserId - The ID of the existing primary user account.
 * @returns {Promise<{success: boolean, error?: any}>}
 */
export const mergeUserStats = async (tempUserId, primaryUserId) => {
    if (!tempUserId || !primaryUserId || tempUserId === primaryUserId) {
        return { success: false, error: 'Invalid user IDs provided for merge.' };
    }

    try {
        const { error } = await supabase.rpc('merge_duplicate_users', {
            p_source_id: tempUserId,
            p_target_id: primaryUserId
        });

        if (error) {
            console.warn('RPC merge_duplicate_users failed, using direct JS fallback migration:', error.message);
            return await mergeUserStatsDirect(tempUserId, primaryUserId);
        }

        return { success: true };
    } catch (err) {
        console.warn('RPC merge exception, trying direct JS migration:', err);
        return await mergeUserStatsDirect(tempUserId, primaryUserId);
    }
};
