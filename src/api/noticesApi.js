import { supabase } from '../supabaseClient';

export const noticesApi = {
    async fetchAll() {
        const { data, error } = await supabase
            .from('notices')
            .select('*')
            .order('is_sticky', { ascending: false })
            .order('created_at', { ascending: false });
        if (error) throw error;

        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return data.sort((a, b) => {
            // 1. is_sticky always highest priority
            if (a.is_sticky && !b.is_sticky) return -1;
            if (!a.is_sticky && b.is_sticky) return 1;

            // 2. Program-specific sorting
            if (a.category === 'PROGRAM' && b.category === 'PROGRAM') {
                const dateA = new Date(a.program_date || a.created_at);
                const dateB = new Date(b.program_date || b.created_at);
                const isPastA = dateA < now;
                const isPastB = dateB < now;

                if (!isPastA && !isPastB) {
                    return dateA - dateB; // Both future: ascending (nearest first)
                } else if (isPastA && isPastB) {
                    return dateB - dateA; // Both past: descending (latest first)
                } else {
                    return isPastA ? 1 : -1; // Future before past
                }
            }

            // 3. Fallback to created_at descending
            return new Date(b.created_at) - new Date(a.created_at);
        });
    },

    async fetchResponses(userId) {
        const { data, error } = await supabase
            .from('notice_responses')
            .select('notice_id, status, is_attended, challenge_mission_statuses')
            .eq('user_id', userId);
        if (error) throw error;
        return data;
    },

    async upsertResponse(noticeId, userId, status) {
        const { error } = await supabase
            .from('notice_responses')
            .upsert(
                { notice_id: noticeId, user_id: userId, status: status },
                { onConflict: 'notice_id, user_id' }
            );
        if (error) throw error;
    },

    async deleteResponse(noticeId, userId) {
        const { error } = await supabase
            .from('notice_responses')
            .delete()
            .eq('notice_id', noticeId)
            .eq('user_id', userId);
        if (error) throw error;
    },

    async getJoinCount(noticeId) {
        const { count, error } = await supabase
            .from('notice_responses')
            .select('*', { count: 'exact', head: true })
            .eq('notice_id', noticeId)
            .eq('status', 'JOIN');
        if (error) throw error;
        return count;
    },

    async fetchAllJoinCounts() {
        const { data, error } = await supabase
            .from('notice_responses')
            .select('notice_id')
            .eq('status', 'JOIN');
        if (error) throw error;

        const countsMap = {};
        data?.forEach((r) => {
            countsMap[r.notice_id] = (countsMap[r.notice_id] || 0) + 1;
        });
        return countsMap;
    },

    async promoteFromWaitlist(noticeId) {
        // 1. Get the first person in waitlist (oldest first)
        const { data: nextInLine, error: fetchError } = await supabase
            .from('notice_responses')
            .select('user_id, notices(title)')
            .eq('notice_id', noticeId)
            .eq('status', 'WAITLIST')
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        if (fetchError || !nextInLine) return null;

        // 2. Promote to JOIN
        const { error: updateError } = await supabase
            .from('notice_responses')
            .update({ status: 'JOIN' })
            .eq('notice_id', noticeId)
            .eq('user_id', nextInLine.user_id);

        if (updateError) throw updateError;

        // 3. Send Notification Message
        try {
            const admin = JSON.parse(localStorage.getItem('admin_user'));
            const adminId = admin?.id || 'd3885f86-f127-448c-8517-578964d509f7'; // Fallback to a known UUID if possible, or just use system-like id

            const promoMessage = `🎉 [알림] 대기 중이던 프로그램 '${nextInLine.notices?.title || '신청하신 프로그램'}'의 자리가 생겨 참석으로 자동 전환되었습니다! 축하드려요!`;

            await supabase.from('messages').insert([{
                sender_id: adminId, // System/Admin message
                receiver_id: nextInLine.user_id,
                content: promoMessage,
                is_read: false
            }]);

            await supabase.from('app_notifications').insert([{
                sender_id: adminId,
                target_group: `USER_${nextInLine.user_id}`,
                content: promoMessage
            }]);
        } catch (msgErr) {
            console.error('Failed to send promotion notification:', msgErr);
        }

        return nextInLine.user_id;
    },

    async incrementViewCount(noticeId) {
        if (!noticeId) return null;
        try {
            const { data: rpcData, error: rpcError } = await supabase.rpc('increment_notice_views', { p_notice_id: noticeId });
            if (!rpcError) {
                return typeof rpcData === 'number' ? rpcData : null;
            }

            // Fallback direct update if RPC is missing
            const { data, error: selectError } = await supabase
                .from('notices')
                .select('view_count')
                .eq('id', noticeId)
                .maybeSingle();

            if (selectError) return null;

            const currentViews = data?.view_count || 0;
            const newViews = currentViews + 1;

            const { error: updateError } = await supabase
                .from('notices')
                .update({ view_count: newViews })
                .eq('id', noticeId);

            if (updateError) {
                console.warn('Direct view_count update fallback warning:', updateError.message);
            }

            return newViews;
        } catch (e) {
            console.error('Failed to increment notice view count:', e);
            return null;
        }
    },

    async sendNoticePushNotification(noticeObj) {
        try {
            const noticeId = noticeObj?.id;
            const titleText = (noticeObj?.title || '').trim() || (noticeObj?.category === 'PROGRAM' ? '프로그램 안내' : '공지사항');
            const notificationTitle = titleText;
            const notificationBody = '지금 바로 앱에서 확인해보세요!';
            const appNotificationContent = `[${titleText}] 지금 바로 앱에서 확인해보세요!`;
            const noticeUrl = noticeId ? `/?noticeId=${noticeId}` : '/';

            const { error: pushError } = await supabase.functions.invoke('send-push', {
                body: {
                    title: notificationTitle,
                    body: notificationBody,
                    targetRegions: noticeObj?.target_regions || [],
                    noticeId: noticeId,
                    url: noticeUrl,
                    data: {
                        noticeId: noticeId,
                        url: noticeUrl
                    }
                }
            });
            if (pushError) console.error("푸쉬 알림 전송 에러:", pushError);

            const adminInfo = JSON.parse(localStorage.getItem('admin_user')) || { id: 'd3885f86-f127-448c-8517-578964d509f7' };
            await supabase.from('app_notifications').insert([{
                sender_id: adminInfo.id,
                target_group: '전체',
                content: appNotificationContent
            }]);

        } catch (ex) {
            console.error("푸쉬 알림 API 호출 실패:", ex);
        }
    },

    async update(id, updates) {
        const payload = { ...updates };
        const shouldSendPush = payload.send_push;
        
        // Remove non-table / joined / computed keys that cause Supabase schema errors
        const nonTableKeys = [
            'id', 'created_at', 'send_push', 'joinCount', 'waitlistCount', 
            'responses', 'responseDetails', 'comments', 'author', 'is_joined', 
            'has_applied', 'attendedCount', 'attendanceRate', 'users', 
            'notice_responses', 'challenge_missions', 'challenge_mission_statuses',
            'program_feedback', 'poll_responses', 'my_vote', 'is_attended', 'is_staff', 'user_id'
        ];

        nonTableKeys.forEach(k => delete payload[k]);

        const { data, error } = await supabase
            .from('notices')
            .update(payload)
            .eq('id', id)
            .select();
        if (error) throw error;

        if (shouldSendPush) {
            let noticeObj = (data && data[0]) ? data[0] : updates;
            if (!noticeObj.title) {
                const { data: fetched } = await supabase
                    .from('notices')
                    .select('title, category, target_regions')
                    .eq('id', id)
                    .maybeSingle();
                if (fetched) {
                    noticeObj = { ...noticeObj, ...fetched };
                }
            }
            await this.sendNoticePushNotification(noticeObj);
        }
    },

    async delete(id) {
        const { error } = await supabase
            .from('notices')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    async create(notice) {
        const payload = { ...notice };
        const shouldSendPush = payload.send_push;
        delete payload.send_push; // Prevent schema error if column doesn't exist
        
        const { data, error } = await supabase
            .from('notices')
            .insert([payload])
            .select();
        if (error) throw error;
        
        const createdNotice = (data && data[0]) ? data[0] : notice;

        // 체크박스 '푸시 알림 발송'이 활성화된 경우에만 푸쉬 전송
        if (shouldSendPush) {
            await this.sendNoticePushNotification(createdNotice);
        }
        
        return createdNotice;
    },

    async updateProgramStatus(noticeId, status) {
        const { error } = await supabase
            .from('notices')
            .update({ program_status: status })
            .eq('id', noticeId);
        if (error) throw error;
    },

    async finalizeProgramLogs(noticeId, noticeData) {
        // 1. Get all JOIN responses or open program participants
        let responses = [];
        if (noticeData.is_recruiting === false) {
            // Open program: Get participants from haifn_transactions
            const descPattern = `[오픈 프로그램 참여] ${noticeData.title}%`;
            const { data: txData, error: txError } = await supabase
                .from('haifn_transactions')
                .select('user_id, source_description')
                .eq('transaction_type', 'EARN')
                .like('source_description', descPattern);
            if (txError) throw txError;
            
            responses = (txData || []).map(tx => {
                const dateMatch = tx.source_description.match(/\((\d{4}-\d{2}-\d{2})\)/);
                const dateStr = dateMatch ? dateMatch[1] : (noticeData.program_date || '');
                return {
                    user_id: tx.user_id,
                    is_attended: true,
                    is_staff: false,
                    program_date: dateStr
                };
            });
        } else {
            // Regular recruiting program
            const { data: respData, error: respError } = await supabase
                .from('notice_responses')
                .select('*')
                .eq('notice_id', noticeId)
                .eq('status', 'JOIN');
                
            if (respError) throw respError;
            responses = respData || [];
        }
            
        if (!responses || responses.length === 0) return;

        // 2. Delete existing PRG logs for this program to avoid duplicates
        await supabase.from('logs').delete().like('location_id', `${noticeId}|%`);

        // 3. Insert new logs based on attendance
        const logsToInsert = responses.map(r => {
            const dateStr = r.program_date || noticeData.program_date || '';
            let programTime = noticeData.program_time || '';
            if (!programTime && noticeData.program_date) {
                try {
                    const dateObj = new Date(noticeData.program_date);
                    if (!isNaN(dateObj.getTime())) {
                        const hh = String(dateObj.getHours()).padStart(2, '0');
                        const mm = String(dateObj.getMinutes()).padStart(2, '0');
                        programTime = `${hh}:${mm}`;
                    }
                } catch (e) {
                    console.error("Failed to parse program_time:", e);
                }
            }
            const locationStr = noticeData.program_location || noticeData.location || '';
            const loc = `${noticeId}|${noticeData.title || ''}|${dateStr}|${programTime}|${locationStr}`;
            return {
                user_id: r.user_id,
                type: r.is_attended ? 'PRG_ATTENDED' : 'PRG_ABSENT',
                location_id: loc
            };
        });

        const { error: insertError } = await supabase.from('logs').insert(logsToInsert);
        if (insertError) throw insertError;

        // 5. Auto-reward 5H for staff members who attended
        const staffAttendees = responses.filter(r => r.is_attended && r.is_staff);
        if (staffAttendees.length > 0) {
            const admin = JSON.parse(localStorage.getItem('admin_user')) || {};
            const adminId = admin.id || null;
            const rewardDesc = `[역할] 프로그램 스탭 참여: ${noticeData.title || ''}`;

            const transactionsToInsert = staffAttendees.map(s => ({
                user_id: s.user_id,
                amount: 5,
                transaction_type: 'EARN',
                source_description: rewardDesc,
                admin_id: adminId
            }));

            const { error: txError } = await supabase.from('haifn_transactions').insert(transactionsToInsert);
            if (txError) {
                console.error("Failed to insert staff reward transactions:", txError);
            }
        }
    },

    async revertProgramLogs(noticeId, noticeTitle) {
        // Delete all PRG logs for this program since it was reverted to ACTIVE
        const { error } = await supabase.from('logs').delete().like('location_id', `${noticeId}|%`);
        if (error) throw error;

        // Delete staff reward transactions
        if (noticeTitle) {
            const rewardDesc = `[역할] 프로그램 스탭 참여: ${noticeTitle}`;
            await supabase
                .from('haifn_transactions')
                .delete()
                .eq('source_description', rewardDesc);
        }
    },

    async updateAttendance(noticeId, userId, isAttended) {
        const { error } = await supabase
            .from('notice_responses')
            .update({ is_attended: isAttended })
            .eq('notice_id', noticeId)
            .eq('user_id', userId);
        if (error) throw error;
    },

    async updateStaffStatus(noticeId, userId, isStaff) {
        const { error } = await supabase
            .from('notice_responses')
            .update({ is_staff: isStaff })
            .eq('notice_id', noticeId)
            .eq('user_id', userId);
        if (error) throw error;
    },

    async markAllAttended(noticeId) {
        const { error } = await supabase
            .from('notice_responses')
            .update({ is_attended: true })
            .eq('notice_id', noticeId)
            .eq('status', 'JOIN');
        if (error) throw error;
    },

    async searchUsers(query) {
        const { data, error } = await supabase
            .from('users')
            .select('id, name, school, phone, phone_back4, is_leader, profile_image_url')
            .or(`name.ilike.%${query}%,phone.ilike.%${query}%,phone_back4.ilike.%${query}%`)
            .limit(10);
        if (error) throw error;
        return data;
    },

    // Polling API
    async upsertPollVote(noticeId, userId, optionIds) {
        if (!Array.isArray(optionIds)) {
            optionIds = [optionIds];
        }

        // Delete existing votes for this user on this notice
        const { error: deleteError } = await supabase
            .from('notice_poll_responses')
            .delete()
            .eq('notice_id', noticeId)
            .eq('user_id', userId);
        
        if (deleteError) throw deleteError;

        if (optionIds.length === 0) return;

        // Insert new votes
        const inserts = optionIds.map(optId => ({
            notice_id: noticeId,
            user_id: userId,
            option_id: optId
        }));

        const { error: insertError } = await supabase
            .from('notice_poll_responses')
            .insert(inserts);

        if (insertError) throw insertError;
    },

    async fetchPollResponses(noticeId) {
        const { data, error } = await supabase
            .from('notice_poll_responses')
            .select('user_id, option_id, users(id, name, school, is_leader)')
            .eq('notice_id', noticeId);
        if (error) throw error;
        return data;
    },

    async getUserPollVote(noticeId, userId) {
        const { data, error } = await supabase
            .from('notice_poll_responses')
            .select('option_id')
            .eq('notice_id', noticeId)
            .eq('user_id', userId);
        if (error) throw error;
        return data.map(row => row.option_id);
    },

    async fetchNoticeReactions(noticeId) {
        if (!noticeId) return [];
        const { data, error } = await supabase
            .from('notice_reactions')
            .select('user_id, emoji, users(id, name, school, profile_image_url)')
            .eq('notice_id', noticeId);
        if (error) {
            console.warn('notice_reactions fetch error:', error.message);
            return [];
        }
        return data || [];
    },

    async toggleNoticeReaction(noticeId, userId, emoji) {
        if (!noticeId || !userId || !emoji) return;

        const { data, error } = await supabase
            .from('notice_reactions')
            .select('id')
            .eq('notice_id', noticeId)
            .eq('user_id', userId)
            .eq('emoji', emoji);

        if (error) {
            console.error('Failed to check notice reaction:', error);
            throw error;
        }

        if (data && data.length > 0) {
            const { error: delErr } = await supabase
                .from('notice_reactions')
                .delete()
                .eq('notice_id', noticeId)
                .eq('user_id', userId)
                .eq('emoji', emoji);
            if (delErr) throw delErr;
            return { action: 'removed' };
        } else {
            const { error: insErr } = await supabase
                .from('notice_reactions')
                .insert([{ notice_id: noticeId, user_id: userId, emoji }]);
            if (insErr) throw insErr;
            return { action: 'added' };
        }
    }
};
