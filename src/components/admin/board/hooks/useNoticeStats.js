import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../../supabaseClient';
import { RESPONSE_STATUS } from '../../../../constants/appConstants';
import { useProgramInterestCounts } from './useProgramInterestCounts';

const useNoticeStats = (filteredNotices, mode) => {
    const [noticeStats, setNoticeStats] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const interest = useProgramInterestCounts(filteredNotices);

    useEffect(() => {
        const fetchStats = async () => {
            if (!filteredNotices || filteredNotices.length === 0) {
                setNoticeStats({});
                return;
            }

            setIsLoading(true);
            try {
                const recruitingIds = filteredNotices.filter(n => n.is_recruiting).map(n => n.id);
                const pollIds = filteredNotices.filter(n => n.is_poll).map(n => n.id);
                const feedbackNoticeIds = filteredNotices
                    .filter(n => n.category === 'PROGRAM')
                    .map(n => n.id);
                
                const nStats = {};
                
                // 1. Fetch Recruitment Stats
                if (recruitingIds.length > 0) {
                    const { data: responses, error: recError } = await supabase
                        .from('notice_responses')
                        .select('notice_id, status, is_attended')
                        .in('notice_id', recruitingIds);
                        
                    if (recError) throw recError;

                    recruitingIds.forEach(id => {
                        nStats[id] = {
                            ...nStats[id],
                            [RESPONSE_STATUS.JOIN]: 0,
                            [RESPONSE_STATUS.DECLINE]: 0,
                            [RESPONSE_STATUS.UNDECIDED]: 0,
                            [RESPONSE_STATUS.WAITLIST]: 0,
                            attendedCount: 0,
                            is_recruiting: true
                        };
                    });
                    
                    responses?.forEach(r => {
                        if (nStats[r.notice_id]) {
                            nStats[r.notice_id][r.status] = (nStats[r.notice_id][r.status] || 0) + 1;
                            if (r.is_attended) nStats[r.notice_id].attendedCount += 1;
                        }
                    });
                }

                // 2. Fetch Poll Stats
                if (pollIds.length > 0) {
                    const { data: pollResponses, error: pollError } = await supabase
                        .from('notice_poll_responses')
                        .select('notice_id, user_id')
                        .in('notice_id', pollIds);
                        
                    if (pollError) throw pollError;

                    pollIds.forEach(id => {
                        if (!nStats[id]) {
                            nStats[id] = { is_poll: true, voters: new Set() };
                        } else {
                            nStats[id].is_poll = true;
                            nStats[id].voters = new Set();
                        }
                    });
                    
                    pollResponses?.forEach(r => {
                        if (nStats[r.notice_id]) {
                            nStats[r.notice_id].voters.add(r.user_id);
                        }
                    });
                    
                    // Convert Set size to count
                    pollIds.forEach(id => {
                        nStats[id].pollTotal = nStats[id].voters?.size || 0;
                    });
                }

                // 3. Fetch feedback totals so completed program cards can expose
                // the feedback list only when at least one response exists.
                if (feedbackNoticeIds.length > 0) {
                    const { data: feedbacks, error: feedbackError } = await supabase
                        .from('program_feedback')
                        .select('notice_id')
                        .in('notice_id', feedbackNoticeIds);

                    if (feedbackError) throw feedbackError;

                    feedbackNoticeIds.forEach(id => {
                        nStats[id] = {
                            ...nStats[id],
                            feedbackCount: 0
                        };
                    });

                    feedbacks?.forEach(feedback => {
                        if (nStats[feedback.notice_id]) {
                            nStats[feedback.notice_id].feedbackCount += 1;
                        }
                    });
                }
                
                setNoticeStats(nStats);
            } catch (err) {
                console.error("Failed to fetch notice stats:", err);
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchStats();
    }, [filteredNotices, mode]);

    const combinedStats = useMemo(() => {
        const combined = {...noticeStats};
        for (const notice of filteredNotices || []) {
            if (notice.category !== 'PROGRAM') continue;
            combined[notice.id] = {...combined[notice.id], interestCount:interest.counts[notice.id],
                interestLoading:interest.loading, interestError:interest.error};
        }
        return combined;
    },[noticeStats,filteredNotices,interest.counts,interest.loading,interest.error]);
    return { noticeStats:combinedStats, isLoading };
};

export default useNoticeStats;
