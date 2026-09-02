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
            const notice = await noticesApi.loadForStudentRegistration(noticeId);

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
                    await noticesApi.loadForStudentRegistration(noticeId);
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

            await noticesApi.upsertStudentResponse(noticeId, userId, finalStatus);
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

        const refreshVisible = () => { if (document.visibilityState === 'visible') fetchNotices(); };
        // Hidden rows do not emit readable Realtime changes to students.
        const interval = window.setInterval(refreshVisible, 60000);
        window.addEventListener('focus', refreshVisible);
        document.addEventListener('visibilitychange', refreshVisible);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener('focus', refreshVisible);
            document.removeEventListener('visibilitychange', refreshVisible);
            supabase.removeChannel(channel);
        };
    }, [fetchNotices]);

    useEffect(() => {
        const now = Date.now();
        const starts = notices.filter(item => item.is_program_preview && item.recruitment_details_ready)
            .map(item => new Date(item.recruitment_start_at).getTime()).filter(Number.isFinite);
        if (!starts.length) return;
        const delay = Math.min(2147483647, Math.max(1500, Math.min(...starts) - now + 150));
        const timer = window.setTimeout(fetchNotices, delay);
        return () => window.clearTimeout(timer);
    }, [notices, fetchNotices]);

    return {
        notices,
        responses,
        responseDetails,
        loading,
        fetchNotices,
        handleResponse
    };
};
