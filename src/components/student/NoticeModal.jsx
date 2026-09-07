import React, { useState, useEffect, useRef } from 'react';
import { ZoomIn, X, Calendar as CalendarIcon, User, Trash2, MapPin, Users, Upload, Clock, CheckCircle, Check, Sparkles, XCircle, ExternalLink, Dices, RefreshCw, MessageSquare, Eye, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../../supabaseClient';
import { isAccountAuthEnabled } from '../../auth/accountAuthRuntime';
import { uploadAccountImage } from '../../auth/accountMedia';
import { noticesApi } from '../../api/noticesApi';
import ModernEditor from '../common/ModernEditor';
import UserAvatar from '../common/UserAvatar';
import LinkPreview from '../common/LinkPreview';
import { formatToLocalISO, formatProgramSchedule } from '../../utils/dateUtils';
import { extractUrls, extractProgramInfo } from '../../utils/textUtils';
import useNoticeModal from './hooks/useNoticeModal';
import { compressImage } from '../../utils/imageUtils';
import confetti from 'canvas-confetti';

// Components
import NoticeCarousel from './components/NoticeCarousel';
import NoticeHeader from './components/NoticeHeader';
import NoticeReactions from './NoticeReactions';
import WriteForm from '../admin/board/components/forms/WriteForm';

const seededShuffle = (array, seed) => {
    if (!seed) return array;
    
    let seedNum = 0;
    for (let i = 0; i < seed.length; i++) {
        seedNum = (seedNum << 5) - seedNum + seed.charCodeAt(i);
        seedNum |= 0;
    }
    
    const random = () => {
        const x = Math.sin(seedNum++) * 10000;
        return x - Math.floor(x);
    };
    
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

import ProgramFeedbackModal from './modals/ProgramFeedbackModal';
import AdminFeedbackListModal from '../admin/board/components/modals/AdminFeedbackListModal';
import { getRecruitment } from '../../utils/programRecruitment';
import { useCurrentTime } from '../../hooks/useCurrentTime';
import ProgramAvailabilityNotice from './components/ProgramAvailabilityNotice';
import ChallengeCommunityModal from './modals/ChallengeCommunityModal';

const NoticeModalContent = ({
    notice, context, onClose, user, fromAdmin = false, isImpersonating = false, responses, responseDetails = {}, onResponse, onRefresh, comments, newComment, setNewComment, onPostComment, onDeleteComment, onUpdate, onDelete, onViewParticipants, onRegisterRegularUser, tutorialMode = false, tutorialStep = '', tutorialOpenCardsTotal = 0, tutorialOpenCardIndex = 0, tutorialChallengeCardsTotal = 0, tutorialChallengeCardIndex = 0, onTutorialAction, onTutorialReaction, onTutorialComment
}) => {
    const recruitmentNow = useCurrentTime();
    const recruitment = getRecruitment(notice, recruitmentNow);
    const [isEditing, setIsEditing] = useState(false);
    const [editedNotice, setEditedNotice] = useState({ ...notice });
    const [zoomedImage, setZoomedImage] = useState(null);
    const [hostUsers, setHostUsers] = useState([]);
    const introRef = React.useRef(null);
    const hostRef = React.useRef(null);
    const [activeTab, setActiveTab] = useState('intro');
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [tutorialReactionEmoji, setTutorialReactionEmoji] = useState(null);
    const [tutorialComments, setTutorialComments] = useState([]);
    const [tutorialCommentText, setTutorialCommentText] = useState('');

    useEffect(() => {
        const questions = notice?.guest_properties?.random_questions ?? notice?.random_questions;
        if (Array.isArray(questions) && questions.length > 0) {
            const initialRandomIndex = Math.floor(Math.random() * questions.length);
            setCurrentQuestionIndex(initialRandomIndex);
        }
    }, [notice?.id]);

    const [viewCount, setViewCount] = useState(notice?.view_count || 0);

    useEffect(() => {
        setViewCount(notice?.view_count || 0);
    }, [notice?.id, notice?.view_count]);

    // 이용자 열람 시 조회수 세션 단위 집계 및 실시간 업데이트
    useEffect(() => {
        if (!notice?.id || !user?.id || fromAdmin || isImpersonating || tutorialMode) return;

        const viewerRole = String(user.role || '').toLowerCase();
        const viewerGroup = String(user.user_group || '').toLowerCase();
        const isInternalViewer = ['admin', 'master', 'staff'].includes(viewerRole)
            || viewerGroup === 'staff'
            || viewerGroup === '관리자';

        if (isInternalViewer) return;

        const sessionKey = `viewed_notice_${notice.id}_${user.id}`;
        const alreadyViewed = sessionStorage.getItem(sessionKey);
        
        if (!alreadyViewed) {
            sessionStorage.setItem(sessionKey, 'true');
            noticesApi.incrementViewCount(notice.id).then((updatedCount) => {
                if (typeof updatedCount === 'number') {
                    setViewCount(updatedCount);
                } else {
                    setViewCount(prev => prev + 1);
                }
            }).catch(console.error);
        }
    }, [notice?.id, user?.id, user?.role, user?.user_group, fromAdmin, isImpersonating, tutorialMode]);

    // Challenge & Modal States
    const [challengeParticipants, setChallengeParticipants] = useState([]);
    const [uploadingMissionId, setUploadingMissionId] = useState(null);
    const [missionTextInputs, setMissionTextInputs] = useState({});
    const [selectedMissionForDetail, setSelectedMissionForDetail] = useState(null);
    const [showSuccessPopup, setShowSuccessPopup] = useState(false);
    const [selectedParticipantForMissions, setSelectedParticipantForMissions] = useState(null);
    const [showChallengeCommunity, setShowChallengeCommunity] = useState(false);
    const [showPostProgramPopup, setShowPostProgramPopup] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [showAdminFeedbackModal, setShowAdminFeedbackModal] = useState(false);
    const [feedbackCount, setFeedbackCount] = useState(0);

    useEffect(() => {
        const fetchFbCount = async () => {
            if (fromAdmin && notice?.id) {
                try {
                    const { count } = await supabase
                        .from('program_feedback')
                        .select('id', { count: 'exact', head: true })
                        .eq('notice_id', notice.id);
                    setFeedbackCount(count || 0);
                } catch (e) {
                    console.error('Error fetching fb count:', e);
                }
            }
        };
        fetchFbCount();
    }, [fromAdmin, notice?.id, showAdminFeedbackModal]);
    const [hasReviewed, setHasReviewed] = useState(false);

    useEffect(() => {
        const checkReview = async () => {
            if (notice?.id && user?.id) {
                try {
                    const { data } = await supabase
                        .from('program_feedback')
                        .select('id')
                        .eq('notice_id', notice.id)
                        .eq('user_id', user.id)
                        .maybeSingle();
                    setHasReviewed(!!data);
                } catch (e) {
                    console.error('Failed to check review status:', e);
                }
            }
        };
        checkReview();
    }, [notice?.id, user?.id, showFeedbackModal]);

    const scrollToSection = (section) => {
        setActiveTab(section);
        const target = section === 'intro' ? introRef.current : hostRef.current;
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    useEffect(() => {
        const noticeHosts = notice.hosts || [];
        const ids = noticeHosts.length > 0
            ? noticeHosts.map(h => h.host_id).filter(Boolean)
            : (notice.host_ids || (notice.host_id ? [notice.host_id] : []));

        if (ids && ids.length > 0) {
            const fetchHosts = async () => {
                try {
                    const { data, error } = await supabase
                        .from('users')
                        .select('id, name, profile_image_url, school, role')
                        .in('id', ids);
                    if (error) throw error;
                    
                    const mapped = (data || []).map(user => {
                        const matchedHost = noticeHosts.find(h => h.host_id === user.id);
                        return {
                            ...user,
                            one_liner: matchedHost ? matchedHost.one_liner : notice.host_one_liner
                        };
                    });
                    const sortedMapped = mapped.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
                    setHostUsers(sortedMapped);
                } catch (err) {
                    console.error('Error fetching host users:', err);
                }
            };
            fetchHosts();
        } else {
            setHostUsers([]);
        }
    }, [notice]);

    useEffect(() => {
        if (notice?.is_challenge && notice?.id) {
            const fetchChallengeParticipants = async () => {
                const { data, error } = await supabase
                    .from('notice_responses')
                    .select('user_id, status, challenge_mission_statuses, users(name, school)')
                    .eq('notice_id', notice.id)
                    .eq('status', 'JOIN')
                    .order('created_at', { ascending: true });
                if (data) {
                    setChallengeParticipants(data);
                }
            };
            fetchChallengeParticipants();
        }
    }, [notice?.id, notice?.is_challenge, responses]);

    const handleUploadMissionImage = async (missionId, file) => {
        if (!file) return;
        setUploadingMissionId(missionId);
        try {
            const compressedFile = await compressImage(file);
            const fileExt = file.name.split('.').pop();
            const fileName = `mission_${notice.id}_${user.id}_${missionId}_${Date.now()}.${fileExt}`;

            let publicUrl;
            if(isAccountAuthEnabled())publicUrl=await uploadAccountImage({profileId:user.id,kind:'mission',file:compressedFile});
            else {
                const { error: uploadError } = await supabase.storage.from('notice-images').upload(fileName, compressedFile);
                if (uploadError) throw uploadError;
                ({ data: { publicUrl } } = supabase.storage.from('notice-images').getPublicUrl(fileName));
            }

            const myResponse = responseDetails[notice.id] || {};
            const currentStatuses = { ...(myResponse.challenge_mission_statuses || {}) };

            currentStatuses[missionId] = {
                completed: true,
                auth_image: publicUrl,
                auth_type: 'photo',
                submitted_at: new Date().toISOString()
            };

            const { error: updateErr } = await supabase
                .from('notice_responses')
                .update({ challenge_mission_statuses: currentStatuses })
                .eq('notice_id', notice.id)
                .eq('user_id', user.id);

            if (updateErr) throw updateErr;

            alert('인증샷 등록이 완료되었습니다!');

            const totalMissions = notice.challenge_missions?.length || 0;
            const isAllCompleted = totalMissions > 0 && notice.challenge_missions.every(m => currentStatuses[m.id]?.completed);
            if (isAllCompleted) {
                setTimeout(() => {
                    confetti({
                        particleCount: 150,
                        spread: 80,
                        origin: { y: 0.6 }
                    });
                    setShowSuccessPopup(true);
                }, 500);
            }
            
            if (onRefresh) onRefresh(); 
        } catch (err) {
            console.error('Failed to upload mission image:', err);
            alert('인증샷 업로드에 실패했습니다: ' + err.message);
        } finally {
            setUploadingMissionId(null);
        }
    };

    const handleSubmitMissionText = async (missionId, existingText = '') => {
        const authText = (missionTextInputs[missionId] ?? existingText).trim();
        if (!authText) {
            alert('인증 내용을 입력해주세요.');
            return;
        }

        setUploadingMissionId(missionId);
        try {
            const myResponse = responseDetails[notice.id] || {};
            const currentStatuses = { ...(myResponse.challenge_mission_statuses || {}) };
            currentStatuses[missionId] = {
                completed: true,
                auth_text: authText,
                auth_type: 'text',
                submitted_at: new Date().toISOString()
            };

            const { error: updateErr } = await supabase
                .from('notice_responses')
                .update({ challenge_mission_statuses: currentStatuses })
                .eq('notice_id', notice.id)
                .eq('user_id', user.id);

            if (updateErr) throw updateErr;

            alert('텍스트 인증이 등록되었습니다!');
            const totalMissions = notice.challenge_missions?.length || 0;
            const isAllCompleted = totalMissions > 0 && notice.challenge_missions.every(m => currentStatuses[m.id]?.completed);
            if (isAllCompleted) {
                setTimeout(() => {
                    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
                    setShowSuccessPopup(true);
                }, 500);
            }
            if (onRefresh) onRefresh();
            setSelectedMissionForDetail(null);
        } catch (err) {
            console.error('Failed to submit mission text:', err);
            alert('텍스트 인증 등록에 실패했습니다: ' + err.message);
        } finally {
            setUploadingMissionId(null);
        }
    };

    const { cleanContent, duration, location } = extractProgramInfo(notice.content);
    const formattedSchedule = formatProgramSchedule(
        notice.program_date,
        notice.program_duration || duration,
        notice.is_recruiting,
        notice.program_days,
        notice.program_start_date,
        notice.program_end_date
    );

    const isStudentPreviewOrStudent = Boolean(
        isImpersonating ||
        user?.role === 'student' ||
        user?.user_group === '학생' ||
        user?.is_impersonating ||
        context === 'student_preview'
    );

    const isAdmin = Boolean(
        fromAdmin || (
            !isStudentPreviewOrStudent && (
                context === 'admin' ||
                user?.role === 'admin' ||
                user?.role === 'ADMIN' ||
                user?.role === 'master' ||
                user?.role === 'MASTER' ||
                user?.is_admin ||
                Boolean(localStorage.getItem('admin_user'))
            )
        )
    );

    const {
        joinCount, waitlistCount,
        timeLeft,
        reactions: liveReactions, handleToggleReaction: handleLiveToggleReaction,
        userVotes, pendingVotes,
        isSubmittingPoll, pollResults,
        pollTotalVotes, pollTimeLeft, isPollExpired,
        handleOptionClick, handleSubmitVote,
    } = useNoticeModal({ notice, user, context, responses, tutorialMode });

    const isTutorialSocial = tutorialMode && ['noticeRead', 'noticeComment', 'noticeCommentResult'].includes(tutorialStep);
    const isTutorialOpenDetail = tutorialMode && tutorialStep === 'openDetail';
    const isTutorialChallengeDetail = tutorialMode && tutorialStep === 'challengeDetail';
    const tutorialOpenIsLast = tutorialOpenCardsTotal > 0 && tutorialOpenCardIndex >= tutorialOpenCardsTotal - 1;
    const tutorialChallengeIsLast = tutorialChallengeCardsTotal > 0 && tutorialChallengeCardIndex >= tutorialChallengeCardsTotal - 1;
    const tutorialOpenAction = isTutorialOpenDetail && (tutorialOpenIsLast ? '챌린지로 이동' : '다음 오픈 프로그램 보기');
    const tutorialOpenActionId = isTutorialOpenDetail ? (tutorialOpenIsLast ? 'show-challenge' : 'next-open-card') : null;
    const tutorialChallengeAction = null;
    const tutorialChallengeActionId = null;

    const reactions = isTutorialSocial && tutorialReactionEmoji
        ? [
            ...(liveReactions || []),
            { notice_id: notice.id, user_id: user?.id, emoji: tutorialReactionEmoji, users: { name: user?.name, school: user?.school } }
        ]
        : (liveReactions || []);
    const handleDisplayedReaction = (emoji) => {
        if (!isTutorialSocial) {
            handleLiveToggleReaction(emoji);
            return;
        }
        setTutorialReactionEmoji(emoji);
        onTutorialReaction?.(emoji);
    };
    const displayedComments = isTutorialSocial ? [...(comments || []), ...tutorialComments] : (comments || []);
    const submitDisplayedComment = (event) => {
        event.preventDefault();
        if (!isTutorialSocial) {
            onPostComment(event);
            return;
        }
        const content = tutorialCommentText.trim();
        if (!content) return;
        const tutorialComment = {
            id: `tutorial-comment-${Date.now()}`,
            user_id: user?.id,
            content,
            created_at: new Date().toISOString(),
            users: { name: user?.name, profile_image_url: user?.profile_image_url, school: user?.school },
            tutorial: true
        };
        setTutorialComments((current) => [...current, tutorialComment]);
        setTutorialCommentText('');
        onTutorialComment?.(tutorialComment);
    };

    const [groupParticipants, setGroupParticipants] = useState([]);
    const [showAdminTeamsModal, setShowAdminTeamsModal] = useState(false);

    useEffect(() => {
        const isGroupEnabled = notice.guest_properties?.enable_group_assignment ?? notice.enable_group_assignment;
        if (!isGroupEnabled || !notice?.id) return;

        const fetchParticipantsAndSeed = async () => {
            try {
                // Fetch latest guest_properties to catch remote shuffles from mobile
                const { data: latestNotice } = await supabase
                    .from('notices')
                    .select('guest_properties')
                    .eq('id', notice.id)
                    .single();

                const latestSeed = latestNotice?.guest_properties?.team_shuffle_seed ?? notice.guest_properties?.team_shuffle_seed ?? '';

                if (latestNotice?.guest_properties) {
                    notice.guest_properties = {
                        ...notice.guest_properties,
                        ...latestNotice.guest_properties
                    };
                }

                const { data } = await supabase
                    .from('notice_responses')
                    .select('user_id, status, users(id, name, school)')
                    .eq('notice_id', notice.id)
                    .eq('status', 'JOIN');

                if (data) {
                    const sorted = data.map(d => ({
                        id: String(d.users?.id || d.user_id || ''),
                        name: d.users?.name || '참가자',
                        school: d.users?.school || ''
                    })).sort((a, b) => a.id.localeCompare(b.id));

                    const shuffled = seededShuffle(sorted, latestSeed);
                    setGroupParticipants(shuffled);
                }
            } catch (err) {
                console.error("Auto sync error:", err);
            }
        };

        fetchParticipantsAndSeed();

        // Auto poll every 2.5 seconds while modal is active for instant F5-free sync!
        const interval = setInterval(fetchParticipantsAndSeed, 2500);
        return () => clearInterval(interval);
    }, [notice?.id, responses, notice.guest_properties?.team_shuffle_seed]);
    const { isStarted, isEnded, hasCustomFeatures, isProgramStartTimeReached } = (() => {
        const isManuallyEnded = (notice.guest_properties?.is_ended ?? notice.is_ended) === true;
        const pDate = notice.program_date;
        if (!pDate) return { isStarted: false, isEnded: isManuallyEnded, hasCustomFeatures: false };

        let startDateTime = new Date(pDate);
        if (isNaN(startDateTime.getTime())) {
            const pTime = notice.program_time || '00:00';
            startDateTime = new Date(`${pDate}T${pTime}`);
        }

        const now = new Date();

        let durationMinutes = 60;
        const durationStr = String(notice.program_duration || '').trim();

        if (durationStr) {
            const hourMatch = durationStr.match(/([\d.]+)\s*(시간|h)/i);
            const minMatch = durationStr.match(/([\d.]+)\s*(분|m)/i);
            if (hourMatch || minMatch) {
                durationMinutes = 0;
                if (hourMatch) durationMinutes += parseFloat(hourMatch[1]) * 60;
                if (minMatch) durationMinutes += parseFloat(minMatch[1]);
            } else {
                const plainNum = parseFloat(durationStr);
                if (!isNaN(plainNum) && plainNum > 0) {
                    durationMinutes = plainNum <= 12 ? plainNum * 60 : plainNum;
                }
            }
        }

        const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);
        const ended = isManuallyEnded || (now >= endDateTime);

        // 버튼 활성화 시점 계산 (시작 시점 기준 - N분 전, 또는 종료 시점 기준)
        const triggerBasis = notice.guest_properties?.post_program_button_trigger ?? notice.post_program_button_trigger ?? 'start_time';
        const offsetMinutes = Number(notice.guest_properties?.post_program_button_offset_minutes ?? notice.post_program_button_offset_minutes ?? 0);

        let activationTime = startDateTime;
        if (triggerBasis === 'start_time') {
            activationTime = new Date(startDateTime.getTime() - offsetMinutes * 60 * 1000);
        } else if (triggerBasis === 'end_time') {
            activationTime = endDateTime;
        }

        const started = now >= activationTime;

        const hasGroup = (notice.guest_properties?.enable_group_assignment ?? notice.enable_group_assignment);
        const hasQ = (notice.guest_properties?.enable_random_questions ?? notice.enable_random_questions) && (notice.guest_properties?.random_questions ?? notice.random_questions)?.length > 0;
        const hasCustomBtnName = !!((notice.guest_properties?.post_program_button_name ?? notice.post_program_button_name) && (notice.guest_properties?.post_program_button_name ?? notice.post_program_button_name).trim());
        const isButtonEnabled = notice.guest_properties?.enable_post_program_button ?? notice.enable_post_program_button ?? true;
        const customFeatures = isButtonEnabled && (hasGroup || hasQ || hasCustomBtnName);

        const programStartTimeReached = now >= startDateTime;
        return { isStarted: started, isEnded: ended, hasCustomFeatures: customFeatures, isProgramStartTimeReached: programStartTimeReached };
    })();

    const isTriggered = isStarted;

    const customButtonName = (() => {
        if ((notice.guest_properties?.post_program_button_name ?? notice.post_program_button_name) && (notice.guest_properties?.post_program_button_name ?? notice.post_program_button_name).trim()) return (notice.guest_properties?.post_program_button_name ?? notice.post_program_button_name);
        const hasGroup = (notice.guest_properties?.enable_group_assignment ?? notice.enable_group_assignment);
        const hasQ = (notice.guest_properties?.enable_random_questions ?? notice.enable_random_questions) && (notice.guest_properties?.random_questions ?? notice.random_questions)?.length > 0;
        if (hasGroup && hasQ) return '팀 확인 및 나눔 질문';
        if (hasGroup) return '팀 확인하기';
        if (hasQ) return '아이스브레이킹 질문';
        return '프로그램 안내';
    })();

    let allImages = [];
    if (notice.images && Array.isArray(notice.images)) {
        allImages = [...notice.images];
    }
    if (allImages.length === 0 && notice.image_url) {
        allImages.push(notice.image_url);
    }

    const handleSave = () => {
        onUpdate(editedNotice);
        setIsEditing(false);
    };

    useEffect(() => {
        const isGallery = context === 'GALLERY'; // Quick hack based on previous logic
        if (isGallery && context && notice.id) {
            const element = document.getElementById(`notice-${notice.id}`);
            if (element) {
                element.scrollIntoView({ behavior: 'auto' });
            }
        }
    }, [notice.id, context]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                // Ignore ESC key if a higher-level overlay is currently open
                if (document.querySelector('.dropdown-overlay')) return;

                if (zoomedImage) {
                    setZoomedImage(null);
                } else if (isEditing) {
                    setIsEditing(false);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose, zoomedImage, isEditing]);

    return (
        <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[130] bg-white flex flex-col sm:max-w-lg mx-auto overflow-hidden shadow-2xl gpu-accelerated"
        >
            <NoticeHeader
                onClose={onClose}
                isAdmin={isAdmin}
                fromAdmin={fromAdmin}
                isEditing={isEditing}
                setIsEditing={setIsEditing}
                handleSave={handleSave}
                handleDelete={onDelete}
                noticeId={notice.id}
                shareTitle={notice.title}
                shareSchedule={formattedSchedule}
                shareLocation={notice.program_location || location}
            />

            <div data-tour={tutorialMode ? 'tutorial-program-detail' : undefined} className="flex-1 overflow-y-auto scrollbar-hide bg-white">
                <div className="px-6 pt-6 pb-1">
                    {!isEditing && <NoticeCarousel allImages={allImages} />}

                    {isEditing ? (
                        <div className="py-2 animate-fade-in-up">
                            <WriteForm
                                mode={notice.category}
                                editNoticeId={notice.id}
                                existingNotice={notice}
                                onSave={(savedData) => {
                                    onUpdate({ ...savedData, id: notice.id });
                                    setIsEditing(false);
                                }}
                                onCancel={() => setIsEditing(false)}
                                flat={true}
                            />
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <h1 className="text-2xl font-bold text-tossGrey900 leading-tight">{tutorialMode && notice.is_challenge ? 'HAIFN CHALLENGE' : notice.title}</h1>
                                {(fromAdmin || user?.role === 'admin' || user?.role === 'master' || user?.role === 'staff' || user?.user_group === 'STAFF' || user?.user_group === '관리자') && (
                                    <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-extrabold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                                        <Eye size={14} className="text-gray-500" />
                                        조회수 {viewCount || 0}회
                                    </span>
                                )}
                            </div>
                            {notice.category === 'PROGRAM' && (
                                <div className="bg-tossGrey50 rounded-toss-xl p-5 space-y-4 mb-6">
                                    <div className="flex text-sm leading-relaxed">
                                        <span className="w-16 text-tossGrey500 font-semibold shrink-0">일정</span>
                                        <span className="text-tossBlue font-extrabold">{formattedSchedule}</span>
                                    </div>
                                    <div className="flex text-sm leading-relaxed">
                                        <span className="w-16 text-tossGrey500 font-semibold shrink-0">장소</span>
                                        <span className="text-tossGrey900 font-extrabold">{notice.program_location || location || '미정'}</span>
                                    </div>
                                    <div className="flex text-sm leading-relaxed">
                                        <span className="w-16 text-tossGrey500 font-semibold shrink-0">인원</span>
                                        <span className="text-tossGrey900 font-extrabold">{notice.max_capacity > 0 ? `${notice.max_capacity}명` : '제한 없음'}</span>
                                    </div>
                                </div>
                            )}

                            {/* Sticky Section Tabs: Only show when both Introduction and Host sections are active */}
                            {notice.category === 'PROGRAM' && notice.program_type === 'CENTER' && hostUsers.length > 0 && (
                                <div className="flex border-b border-tossGrey100 sticky top-0 bg-white/95 backdrop-blur z-20 mb-6">
                                    <button
                                        onClick={() => scrollToSection('intro')}
                                        className={`flex-1 py-3 text-center text-sm font-extrabold border-b-2 transition-all ${
                                            activeTab === 'intro' ? 'border-tossBlue text-tossBlue' : 'border-transparent text-tossGrey400 hover:text-tossGrey600'
                                        }`}
                                    >
                                        소개
                                    </button>
                                    <button
                                        onClick={() => scrollToSection('host')}
                                        className={`flex-1 py-3 text-center text-sm font-extrabold border-b-2 transition-all ${
                                            activeTab === 'host' ? 'border-tossBlue text-tossBlue' : 'border-transparent text-tossGrey400 hover:text-tossGrey600'
                                        }`}
                                    >
                                        호스트
                                    </button>
                                </div>
                            )}

                            {/* Program Intro Content (Always rendered first) */}
                            <div>
                                {notice.category === 'PROGRAM' && (
                                    <div 
                                        ref={notice.program_type === 'CENTER' && hostUsers.length > 0 ? introRef : null} 
                                        className={`flex items-center gap-2 scroll-mt-20 ${
                                            notice.program_type === 'CENTER' && hostUsers.length > 0 ? 'mt-4 mb-4' : 'mt-8 mb-4'
                                        }`}
                                    >
                                        <div className="w-[3px] h-[14px] bg-tossBlue rounded-full"></div>
                                        <h3 className="font-extrabold text-[15px] leading-none text-tossGrey900">
                                            소개
                                        </h3>
                                    </div>
                                )}
                                <div className="prose max-w-none text-tossGrey850 leading-snug prose-p:leading-snug prose-headings:leading-snug prose-li:leading-snug prose-p:my-1.5 mb-2 overflow-hidden">
                                    <div dangerouslySetInnerHTML={{ __html: notice.category === 'PROGRAM' ? cleanContent : notice.content }} />
                                    {extractUrls(notice.content).map((url, i) => <LinkPreview key={i} url={url} />)}
                                </div>
                            </div>

                            {/* Challenge Sections: render below intro */}
                            {notice.is_challenge && (() => {
                                const myResponse = responseDetails[notice.id] || {};
                                const statuses = myResponse.challenge_mission_statuses || {};
                                const totalMissions = notice.challenge_missions?.length || 0;
                                const isAllDone = totalMissions > 0 && notice.challenge_missions.every(m => statuses[m.id]?.completed);

                                return (
                                    <>
                                        {isAllDone && (
                                            <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-100/50 rounded-2xl p-5 flex flex-col items-center text-center shadow-sm animate-fade-in">
                                                <span className="text-3xl mb-2">🎉</span>
                                                <h4 className="font-black text-slate-800 text-sm">챌린지 미션 달성 완료!</h4>
                                                <p className="text-[11px] text-slate-505 font-semibold mt-1">모든 미션 인증에 성공하셨습니다.</p>
                                                <button
                                                    onClick={() => {
                                                        confetti({
                                                            particleCount: 100,
                                                            spread: 70,
                                                            origin: { y: 0.6 }
                                                        });
                                                        setShowSuccessPopup(true);
                                                    }}
                                                    className="mt-3 px-4 py-2 bg-tossBlue hover:bg-tossBlueHover text-white font-extrabold text-xs rounded-xl shadow-sm active:scale-[0.98] transition-all"
                                                >
                                                    축하 메시지 다시보기
                                                </button>
                                            </div>
                                        )}
                                        {/* Missions List */}
                                        <div data-tour={tutorialMode && tutorialStep === 'challengeDetail' ? 'tutorial-challenge-missions' : undefined} className={`mt-8 border-t border-tossGrey100 pt-8 ${tutorialMode && tutorialStep === 'challengeDetail' ? '-mx-6 w-[calc(100%+3rem)] overflow-hidden rounded-3xl' : ''}`}>
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-[3px] h-[14px] bg-tossBlue rounded-full"></div>
                                                <h3 className="font-extrabold text-[15px] leading-none text-tossGrey900">
                                                    미션 목록
                                                </h3>
                                            </div>
                                            
                                            <div className="bg-white border border-tossGrey200 rounded-toss-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
                                                <div className="flex items-center justify-around gap-2">
                                                    {notice.challenge_missions?.map((mission, index) => {
                                                        const myResponse = responseDetails[notice.id] || {};
                                                        const statuses = myResponse.challenge_mission_statuses || {};
                                                        const mStatus = statuses[mission.id] || {};
                                                        const isDone = mStatus.completed;
                                                        return (
                                                            <div 
                                                                key={mission.id}
                                                                onClick={() => { setSelectedMissionForDetail(mission); if (tutorialMode) onTutorialAction?.('mission-opened'); }}
                                                                className="flex flex-col items-center cursor-pointer select-none group flex-1"
                                                            >
                                                                {/* Icon Circle */}
                                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs mb-2 transition-colors ${
                                                                    isDone 
                                                                        ? 'bg-tossGrey200 text-tossGrey400' 
                                                                        : 'bg-tossBlueLight text-tossBlue group-hover:bg-tossBlue group-hover:text-white'
                                                                }`}>
                                                                    {isDone ? (
                                                                        <Check size={14} />
                                                                    ) : (
                                                                        index + 1
                                                                    )}
                                                                </div>

                                                                {/* Mission Info */}
                                                                <span className={`text-[11px] font-bold text-center leading-snug break-all ${
                                                                    isDone ? 'text-tossGrey400 line-through font-medium' : 'text-tossGrey900'
                                                                }`}>
                                                                    {mission.title}
                                                                </span>
                                                                {isDone && (
                                                                    <span className="bg-tossGrey100 text-tossGrey500 text-[8px] font-extrabold px-1.5 py-0.2 rounded mt-1">
                                                                        성공
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                    {/* Mission Detail Modal (Overlay) */}
                                    {selectedMissionForDetail && (() => {
                                        const mission = selectedMissionForDetail;
                                        const myResponse = responseDetails[notice.id] || {};
                                        const statuses = myResponse.challenge_mission_statuses || {};
                                        const mStatus = statuses[mission.id] || {};
                                        const isDone = mStatus.completed;
                                        const hasImg = !!mStatus.auth_image;
                                        const isTextVerification = mission.verification_type === 'text';
                                        const hasJoined = responses[notice.id] === 'JOIN';

                                        return (
                                            <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedMissionForDetail(null)}>
                                                <div data-tour={tutorialMode ? 'tutorial-challenge-mission-detail' : undefined} className="bg-white rounded-3xl w-full max-w-sm overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.15)] animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                                                    {/* Card Header Banner */}
                                                    <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/50 px-6 py-4 border-b border-tossGrey100 flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-black text-tossBlue tracking-wider uppercase">Mission Card</span>
                                                            <div className="w-1.5 h-1.5 rounded-full bg-tossBlue animate-pulse"></div>
                                                        </div>
                                                        <button 
                                                            onClick={() => setSelectedMissionForDetail(null)}
                                                            className="p-1 hover:bg-tossGrey100 rounded-full transition text-tossGrey500"
                                                        >
                                                            <X size={18} className="stroke-[2.5]" />
                                                        </button>
                                                    </div>

                                                    {/* Card Content */}
                                                    <div className="p-6">
                                                        <h3 className="text-2xl font-black text-tossGrey900 mb-6">{mission.title}</h3>

                                                        <div className="space-y-5 mb-8">
                                                            {mission.location && (
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-xs font-bold text-tossGrey400 uppercase tracking-wider">지정 장소</span>
                                                                    <span className="font-black text-tossGrey800 text-[15px]">{mission.location}</span>
                                                                </div>
                                                            )}

                                                            {mission.description && (
                                                                <div className="flex flex-col gap-1.5">
                                                                    <span className="text-xs font-bold text-tossGrey400 uppercase tracking-wider">미션 가이드</span>
                                                                    <span className="font-semibold text-tossGrey700 text-sm leading-relaxed whitespace-pre-wrap">{mission.description}</span>
                                                                </div>
                                                            )}

                                                            {hasImg && (
                                                                <div className="pt-2">
                                                                    <span className="text-xs font-bold text-tossGrey400 block mb-2">등록한 인증 사진</span>
                                                                    <div className="relative rounded-2xl overflow-hidden border border-tossGrey150 max-h-56 bg-tossGrey50 flex items-center justify-center">
                                                                        <img src={mStatus.auth_image} alt="" className="max-h-56 w-full object-cover" />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    {/* Verification Button */}
                                                    {tutorialMode ? (
                                                        <button type="button" onClick={() => { setSelectedMissionForDetail(null); onTutorialAction?.('show-content'); }} className="w-full py-4 rounded-2xl bg-tossBlue text-white text-sm font-black">다음 튜토리얼</button>
                                                    ) : hasJoined && (
                                                        isTextVerification ? (
                                                            <div className="space-y-3">
                                                                <div>
                                                                    <label className="text-xs font-bold text-tossGrey500 block mb-2">
                                                                        {isDone ? '등록한 인증 내용' : '인증 내용'}
                                                                    </label>
                                                                    <textarea
                                                                        value={missionTextInputs[mission.id] ?? mStatus.auth_text ?? ''}
                                                                        onChange={(e) => setMissionTextInputs(prev => ({
                                                                            ...prev,
                                                                            [mission.id]: e.target.value
                                                                        }))}
                                                                        rows={5}
                                                                        maxLength={1000}
                                                                        placeholder="미션을 수행한 내용을 입력해주세요."
                                                                        className="w-full px-4 py-3 bg-tossGrey50 border border-tossGrey200 rounded-2xl outline-none resize-none text-sm font-semibold text-tossGrey800 placeholder:text-tossGrey400 focus:border-tossBlue focus:bg-white transition-all"
                                                                    />
                                                                    <p className="mt-1 text-right text-[10px] font-semibold text-tossGrey400">
                                                                        {(missionTextInputs[mission.id] ?? mStatus.auth_text ?? '').length}/1000
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSubmitMissionText(mission.id, mStatus.auth_text || '')}
                                                                    disabled={uploadingMissionId === mission.id}
                                                                    className="w-full py-4 bg-tossBlue text-white font-black text-center rounded-2xl text-sm transition-all hover:bg-blue-600 active:scale-[0.98] disabled:bg-tossGrey300 flex items-center justify-center gap-1.5"
                                                                >
                                                                    <FileText size={16} />
                                                                    {uploadingMissionId === mission.id
                                                                        ? '등록 중...'
                                                                        : (isDone ? '내용 수정하기' : '텍스트로 인증하기')}
                                                                </button>
                                                            </div>
                                                        ) : isDone ? (
                                                            <div className="flex gap-2">
                                                                <a
                                                                    href={mStatus.auth_image}
                                                                    download={`mission_auth_${mission.id}.jpg`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="flex-1 py-3 bg-tossGrey100 hover:bg-tossGrey200 text-tossGrey700 font-bold text-center rounded-2xl text-xs transition flex items-center justify-center gap-1"
                                                                >
                                                                    <span>사진 다운로드</span>
                                                                </a>
                                                                <button
                                                                    onClick={() => {
                                                                        document.getElementById(`modal-file-input-${mission.id}`).click();
                                                                    }}
                                                                    disabled={uploadingMissionId === mission.id}
                                                                    className="flex-1 py-3 bg-tossBlue text-white font-extrabold text-center rounded-2xl text-xs transition hover:bg-blue-600 active:scale-[0.98]"
                                                                >
                                                                    {uploadingMissionId === mission.id ? '업로드 중...' : '수정 후 재등록'}
                                                                </button>
                                                                <input 
                                                                    type="file" 
                                                                    id={`modal-file-input-${mission.id}`}
                                                                    accept="image/*" 
                                                                    className="hidden" 
                                                                    onChange={async (e) => {
                                                                        if (e.target.files[0]) {
                                                                            await handleUploadMissionImage(mission.id, e.target.files[0]);
                                                                            setSelectedMissionForDetail(null);
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <button
                                                                    onClick={() => {
                                                                        document.getElementById(`modal-file-input-${mission.id}`).click();
                                                                    }}
                                                                    disabled={uploadingMissionId === mission.id}
                                                                    className="w-full py-4 bg-tossBlue text-white font-black text-center rounded-2xl text-sm transition-all hover:bg-blue-600 active:scale-[0.98] flex items-center justify-center gap-1.5"
                                                                >
                                                                    {uploadingMissionId === mission.id ? (
                                                                        <span className="animate-pulse">업로드 중...</span>
                                                                    ) : (
                                                                        <>
                                                                            <Upload size={16} />
                                                                            <span>인증하기</span>
                                                                        </>
                                                                    )}
                                                                </button>
                                                                <input 
                                                                    type="file" 
                                                                    id={`modal-file-input-${mission.id}`}
                                                                    accept="image/*" 
                                                                    className="hidden" 
                                                                    onChange={async (e) => {
                                                                        if (e.target.files[0]) {
                                                                            await handleUploadMissionImage(mission.id, e.target.files[0]);
                                                                            setSelectedMissionForDetail(null);
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}

                                    {/* Challengers Status */}
                                    <div className="mt-8 border-t border-tossGrey100 pt-8">
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className="w-[3px] h-[14px] bg-tossBlue rounded-full"></div>
                                            <h3 className="font-extrabold text-[15px] leading-none text-tossGrey900">
                                                참여자 현황
                                            </h3>
                                        </div>
                                        <div className="flex flex-col gap-2.5">
                                            {challengeParticipants.length === 0 ? (
                                                <div className="w-full p-8 text-center text-tossGrey400 text-xs font-bold bg-white border border-tossGrey200 rounded-toss-xl">
                                                    첫 번째 참여자가 되어보세요.
                                                </div>
                                            ) : (
                                                challengeParticipants.map((challenger) => {
                                                    const statuses = challenger.challenge_mission_statuses || {};
                                                    const isSuccess = (notice.challenge_missions?.length || 0) > 0 && notice.challenge_missions.every(m => statuses[m.id]?.completed);
                                                    const completedCount = notice.challenge_missions?.filter(m => statuses[m.id]?.completed).length || 0;

                                                    return (
                                                        <button
                                                            key={challenger.user_id} 
                                                            type="button"
                                                            className="w-full px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors border border-tossGrey200 rounded-2xl bg-white text-left hover:border-tossBlue hover:shadow-toss-subtle"
                                                            onClick={() => setSelectedParticipantForMissions(challenger)}
                                                        >
                                                            <span className="text-xs font-black text-tossGrey850 truncate w-20 shrink-0">
                                                                {challenger.users?.name?.replace('(guest)', '')}
                                                            </span>
                                                            <span className="flex flex-wrap gap-1 flex-1" aria-label={`${completedCount}/${notice.challenge_missions?.length || 0} 완료`}>
                                                                {(notice.challenge_missions || []).map((mission, missionIndex) => <span key={mission.id || missionIndex} className={`w-3 h-3 rounded-full border ${statuses[mission.id]?.completed ? 'bg-tossBlue border-tossBlue' : 'bg-white border-tossGrey300'}`}/>) }
                                                            </span>
                                                            <span className={`text-[10px] font-black px-2 py-1 rounded-full whitespace-nowrap ${
                                                                isSuccess 
                                                                    ? 'bg-tossBlueLight text-tossBlue' 
                                                                    : 'bg-tossGrey50 text-tossGrey500'
                                                            }`}>
                                                                {completedCount}/{notice.challenge_missions?.length || 0} {isSuccess ? '성공' : '진행'}
                                                            </span>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                        {notice.challenge_format === 'ONLINE' && notice.community_enabled && responseDetails[notice.id]?.status === 'JOIN' && !fromAdmin && <button type="button" onClick={() => setShowChallengeCommunity(true)} className="mt-4 w-full rounded-2xl bg-tossBlue py-4 text-sm font-black text-white shadow-md shadow-blue-100 flex items-center justify-center gap-2"><MessageSquare size={18}/>챌린지 커뮤니티 입장하기</button>}
                                    </div>
                                </>
                            )})()}

                            {notice.category === 'PROGRAM' && notice.program_type === 'CENTER' && hostUsers.length > 0 && (
                                <div ref={hostRef} className="mb-6 scroll-mt-20 flex flex-col gap-3">
                                    {/* Hosts with one-liners: rendered individually */}
                                    {hostUsers.filter(h => h.one_liner && h.one_liner.trim() !== '').map(host => (
                                        <div key={host.id} className="flex items-center gap-3.5 bg-tossGrey50/85 border border-tossGrey100/40 rounded-toss-xl p-4 shadow-toss-subtle">
                                            <UserAvatar user={host} size="w-12 h-12" />
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-extrabold text-tossGrey900 text-sm leading-snug">{host.name}</span>
                                                <span className="text-xs text-tossGrey600 font-semibold mt-1 break-keep leading-relaxed">{host.one_liner}</span>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {/* Hosts without one-liners: grouped together in one card */}
                                    {(() => {
                                        const noOneLinerHosts = hostUsers.filter(h => !h.one_liner || h.one_liner.trim() === '');
                                        if (noOneLinerHosts.length === 0) return null;
                                        
                                        const count = noOneLinerHosts.length;
                                        let avatarSize = "w-10 h-10";
                                        let nameSize = "text-xs";
                                        let textSize = "text-xs";
                                        
                                        if (count >= 7) {
                                            avatarSize = "w-7 h-7";
                                            nameSize = "text-[10px]";
                                            textSize = "text-[9px]";
                                        } else if (count === 6) {
                                            avatarSize = "w-8 h-8";
                                            nameSize = "text-[11px]";
                                            textSize = "text-[10px]";
                                        } else if (count <= 3) {
                                            avatarSize = "w-12 h-12";
                                            nameSize = "text-sm";
                                            textSize = "text-xs";
                                        }
                                        
                                        return (
                                            <div className="flex flex-row items-center justify-center gap-2 sm:gap-4 bg-tossGrey50/85 border border-tossGrey100/40 rounded-toss-xl p-5 shadow-toss-subtle w-full">
                                                {noOneLinerHosts.map(host => (
                                                    <div key={host.id} className="flex flex-col items-center gap-1 text-center min-w-0 flex-1">
                                                        <UserAvatar user={host} size={avatarSize} textSize={textSize} />
                                                        <span className={`font-extrabold text-tossGrey900 ${nameSize} truncate w-full`}>{host.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Polls */}
                            {notice.is_poll && notice.poll_options?.length > 0 && (
                                <div className="mb-8">
                                    <div className="bg-white p-5 rounded-toss-xl border border-tossGrey200/50 shadow-toss-standard">
                                        <div className="flex justify-between items-center mb-5">
                                            <div className="flex flex-col gap-1">
                                                <h3 className="text-sm font-bold text-tossGrey900 flex items-center gap-2">
                                                    <span className="w-1 h-4 bg-tossBlue rounded-full inline-block"></span>
                                                    투표 참여 {notice.allow_multiple_votes && <span className="text-[10px] font-bold text-tossBlue bg-tossBlueLight px-2 py-0.5 rounded-toss-sm">다중 선택</span>}
                                                </h3>
                                                {notice.poll_deadline && <span className={`text-[10px] font-bold ${isPollExpired ? 'text-tossGrey400' : 'text-tossError animate-pulse'}`}>{pollTimeLeft}</span>}
                                            </div>
                                            <div className="text-[10px] bg-tossBlueLight text-tossBlue px-3 py-1.5 rounded-toss-md font-bold">{pollTotalVotes}명 참여</div>
                                        </div>
                                        <div className="space-y-3">
                                            {notice.poll_options.map(opt => {
                                                const isSelected = notice.allow_multiple_votes ? pendingVotes.includes(opt.id) : userVotes.includes(opt.id);
                                                const votesForOption = pollResults[opt.id] || 0;
                                                const percentage = pollTotalVotes > 0 ? Math.round((votesForOption / pollTotalVotes) * 100) : 0;
                                                const showProgress = userVotes.length > 0;
                                                return (
                                                    <div key={opt.id} onClick={() => handleOptionClick(opt.id, isEditing)} className={`relative overflow-hidden cursor-pointer transition-all duration-300 border rounded-toss-xl p-4 flex items-center gap-4 ${isSelected ? 'border-tossBlue bg-tossBlueLight/40' : 'border-tossGrey200 bg-white hover:border-tossBlue/20'}`}>
                                                        {showProgress && <div className={`absolute left-0 top-0 bottom-0 opacity-10 ${userVotes.includes(opt.id) ? 'bg-tossBlue' : 'bg-tossGrey400'}`} style={{ width: `${percentage}%` }} />}
                                                        {opt.image_url && (
                                                            <div className="relative w-14 h-14 rounded-toss-lg overflow-hidden shrink-0 border border-tossGrey100 bg-tossGrey50 z-10" onClick={(e) => { e.stopPropagation(); setZoomedImage(opt.image_url); }}>
                                                                <img src={opt.image_url} alt={opt.title} className="w-full h-full object-cover" />
                                                                <div className="absolute inset-0 bg-black/5 flex items-center justify-center opacity-0 hover:opacity-100 transition"><ZoomIn size={16} className="text-white shadow-sm" /></div>
                                                            </div>
                                                        )}
                                                        <div className="flex-1 z-10">
                                                            <div className="flex justify-between items-center">
                                                                <h4 className={`text-base font-bold ${isSelected ? 'text-tossBlue font-bold' : 'text-tossGrey800'}`}>{opt.title}</h4>
                                                                {showProgress && <span className="text-sm font-black text-tossBlue">{percentage}% <span className="text-[10px] opacity-70">({votesForOption}표)</span></span>}
                                                            </div>
                                                            {opt.description && <p className="text-xs text-tossGrey500">{opt.description}</p>}
                                                        </div>
                                                        <div className={`w-6 h-6 shrink-0 z-10 flex items-center justify-center border transition-colors ${notice.allow_multiple_votes ? 'rounded-toss-sm' : 'rounded-full'} ${isSelected ? 'border-tossBlue bg-tossBlue text-white' : 'border-tossGrey400 bg-white'}`}>
                                                            {isSelected && <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {notice.allow_multiple_votes && !isPollExpired && (
                                            <button onClick={() => handleSubmitVote(pendingVotes, isEditing)} disabled={isSubmittingPoll || pendingVotes.length === 0} className={`w-full mt-5 py-3.5 rounded-toss-xl font-bold text-white transition-all ${pendingVotes.length > 0 ? 'bg-tossBlue hover:bg-tossBlueHover' : 'bg-tossGrey100 text-tossGrey500 pointer-events-none'}`}>
                                                {isSubmittingPoll ? '제출 중...' : '투표 제출하기'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                             )}

                             {/* RSVP */}
                             {notice.category !== 'PROGRAM' && (
                                 notice.is_recruiting ? (
                                     <div className="bg-white p-6 rounded-toss-xl border border-tossGrey200/50 shadow-toss-standard mb-8">
                                         <div className="flex justify-between items-center mb-6">
                                             <div className="flex flex-col">
                                                 <p className="text-sm font-bold text-tossBlue">참여 여부 선택</p>
                                                 {notice.recruitment_deadline && <p className="text-[11px] font-bold text-tossError">{timeLeft}</p>}
                                             </div>
                                             {notice.max_capacity > 0 && <div className="bg-tossSuccess/10 text-tossSuccess px-3 py-1.5 rounded-toss-md text-xs font-bold">{joinCount} / {notice.max_capacity}명</div>}
                                         </div>
                                         {isAdmin ? (
                                             <div className="flex gap-2">
                                                 <button
                                                     onClick={() => onViewParticipants && onViewParticipants(notice, 'attendance')}
                                                     className="flex-1 py-3.5 rounded-toss-xl font-bold text-white transition-all bg-tossBlue hover:bg-tossBlueHover flex items-center justify-center gap-2"
                                                 >
                                                     신청자 명단 ({joinCount}명)
                                                 </button>
                                                 {notice.is_poll && (
                                                     <button
                                                         onClick={() => onViewParticipants && onViewParticipants(notice, 'poll')}
                                                         className="py-3.5 px-4 rounded-toss-xl font-bold text-purple-700 bg-purple-100 hover:bg-purple-200 transition-all flex items-center justify-center gap-1.5 shrink-0"
                                                     >
                                                         투표 결과
                                                     </button>
                                                 )}
                                             </div>
                                         ) : (
                                             <button
                                                 disabled={(notice.category === 'PROGRAM' ? !recruitment.canApply : (notice.recruitment_deadline && new Date(notice.recruitment_deadline) <= new Date())) || (!responses[notice.id] && notice.is_leader_only && !user?.is_leader)}
                                                 onClick={() => {
                                                     if (responses[notice.id]) {
                                                         onResponse(notice.id, 'CANCEL');
                                                     } else {
                                                         onResponse(notice.id, (notice.max_capacity > 0 && joinCount >= notice.max_capacity) ? 'WAITLIST' : 'JOIN');
                                                     }
                                                 }}
                                                 className={`w-full py-3.5 rounded-toss-xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 ${
                                                     responses[notice.id]
                                                         ? 'bg-red-50 text-tossError border border-red-200 hover:bg-red-100'
                                                         : (notice.max_capacity > 0 && joinCount >= notice.max_capacity
                                                             ? 'bg-tossWarning hover:bg-tossWarning/90 text-white'
                                                             : 'bg-tossBlue hover:bg-tossBlueHover text-white')
                                                 }`}
                                             >
                                                 {responses[notice.id] ? (
                                                     <>
                                                         <XCircle size={16} />
                                                         <span>{responses[notice.id] === 'WAITLIST' ? '대기 신청 취소' : '신청 취소'}</span>
                                                     </>
                                                 ) : (
                                                     notice.max_capacity > 0 && joinCount >= notice.max_capacity ? '대기 신청' : '신청하기'
                                                 )}
                                             </button>
                                         )}
                                     </div>
                                 ) : null
                             )}
                         </>
                     )}
                 </div>

                  {tutorialMode && tutorialStep === 'noticeRead' && (
                      <div className="mx-4 my-4 rounded-2xl border border-tossBlue/15 bg-tossBlueLight px-4 py-3.5">
                          <p className="text-sm font-black text-tossGrey900">게시글 내용을 모두 확인했나요?</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-tossGrey600">아래 이모지 버튼을 눌러 원하는 반응을 직접 골라 보세요. 선택한 반응은 튜토리얼 화면에만 표시돼요.</p>
                      </div>
                  )}

                  {tutorialMode && tutorialStep === 'programDetail' && (
                      <div className="mx-4 my-4 rounded-2xl border border-tossBlue/15 bg-tossBlueLight px-4 py-3.5">
                          <p className="text-sm font-black text-tossGrey900">상세 내용을 충분히 확인해 보세요</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-tossGrey600">소개, 일정, 장소와 정원을 확인한 뒤 화면 아래의 실제 <span className="text-tossBlue">신청하기</span> 버튼을 눌러 보세요. 체험 신청은 저장되지 않아요.</p>
                      </div>
                  )}

                  {tutorialMode && tutorialStep === 'programApplied' && (
                      <div className="mx-4 my-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                          <p className="text-sm font-black text-emerald-800">신청이 완료된 상태를 확인했어요</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-emerald-700">화면 아래 버튼이 신청 취소로 바뀌었고, 목록 카드와 캘린더에도 신청 상태가 반영돼요.</p>
                          <button type="button" onClick={() => onTutorialAction?.('show-open')} className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-xs font-black text-white">오픈 프로그램 알아보기</button>
                      </div>
                  )}

                  {tutorialMode && tutorialStep === 'openDetail' && (
                      <div className="mx-4 my-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                          <p className="text-sm font-black text-emerald-800">오픈 프로그램은 신청 없이 참여해요</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-emerald-700">상세 내용과 운영 시간, 장소를 확인한 뒤 해당 시간에 센터에서 바로 참여하면 돼요.</p>
                          {tutorialOpenActionId ? (
                              <button type="button" onClick={() => onTutorialAction?.(tutorialOpenActionId)} className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-xs font-black text-white">
                                  {tutorialOpenAction}
                              </button>
                          ) : null}
                      </div>
                  )}

                  {tutorialMode && tutorialStep === 'calendarDetail' && (
                      <div className="mx-4 my-4 rounded-2xl border border-tossBlue/15 bg-tossBlueLight px-4 py-4">
                          <p className="text-sm font-black text-tossGrey900">캘린더에서도 같은 상세 내용을 확인할 수 있어요</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-tossGrey600">신청한 일정의 시간과 장소를 다시 확인했어요.</p>
                          <button type="button" onClick={() => onTutorialAction?.('show-haifn')} className="mt-3 w-full rounded-xl bg-tossBlue py-3 text-xs font-black text-white">하이픈 스토어로 이동</button>
                      </div>
                  )}

                  {/* Slack-style Emoji Reactions (Rendered at the very bottom of post content) */}
                  <div data-tour={isTutorialSocial ? 'tutorial-notice-reactions' : undefined} className="px-4 py-2 mt-2">
                      <NoticeReactions
                          reactions={reactions}
                          currentUserId={user?.id}
                          onToggleReaction={handleDisplayedReaction}
                      />
                  </div>

                 {/* Comments Section */}
                 <div className="border-t border-tossGrey100 mt-1">
                     <div className="px-4 py-4 text-sm font-bold text-tossGrey900 border-b border-tossGrey100">댓글 {displayedComments.length}</div>
                     {displayedComments.map(c => (
                         <div key={c.id} data-tour={c.tutorial ? 'tutorial-comment-result' : undefined} className="px-4 py-4 flex gap-3 text-sm hover:bg-tossGrey50 transition group/notice-comment">
                             <UserAvatar user={c.users} size="w-8 h-8" />
                             <div className="flex-1">
                                 <div className="flex items-baseline justify-between">
                                     <div className="flex items-center gap-2">
                                         <span className="font-bold text-tossGrey900">{c.users?.name}</span>
                                         <span className="text-[10px] text-tossGrey400">{new Date(c.created_at).toLocaleDateString()}</span>
                                     </div>
                                     {c.user_id === user.id && !c.tutorial && (
                                         <button onClick={() => onDeleteComment(c.id)} className="p-1 text-tossGrey400 hover:text-tossError transition-colors">
                                             <Trash2 size={14} />
                                         </button>
                                     )}
                                 </div>
                                 <p className="text-tossGrey700 mt-1 leading-normal">{c.content}</p>
                             </div>
                         </div>
                     ))}
                     
                 </div>
             </div>
             {/* Program Notice Fixed Bottom Action Bar */}
             {notice.category === 'PROGRAM' && !isEditing && (
                 <div className="bg-white border-t border-tossGrey200 z-[60] shrink-0 shadow-toss-standard">
                     {notice.is_recruiting && notice.recruitment_deadline && !isEnded && (
                         <div className="bg-tossGrey900 text-center py-2.5 px-4 text-xs font-bold text-tossCaution tracking-tight">
                             {timeLeft}
                         </div>
                     )}
                     {isAdmin ? (
                         <div className="p-4 bg-white space-y-2.5">
                             {/* 1. 상단 숏컷 버튼 (신청자 / 투표 결과 / 팀배치 / 피드백) */}
                             <div className="flex items-center gap-2">
                                 <button
                                     onClick={() => onViewParticipants && onViewParticipants(notice, 'attendance')}
                                     className="flex-1 h-11 rounded-toss-xl font-bold text-tossBlue text-xs bg-tossBlueLight hover:bg-blue-100 transition transform active:scale-[0.98] flex items-center justify-center cursor-pointer px-2"
                                 >
                                     <span>신청자 ({joinCount}명)</span>
                                 </button>

                                 {notice.is_poll && (
                                     <button
                                         onClick={() => onViewParticipants && onViewParticipants(notice, 'poll')}
                                         className="flex-1 h-11 rounded-toss-xl font-bold text-purple-700 text-xs bg-purple-50 hover:bg-purple-100 transition transform active:scale-[0.98] flex items-center justify-center border border-purple-200 cursor-pointer px-2"
                                     >
                                         <span>투표 결과</span>
                                     </button>
                                 )}

                                 {(notice.guest_properties?.enable_group_assignment ?? notice.enable_group_assignment) && (
                                     <button
                                         onClick={() => setShowAdminTeamsModal(true)}
                                         className="flex-1 h-11 rounded-toss-xl font-bold text-indigo-600 text-xs bg-indigo-50 hover:bg-indigo-100 transition transform active:scale-[0.98] flex items-center justify-center border border-indigo-100 cursor-pointer px-2"
                                     >
                                         <span>팀 배치 ({(notice.guest_properties?.group_count ?? notice.group_count) || 4}팀)</span>
                                     </button>
                                 )}

                                 {(notice.enable_feedback === true || notice.guest_properties?.enable_feedback === true) && (
                                     <button
                                         onClick={() => setShowAdminFeedbackModal(true)}
                                         className="flex-1 h-11 rounded-toss-xl font-bold text-amber-800 text-xs bg-amber-50 hover:bg-amber-100 transition transform active:scale-[0.98] flex items-center justify-center border border-amber-200 cursor-pointer px-2"
                                     >
                                         <span>피드백 ({feedbackCount}건)</span>
                                     </button>
                                 )}
                             </div>

                             {/* 2. 하단 메인 상태 / 라이프사이클 버튼 */}
                             <div>
                                 {isEnded ? (
                                     <div className="w-full h-11 bg-tossGrey100 text-tossGrey400 rounded-toss-xl font-bold text-xs flex items-center justify-center select-none border border-tossGrey200">
                                         <span>종료된 프로그램입니다</span>
                                     </div>
                                 ) : (
                                     <button
                                         onClick={async () => {
                                             if (window.confirm('프로그램을 지금 종료하시겠습니까?\n\n종료하면 [종료된 프로그램] 상태로 변경되며, 참가했던 학생들에게 피드백 작성 버튼이 노출됩니다.')) {
                                                 try {
                                                     const currentGp = notice.guest_properties || {};
                                                     const { error } = await supabase
                                                         .from('notices')
                                                         .update({ 
                                                             program_status: 'COMPLETED',
                                                             guest_properties: {
                                                                 ...currentGp,
                                                                 is_ended: true
                                                             }
                                                         })
                                                         .eq('id', notice.id);

                                                     if (error) {
                                                         console.error('Error ending program:', error);
                                                         alert('프로그램 종료 처리 중 오류가 발생했습니다: ' + error.message);
                                                         return;
                                                     }
                                                     alert('프로그램이 종료 처리되었습니다.');
                                                     if (onRefresh) onRefresh();
                                                     onClose();
                                                 } catch (err) {
                                                     console.error('Error ending program:', err);
                                                     alert('프로그램 종료 처리 중 오류가 발생했습니다.');
                                                 }
                                             }
                                         }}
                                         className="w-full h-11 bg-red-50 hover:bg-red-100 text-tossError border border-red-200 rounded-toss-xl font-bold text-xs transition transform active:scale-[0.98] cursor-pointer flex items-center justify-center"
                                     >
                                         <span>프로그램 종료</span>
                                     </button>
                                 )}
                             </div>
                         </div>
                     ) : notice.is_recruiting === false ? (
                            <div className="p-4">
                                <div className="w-full rounded-toss-xl bg-tossSuccess/10 py-3.5 text-center text-sm font-black text-tossSuccess">
                                    신청 없이 참여할 수 있어요!
                                </div>
                            </div>
                     ) : isEnded ? (
                            /* 1. 프로그램 종료 상태 (종료 시간 경과 OR 관리자가 수동 종료): 피드백 작성/완료 버튼 노출 */
                            <div className="p-4 flex gap-3">
                                {responses[notice.id] === 'JOIN' && (notice.enable_feedback === true || notice.guest_properties?.enable_feedback === true) ? (
                                    <button
                                        onClick={() => setShowFeedbackModal(true)}
                                        className={`flex-1 py-3.5 rounded-toss-xl font-black text-base transition transform active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer ${
                                            hasReviewed 
                                            ? 'bg-tossGrey100 hover:bg-tossGrey200 text-tossGrey700 border border-tossGrey200' 
                                            : 'bg-tossBlue hover:bg-tossBlueHover text-white shadow-md shadow-blue-100'
                                        }`}
                                    >
                                        <Sparkles size={18} />
                                        <span>{hasReviewed ? '피드백 작성 완료' : '피드백 작성'}</span>
                                    </button>
                                ) : (
                                    <div className="flex-1 py-3.5 bg-tossGrey100 text-tossGrey400 text-center font-bold rounded-toss-xl text-sm select-none">
                                        종료된 프로그램입니다.
                                    </div>
                                )}
                            </div>
                        ) : responses[notice.id] === 'JOIN' ? (
                            /* 2. 신청 완료 학생: 버튼 활성화 시점(isStarted/offset) 경과 시 customButtonName 버튼으로 전환, 전이면 신청 취소 */
                            <div className="p-4 flex gap-3">
                                {isStarted && hasCustomFeatures ? (
                                    <button
                                         onClick={() => setShowPostProgramPopup(true)}
                                         className="w-full py-3.5 bg-tossBlue hover:bg-tossBlueHover text-white rounded-toss-xl font-black text-base transition transform active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-md shadow-blue-100 cursor-pointer"
                                    >
                                        <Sparkles size={18} />
                                        <span>{customButtonName}</span>
                                    </button>
                                ) : (
                                    <button
                                        data-tour={tutorialMode ? 'tutorial-program-response' : undefined}
                                        onClick={() => onResponse(notice.id, 'CANCEL')}
                                        disabled={!recruitment.canApply}
                                        className="flex-1 py-3.5 rounded-toss-xl font-bold text-base bg-red-50 text-tossError border border-red-200 hover:bg-red-100 flex items-center justify-center gap-1.5 transition transform active:scale-[0.98] cursor-pointer"
                                    >
                                        <XCircle size={18} />
                                        <span>{responses[notice.id] === 'WAITLIST' ? '대기 신청 취소' : '신청 취소'}</span>
                                    </button>
                                )}
                            </div>
                        ) : (
                            /* 3. 미신청 학생: 실제 마감시간(recruitment_deadline 또는 프로그램 시작시간) 전까지는 항상 '신청하기' 버튼 노출 */
                            <div className="p-4 flex gap-3">
                                {((notice.category === 'PROGRAM' ? !recruitment.canApply : (notice.recruitment_deadline && new Date(notice.recruitment_deadline) <= new Date())) || isProgramStartTimeReached) ? (
                                    <button
                                        disabled={true}
                                        className="flex-1 py-3.5 rounded-toss-xl font-bold text-base bg-tossGrey100 text-tossGrey400 cursor-not-allowed text-center"
                                    >
                                        신청 마감
                                    </button>
                                ) : (
                                    <button
                                        data-tour={tutorialMode ? 'tutorial-program-response' : undefined}
                                        disabled={notice.is_leader_only && !user?.is_leader}
                                        onClick={() => {
                                            onResponse(notice.id, (notice.max_capacity > 0 && joinCount >= notice.max_capacity) ? 'WAITLIST' : 'JOIN');
                                        }}
                                        className={`flex-1 py-3.5 rounded-toss-xl font-bold text-base transition transform active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer ${
                                            notice.max_capacity > 0 && joinCount >= notice.max_capacity 
                                                ? 'bg-tossWarning hover:bg-tossWarning/90 text-white' 
                                                : 'bg-tossBlue hover:bg-tossBlueHover text-white'
                                        }`}
                                    >
                                        {notice.max_capacity > 0 && joinCount >= notice.max_capacity ? '대기 신청' : '신청하기'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

              {/* Program Feedback Modal */}
              {showAdminFeedbackModal && (
                <AdminFeedbackListModal
                    notice={notice}
                    onClose={() => setShowAdminFeedbackModal(false)}
                />
            )}
            {showFeedbackModal && (
                  <ProgramFeedbackModal
                      program={notice}
                      existingFeedback={responseDetails[notice.id]?.feedback}
                      onClose={() => setShowFeedbackModal(false)}
                      onSuccess={() => {
                          setShowFeedbackModal(false);
                          if (onRefresh) onRefresh();
                      }}
                  />
              )}

             {/* Comment Input for Non-Program Notices */}
             {notice.category !== 'PROGRAM' && (
                 <div data-tour={isTutorialSocial ? 'tutorial-notice-comment-input' : undefined} className="p-3 border-t border-tossGrey200 bg-white sticky bottom-0 z-50">
                     <form onSubmit={submitDisplayedComment} className="flex items-center gap-3">
                         <UserAvatar user={user} size="w-8 h-8" />
                         <div className="flex-1 bg-tossGrey50 border border-tossGrey200 rounded-toss-xl px-4 py-2 flex items-center">
                             <input
                                 type="text"
                                 value={isTutorialSocial ? tutorialCommentText : (newComment || '')}
                                 onChange={(e) => isTutorialSocial ? setTutorialCommentText(e.target.value) : setNewComment(e.target.value)}
                                 placeholder="댓글 달기..."
                                 className="bg-transparent text-sm w-full outline-none py-1.5 text-tossGrey850"
                             />
                             {(isTutorialSocial ? tutorialCommentText : newComment)?.trim() && <button type="submit" className="text-tossBlue text-sm font-bold ml-2">게시</button>}
                         </div>
                     </form>
                     {isTutorialSocial && <p className="mt-2 text-center text-[10px] font-semibold text-tossGrey400">튜토리얼 댓글은 실제 게시글에 저장되지 않아요.</p>}
                 </div>
             )}

             {/* Zoom Overlay (Banner/Carousel & Poll Options) */}
             {zoomedImage && (
                 <div
                     className="fixed inset-0 z-[220] bg-black/95 flex items-center justify-center p-4 cursor-pointer animate-fade-in"
                     onClick={() => setZoomedImage(null)}
                 >
                     <button className="absolute top-6 right-6 text-white bg-white/10 p-2 rounded-full hover:bg-white/20 transition">
                         <X size={32} />
                     </button>
                     <img src={zoomedImage} className="max-w-full max-h-full object-contain animate-zoom-in" alt="Zoomed" />
                 </div>
             )}

             {/* Challenge Success Congratulation Modal */}
             {showSuccessPopup && (
                 <div className="fixed inset-0 z-[210] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowSuccessPopup(false)}>
                     <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-200 p-6 flex flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
                         <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-3xl mb-4 animate-bounce">
                             🏆
                         </div>
                         <h3 className="text-xl font-black text-slate-800 mb-2">축하합니다! 챌린지 성공!</h3>
                         <div className="text-sm font-semibold text-slate-600 leading-relaxed whitespace-pre-wrap mb-6 max-h-48 overflow-y-auto w-full px-2">
                             {notice.challenge_success_message || "모든 미션을 완벽히 해결하셨습니다! 대단해요 🎉"}
                         </div>
                         <div className="flex gap-2 w-full mt-2">
                             {notice.challenge_show_haifn_btn && (user?.role === 'GUEST' || user?.user_group === '게스트') && (
                                 <button
                                     onClick={() => {
                                         setShowSuccessPopup(false);
                                         if (onRegisterRegularUser) onRegisterRegularUser();
                                     }}
                                     className="flex-1 py-3.5 bg-white border border-tossBlue text-tossBlue font-black rounded-2xl text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                                 >
                                     <Sparkles size={12} className="text-indigo-500 shrink-0" />
                                     <span>하이픈 등록</span>
                                 </button>
                             )}
                             <button
                                 onClick={() => setShowSuccessPopup(false)}
                                 className="flex-1 py-3.5 bg-tossBlue hover:bg-tossBlueHover text-white font-black rounded-2xl text-xs transition-all active:scale-[0.98]"
                             >
                                 확인
                             </button>
                         </div>
                     </div>
                 </div>
             )}

             {/* Participant Mission Detail Overlay Modal */}
             {selectedParticipantForMissions && (() => {
                 const challenger = selectedParticipantForMissions;
                 const statuses = challenger.challenge_mission_statuses || {};
                 const name = challenger.users?.name?.replace('(guest)', '') || '참여자';
                 
                 return (
                     <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedParticipantForMissions(null)}>
                         <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.15)] animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
                             {/* Header */}
                             <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                                 <div className="flex items-center gap-2">
                                     <span className="text-xs font-black text-tossBlue tracking-wider uppercase">Participant Missions</span>
                                     <div className="w-1.5 h-1.5 rounded-full bg-tossBlue"></div>
                                 </div>
                                 <button 
                                     onClick={() => setSelectedParticipantForMissions(null)}
                                     className="p-1 hover:bg-tossGrey100 rounded-full transition text-tossGrey500"
                                 >
                                     <X size={18} className="stroke-[2.5]" />
                                 </button>
                             </div>
                             
                             {/* Body */}
                             <div className="p-6 overflow-y-auto space-y-6 flex-1">
                                 <div className="pb-4 border-b border-slate-100">
                                     <h3 className="text-lg font-black text-slate-800">{name}님의 미션 현황</h3>
                                     <p className="text-[11px] text-slate-400 font-bold mt-1">{challenger.users?.school || '더작은재단'}</p>
                                 </div>
                                 
                                 <div className="space-y-4">
                                     {notice.challenge_missions?.map((mission, index) => {
                                          const mStatus = statuses[mission.id] || {};
                                          const isDone = mStatus.completed;
                                          const authImg = mStatus.auth_image;
                                          const authText = mStatus.auth_text;
                                         
                                         return (
                                             <div key={mission.id || index} className="bg-slate-50/60 border border-slate-200/50 rounded-2xl p-4 space-y-3">
                                                 <div className="flex items-center gap-3">
                                                     <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                                         isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
                                                     }`}>
                                                         {isDone ? <Check size={14} className="stroke-[3]" /> : index + 1}
                                                     </div>
                                                     <span className={`text-sm font-bold ${isDone ? 'text-slate-800' : 'text-slate-400'}`}>
                                                         {mission.title}
                                                     </span>
                                                 </div>
                                                 
                                                  {isDone && authImg && (
                                                     <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-h-48 flex items-center justify-center cursor-pointer group" onClick={() => setZoomedImage(authImg)}>
                                                         <img src={authImg} alt="" className="max-h-48 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                                         <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                             <ZoomIn className="text-white shrink-0" size={24} />
                                                         </div>
                                                     </div>
                                                  )}
                                                  {isDone && authText && (
                                                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                                                          <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 mb-2">
                                                              <FileText size={12} /> 텍스트 인증
                                                          </div>
                                                          <p className="text-xs font-semibold text-slate-700 leading-5 whitespace-pre-wrap break-words">
                                                              {authText}
                                                          </p>
                                                      </div>
                                                  )}
                                             </div>
                                         );
                                     })}
                                 </div>
                             </div>
                         </div>
                     </div>
                 );
             })()}
             {showChallengeCommunity && <ChallengeCommunityModal notice={{...notice,__myResponse:responseDetails[notice.id]}} user={user} onClose={() => setShowChallengeCommunity(false)} onMissionCompleted={() => { onRefresh?.(); }} />}
            {/* Post-Program Custom Popup Modal (Ultra Sleek Toss Light Minimal UI) */}
            {showPostProgramPopup && (
                <div 
                    className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setShowPostProgramPopup(false)}
                >
                    <div 
                        className="bg-white w-[92vw] max-w-[340px] rounded-[2rem] p-6 shadow-2xl space-y-5 animate-scale-up border border-[#f2f4f6]"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header: Clean Title + Close Button */}
                        <div className="flex justify-between items-center pb-0.5">
                            <h2 className="text-xl font-black text-[#191f28] tracking-tight">
                                {(notice.guest_properties?.post_program_button_name ?? notice.post_program_button_name) || '팀 배치 및 나눔 질문'}
                            </h2>
                            <button 
                                onClick={() => setShowPostProgramPopup(false)}
                                className="p-1 text-[#8b95a1] hover:text-[#4e5968] rounded-full transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="space-y-3.5">
                            {/* 1. 오늘의 팀 */}
                            {(notice.guest_properties?.enable_group_assignment ?? notice.enable_group_assignment) && (
                                <div className="bg-[#f9fafb] border border-[#f2f4f6] rounded-2xl p-4 space-y-1">
                                    <p className="text-xs font-bold text-[#8b95a1] tracking-tight">오늘의 팀</p>
                                    {(() => {
                                        const groupCount = (notice.guest_properties?.group_count ?? notice.group_count) || 4;
                                        const myIndex = groupParticipants.findIndex(p => p.id === user?.id);
                                        const groupNum = myIndex !== -1 ? (myIndex % groupCount) + 1 : 1;
                                        return (
                                            <div className="text-2xl font-black text-[#191f28] tracking-tight pt-0.5">
                                                {groupNum}팀
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* 2. 오늘의 나눔 질문 */}
                            {(notice.guest_properties?.enable_random_questions ?? notice.enable_random_questions) && ((notice.guest_properties?.random_questions ?? notice.random_questions)?.length > 0) && (
                                <div className="bg-[#f9fafb] border border-[#f2f4f6] rounded-2xl p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-bold text-[#8b95a1] tracking-tight">오늘의 나눔 질문</p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const questions = notice?.guest_properties?.random_questions ?? notice?.random_questions;
                                                if (!Array.isArray(questions) || questions.length <= 1) return;
                                                setCurrentQuestionIndex(prevIndex => {
                                                    let nextIndex = Math.floor(Math.random() * questions.length);
                                                    while (nextIndex === prevIndex) {
                                                        nextIndex = Math.floor(Math.random() * questions.length);
                                                    }
                                                    return nextIndex;
                                                });
                                            }}
                                            className="text-xs font-bold text-[#4e5968] hover:text-[#191f28] bg-white hover:bg-slate-100 px-2.5 py-0.5 rounded-full transition flex items-center gap-1 cursor-pointer active:scale-95 border border-[#e5e8eb] shadow-2xs"
                                        >
                                            <RefreshCw size={11} className="stroke-[2.5]" />
                                            <span>새로 뽑기</span>
                                        </button>
                                    </div>
                                    <p className="text-base font-extrabold text-[#191f28] leading-relaxed pt-0.5">
                                        &ldquo;{(notice.guest_properties?.random_questions ?? notice.random_questions)[currentQuestionIndex % (notice.guest_properties?.random_questions ?? notice.random_questions).length]}&rdquo;
                                    </p>
                                </div>
                            )}

                            {/* External Link or Confirm Action Button */}
                            {(notice.guest_properties?.post_program_button_link ?? notice.post_program_button_link) ? (
                                <a
                                    href={(notice.guest_properties?.post_program_button_link ?? notice.post_program_button_link)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-3.5 bg-[#3182f6] hover:bg-[#1b64da] text-white font-extrabold rounded-2xl flex items-center justify-center gap-2 transition shadow-md shadow-blue-100 text-base mt-2 active:scale-[0.98] cursor-pointer"
                                >
                                    <span>바로가기</span>
                                    <ExternalLink size={18} />
                                </a>
                            ) : (
                                <button
                                    onClick={() => setShowPostProgramPopup(false)}
                                    className="w-full py-3.5 bg-[#3182f6] hover:bg-[#1b64da] text-white font-extrabold rounded-2xl transition shadow-md shadow-blue-100 text-base mt-2 active:scale-[0.98] cursor-pointer text-center"
                                >
                                    확인
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Teams Management Modal (Unified Desktop & Mobile UI) */}
            {showAdminTeamsModal && (
                <div 
                    className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-5 animate-fade-in"
                    onClick={() => setShowAdminTeamsModal(false)}
                >
                    <div 
                        className="bg-white w-full max-w-lg rounded-2xl sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl space-y-4 animate-scale-up border border-tossGrey100 max-h-[85vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-tossGrey100 shrink-0 gap-2">
                            <h3 className="font-extrabold text-tossGrey900 text-sm sm:text-base flex items-center gap-1.5 min-w-0">
                                <Users className="text-blue-600 shrink-0" size={18} />
                                <span className="truncate">팀 배치 현황 ({(notice.guest_properties?.group_count ?? notice.group_count) || 4}팀)</span>
                            </h3>

                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!window.confirm('팀 구성을 다시 랜덤으로 배치하시겠습니까?\n\n기존 조 구성이 변경되며 접속해 있는 참가자들에게도 즉시 반영됩니다.')) {
                                            return;
                                        }
                                        try {
                                            const newSeed = Math.random().toString(36).substring(2, 8);
                                            const currentGp = notice.guest_properties || {};
                                            const updatedGp = {
                                                ...currentGp,
                                                team_shuffle_seed: newSeed
                                            };

                                            const { error } = await supabase
                                                .from('notices')
                                                .update({ guest_properties: updatedGp })
                                                .eq('id', notice.id);

                                            if (error) throw error;

                                            if (!notice.guest_properties) notice.guest_properties = {};
                                            notice.guest_properties.team_shuffle_seed = newSeed;

                                            setGroupParticipants(prev => {
                                                const sorted = [...prev].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
                                                return seededShuffle(sorted, newSeed);
                                            });

                                            const updatedNotice = {
                                                ...notice,
                                                guest_properties: updatedGp
                                            };

                                            if (onUpdate) {
                                                await onUpdate(updatedNotice, true);
                                            }
                                        } catch (err) {
                                            console.error('팀 섞기 오류:', err);
                                            alert('팀 섞기 중 오류가 발생했습니다: ' + (err.message || err));
                                        }
                                    }}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-2xs shrink-0"
                                >
                                    <RefreshCw size={13} />
                                    <span>팀 랜덤 배치 🎲</span>
                                </button>
                                <button 
                                    onClick={() => setShowAdminTeamsModal(false)}
                                    className="p-1 text-tossGrey400 hover:text-tossGrey700 rounded-full transition-colors cursor-pointer shrink-0"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Body - 2 Column Student Member Grid */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-hide py-1">
                            {(() => {
                                const groupCount = (notice.guest_properties?.group_count ?? notice.group_count) || 4;
                                const teamsList = Array.from({ length: groupCount }, (_, i) => ({
                                    teamNum: i + 1,
                                    members: []
                                }));

                                groupParticipants.forEach((member, index) => {
                                    const teamIdx = index % groupCount;
                                    teamsList[teamIdx].members.push(member);
                                });
                                return teamsList.map(t => (
                                    <div key={t.teamNum} className="bg-blue-50/40 border border-blue-100 rounded-2xl p-4 space-y-2.5">
                                        <div className="text-blue-700 font-extrabold text-xs flex justify-between items-center">
                                            <span>{t.teamNum}팀 ({t.members.length}명)</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {t.members.length > 0 ? (
                                                t.members.map(m => (
                                                    <div 
                                                        key={m.id} 
                                                        className="bg-white border border-blue-100/80 rounded-xl p-2.5 flex flex-col justify-center min-w-0 shadow-2xs"
                                                        title={`${m.name} (${m.school || '소속없음'})`}
                                                    >
                                                        <span className="text-xs font-bold text-slate-800 truncate">{m.name}</span>
                                                        <span className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{m.school || '소속없음'}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <span className="text-xs text-slate-400 font-medium col-span-2 py-1">팀원이 없습니다</span>
                                            )}
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>

                        <button
                            onClick={() => setShowAdminTeamsModal(false)}
                            className="w-full py-3 bg-tossGrey100 hover:bg-tossGrey200 text-tossGrey700 font-bold rounded-toss-xl transition text-sm cursor-pointer shrink-0"
                        >
                            닫기
                        </button>
                    </div>
                </div>
            )}
    </motion.div>
    );
};

export default function NoticeModal(props) {
    const now = useCurrentTime();
    const state = getRecruitment(props.notice, now);
    if (!props.fromAdmin && !props.tutorialMode && !state.canViewDetails) return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-5" role="dialog" aria-modal="true" aria-label={props.notice.title}>
            <div className="relative w-full max-w-md rounded-3xl bg-white shadow-xl">
                <button type="button" aria-label="닫기" onClick={props.onClose} className="absolute right-3 top-3 p-2 text-slate-500"><X size={20} /></button>
                <ProgramAvailabilityNotice program={props.notice} now={now} />
            </div>
        </div>
    );
    return <NoticeModalContent {...props} />;
}
