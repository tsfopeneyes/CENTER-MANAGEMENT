import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { noticesApi } from '../api/noticesApi';
import { RESPONSE_STATUS } from '../constants/appConstants';
import { trackUserWebActivity } from '../utils/userActivityUtils';

export const useNotices = (userId) => {
    const [notices, setNotices] = useState([]);
    const [responses, setResponses] = useState({});
    const [responseDetails, setResponseDetails] = useState({});
    const [loading, setLoading] = useState(false);

    const fetchNotices = useCallback(async () => {
        setLoading(true);
        try {
            const data = await noticesApi.fetchAll();

            // Fetch applicant counts
            const countsMap = await noticesApi.fetchAllJoinCounts();
            const enrichedNotices = (data || []).map(n => ({
                ...n,
                current_applicants: countsMap[n.id] || 0
            }));

            setNotices(enrichedNotices);

            if (userId) {
                const resData = await noticesApi.fetchResponses(userId);
                const resMap = {};
                const resDetailsMap = {};
                resData?.forEach(r => {
                    resMap[r.notice_id] = r.status;
                    resDetailsMap[r.notice_id] = r;
                });
                setResponses(resMap);
                setResponseDetails(resDetailsMap);
            }
        } catch (err) {
            console.error('Error fetching notices:', err);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    const handleResponse = async (noticeId, status) => {
        try {
            const notice = notices.find(n => n.id === noticeId);
            if (!notice) return;

            // 1. Strict Deadline Check
            if (notice.recruitment_deadline) {
                const deadline = new Date(notice.recruitment_deadline);
                if (deadline < new Date()) {
                    alert('신청 및 취소 기간이 종료되었습니다.');
                    return;
                }
            }

            // 2. Capacity Check (Only for JOIN)
            let finalStatus = status;
            if (status === RESPONSE_STATUS.JOIN) {
                if (notice.max_capacity && notice.max_capacity > 0) {
                    const count = await noticesApi.getJoinCount(noticeId);

                    if (count >= notice.max_capacity) {
                        if (window.confirm(`정원(${notice.max_capacity}명)이 초과되었습니다. 대기 명단에 등록하시겠습니까?`)) {
                            finalStatus = RESPONSE_STATUS.WAITLIST;
                        } else {
                            return;
                        }
                    }
                }
            } else if (status === RESPONSE_STATUS.WAITLIST) {
                // If UI already said 'Waitlist', just proceed without confirm
                finalStatus = RESPONSE_STATUS.WAITLIST;
            }

            const oldStatus = responses[noticeId];

            // 3. Toggle/Cancel Logic
            if (status === 'CANCEL' || status === oldStatus || (status === RESPONSE_STATUS.JOIN && oldStatus === RESPONSE_STATUS.WAITLIST)) {
                if (window.confirm('신청을 취소하시겠습니까?')) {
                    await noticesApi.deleteResponse(noticeId, userId);
                    setResponses(prev => {
                        const next = { ...prev };
                        delete next[noticeId];
                        return next;
                    });

                    // If cancelled JOIN, try to promote someone
                    if (oldStatus === RESPONSE_STATUS.JOIN) {
                        try {
                            await noticesApi.promoteFromWaitlist(noticeId);
                        } catch (promoErr) {
                            console.error('Waitlist promotion failed:', promoErr);
                        }
                    }
                }
                return;
            }

            await noticesApi.upsertResponse(noticeId, userId, finalStatus);
            setResponses(prev => ({ ...prev, [noticeId]: finalStatus }));
            await trackUserWebActivity({ id: userId });

            // 4. Auto Promotion Logic (When changing FROM join to something else)
            if (oldStatus === RESPONSE_STATUS.JOIN && finalStatus !== RESPONSE_STATUS.JOIN) {
                try {
                    await noticesApi.promoteFromWaitlist(noticeId);
                } catch (promoErr) {
                    console.error('Waitlist promotion failed:', promoErr);
                }
            }

            if ((finalStatus === RESPONSE_STATUS.JOIN || finalStatus === RESPONSE_STATUS.WAITLIST) && finalStatus !== oldStatus) {
                const actionText = finalStatus === RESPONSE_STATUS.WAITLIST ? '대기' : '완료';
                try {
                    await supabase.from('app_notifications').insert([{
                        sender_id: userId,
                        target_group: `USER_${userId}`,
                        content: `🎉 [${notice.title}] 프로그램 신청이 ${actionText}되었습니다!`
                    }]);
                } catch (notifErr) {
                    console.error('Failed to send application notification:', notifErr);
                }
            }

            if (finalStatus === RESPONSE_STATUS.WAITLIST) {
                alert('대기 신청이 완료되었습니다.');
            } else if (finalStatus === RESPONSE_STATUS.JOIN && oldStatus !== RESPONSE_STATUS.WAITLIST) {
                alert('신청이 완료되었습니다.');
            }
        } catch (err) {
            console.error('Error handling notice response details:', err);
            alert(`응답 저장 실패: ${err.message || '알 수 없는 오류'}`);
        }
    };

    useEffect(() => {
        fetchNotices();

        // Supabase Realtime Listener for instant cross-device updates (Mobile <-> Desktop)
        const channel = supabase
            .channel('public_notices_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, () => {
                fetchNotices();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchNotices]);

    return {
        notices,
        responses,
        responseDetails,
        loading,
        fetchNotices,
        handleResponse
    };
};
