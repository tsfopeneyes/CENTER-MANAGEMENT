import { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { noticesApi } from '../../../api/noticesApi';

const useNoticeModal = ({ notice, user, context, responses, tutorialMode = false }) => {
    const [joinCount, setJoinCount] = useState(notice?.current_applicants || 0);
    const [waitlistCount, setWaitlistCount] = useState(0);
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState('');

    // Poll State
    const [userVotes, setUserVotes] = useState([]);
    const [pendingVotes, setPendingVotes] = useState([]);
    const [isSubmittingPoll, setIsSubmittingPoll] = useState(false);
    const [pollResults, setPollResults] = useState({});
    const [pollTotalVotes, setPollTotalVotes] = useState(0);
    const [pollTimeLeft, setPollTimeLeft] = useState('');
    const [isPollExpired, setIsPollExpired] = useState(false);

    const fetchPollData = async () => {
        if (!notice.is_poll || !notice.id) return;
        try {
            const votes = await noticesApi.getUserPollVote(notice.id, user.id);
            const votesArray = votes || [];
            setUserVotes(votesArray);
            setPendingVotes(votesArray);

            const fetchedResponses = await noticesApi.fetchPollResponses(notice.id);
            const counts = {};
            fetchedResponses?.forEach(r => {
                counts[r.option_id] = (counts[r.option_id] || 0) + 1;
            });
            setPollResults(counts);
            const uniqueUsers = new Set(fetchedResponses?.map(r => r.user_id));
            setPollTotalVotes(uniqueUsers.size || 0);
        } catch (err) {
            console.error('Failed to fetch poll data', err);
        }
    };

    // Recruitment Timer
    useEffect(() => {
        if (!notice.recruitment_deadline) return;
        const updateTimer = () => {
            const now = new Date();
            const deadline = new Date(notice.recruitment_deadline);
            if (deadline < now) {
                setTimeLeft('신청이 마감되었습니다.');
                return;
            }
            const diff = deadline - now;
            if (isNaN(diff)) { setTimeLeft(''); return; }
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            let timeStr = '신청 마감까지 ';
            if (days > 0) timeStr += `${days}일 `;
            timeStr += `${hours}시간 ${minutes}분 ${seconds}초 남았어요!`;
            setTimeLeft(timeStr);
        };
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [notice.recruitment_deadline]);

    // Poll Timer
    useEffect(() => {
        if (!notice.is_poll || !notice.poll_deadline) return;
        const updatePollTimer = () => {
            const now = new Date();
            const deadline = new Date(notice.poll_deadline);
            if (deadline < now) {
                setPollTimeLeft('마감됨');
                setIsPollExpired(true);
                return;
            }
            const diff = deadline - now;
            if (isNaN(diff)) { setPollTimeLeft(''); setIsPollExpired(false); return; }
            setIsPollExpired(false);
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            let timeStr = '';
            if (days > 0) timeStr += `${days}일 `;
            timeStr += `${hours}시간 ${minutes}분 ${seconds}초 후 종료`;
            setPollTimeLeft(timeStr);
        };
        updatePollTimer();
        const interval = setInterval(updatePollTimer, 1000);
        return () => clearInterval(interval);
    }, [notice.poll_deadline, notice.is_poll]);

    // Reactions State
    const [reactions, setReactions] = useState([]);

    const fetchReactions = async () => {
        if (!notice?.id) return;
        try {
            const data = await noticesApi.fetchNoticeReactions(notice.id);
            setReactions(data || []);
        } catch (err) {
            console.error('Failed to fetch reactions:', err);
        }
    };

    const handleToggleReaction = async (emoji) => {
        if (!notice?.id || !user?.id || !emoji) return;

        // Optimistic UI update
        const existingIdx = reactions.findIndex(r => r.user_id === user.id && r.emoji === emoji);
        if (existingIdx > -1) {
            setReactions(prev => prev.filter((_, idx) => idx !== existingIdx));
        } else {
            setReactions(prev => [...prev, { notice_id: notice.id, user_id: user.id, emoji }]);
        }

        try {
            await noticesApi.toggleNoticeReaction(notice.id, user.id, emoji);
            fetchReactions();
        } catch (err) {
            console.error('Failed to toggle reaction:', err);
            fetchReactions();
        }
    };

    useEffect(() => {
        // `context` only describes where the detail view was opened from
        // (notification, calendar, home, etc.). It must not decide whether
        // live data is loaded. Only tutorial records are intentionally local.
        if (tutorialMode) return;

        setJoinCount(notice?.current_applicants || 0);
        fetchLikeStatus();
        fetchParticipantCounts();
        fetchPollData();
        fetchReactions();
    }, [notice.id, user?.id, responses?.[notice.id], tutorialMode]);

    const handleOptionClick = (optionId, isEditing) => {
        if (isEditing || isPollExpired) return;
        if (!notice.allow_multiple_votes) {
            handleSubmitVote([optionId], isEditing);
        } else {
            setPendingVotes(prev =>
                prev.includes(optionId)
                    ? prev.filter(id => id !== optionId)
                    : [...prev, optionId]
            );
        }
    };

    const handleSubmitVote = async (votesToSubmit = pendingVotes, isEditing = false) => {
        if (isEditing || isPollExpired) return;
        if (votesToSubmit.length === 0) return alert('항목을 하나 이상 선택해주세요.');
        setIsSubmittingPoll(true);
        try {
            await noticesApi.upsertPollVote(notice.id, user.id, votesToSubmit);
            setUserVotes(votesToSubmit);
            setPendingVotes(votesToSubmit);
            fetchPollData();
        } catch (err) {
            console.error('Vote failed:', err);
            alert('투표 처리에 실패했습니다.');
        } finally {
            setIsSubmittingPoll(false);
        }
    };

    const fetchParticipantCounts = async () => {
        if (!notice.is_recruiting) return;
        try {
            const { data } = await supabase.from('notice_responses').select('status').eq('notice_id', notice.id);
            const counts = { JOIN: 0, WAITLIST: 0 };
            data?.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
            setJoinCount(counts.JOIN);
            setWaitlistCount(counts.WAITLIST);
        } catch (err) { console.error(err); }
    };

    const fetchLikeStatus = async () => {
        try {
            const { count } = await supabase.from('notice_likes').select('*', { count: 'exact', head: true }).eq('notice_id', notice.id);
            setLikeCount(count || 0);
            const { data } = await supabase.from('notice_likes').select('id').eq('notice_id', notice.id).eq('user_id', user.id);
            setLiked(data?.length > 0);
        } catch (err) { console.error('Like fetch error:', err); }
    };

    const toggleLike = async () => {
        try {
            if (liked) {
                await supabase.from('notice_likes').delete().eq('notice_id', notice.id).eq('user_id', user.id);
                setLiked(false);
                setLikeCount(prev => Math.max(0, prev - 1));
            } else {
                await supabase.from('notice_likes').insert([{ notice_id: notice.id, user_id: user.id }]);
                setLiked(true);
                setLikeCount(prev => prev + 1);
            }
        } catch (err) { console.error('Like toggle error:', err); }
    };

    return {
        // Core states
        joinCount, waitlistCount,
        liked, likeCount,
        timeLeft,
        // Reactions state
        reactions, handleToggleReaction,
        // Poll states
        userVotes, pendingVotes,
        isSubmittingPoll, pollResults,
        pollTotalVotes, pollTimeLeft, isPollExpired,
        // Handlers
        handleOptionClick, handleSubmitVote,
        toggleLike
    };
};

export default useNoticeModal;
