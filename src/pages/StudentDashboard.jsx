import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { Home, Calendar, BookOpen, Award, Store, MessageSquareHeart, Menu, X, Settings, ShieldCheck, LogOut, Bell, Share2, QrCode } from 'lucide-react';
import { TAB_NAMES } from '../constants/appConstants';
import { useStudentDashboard } from '../hooks/useStudentDashboard';

// Tabs
import StudentHomeTab from '../components/student/StudentHomeTab';
import StudentBadgesTab from '../components/student/StudentBadgesTab';
import StudentCenterTab from '../components/student/StudentCenterTab';
import StudentNoticesTab from '../components/student/StudentNoticesTab';
import StudentGuestbookTab from '../components/student/StudentGuestbookTab';
import StudentCalendarTab from '../components/student/StudentCalendarTab';
import CommunityTab from '../components/community/CommunityTab';
import StudentChat from '../components/student/StudentChat';
import StudentHaifnTab from '../components/student/StudentHaifnTab';
import StudentAzitTab from '../components/student/StudentAzitTab';
import { userApi } from '../api/userApi';
import { noticesApi } from '../api/noticesApi';
import UserAvatar from '../components/common/UserAvatar';
import StudentImpersonateBar from '../components/student/modals/StudentImpersonateBar';

// Extracted Modals
import NoticeModal from '../components/student/NoticeModal';
import { BadgeModal } from '../components/student/BadgeComponents';
import ProfileSettingsModal from '../components/student/modals/ProfileSettingsModal';
import GuestbookWriteModal from '../components/student/modals/GuestbookWriteModal';
import GuestbookDetailModal from '../components/student/modals/GuestbookDetailModal';
import NotificationsModal from '../components/student/modals/NotificationsModal';
import ProgramHistoryModal from '../components/student/modals/ProgramHistoryModal';
import SignUpForm from '../components/auth/SignUpForm';
import QRModal from '../components/student/modals/QRModal';
import VerificationWriteModal from '../components/student/modals/VerificationWriteModal';
import { useFCM } from '../hooks/useFCM';
import ParticipantModal from '../components/admin/board/components/modals/ParticipantModal';
import StudentDashboardHeader from '../components/student/StudentDashboardHeader';
import StudentDashboardNav from '../components/student/StudentDashboardNav';

const StudentDashboard = () => {
    const hookData = useStudentDashboard();
    
    // 푸쉬 알림 권한 획득 및 토큰 저장 훅 실행
    useFCM(hookData.user);

    // Destructure everything used in the JSX
    const {
        loading, user, activeTab, setActiveTab,
        showProfileSettings, setShowProfileSettings,
        showGuestWrite, setShowGuestWrite,
        selectedGuestPost, setSelectedGuestPost,
        showProgramHistory, setShowProgramHistory,
        showEnlargedQr, setShowEnlargedQr,
        showNotificationsModal, setShowNotificationsModal,
        selectedBadge, setSelectedBadge,
        noticeContext, setNoticeContext, selectedNotice, setSelectedNotice,
        comments, newComment, setNewComment, handlePostComment, handleDeleteComment,
        handleShare, handleTabChange, openNoticeDetail, markNotificationsAsRead, handleLogout,
        notices, responses, responseDetails, handleResponse, fetchNotices, filteredNotices, filteredPrograms, allPrograms,
        homeNotices, homePrograms, studentRegion, locationGroups, activeUserCountByGroup,
        totalHours, visitCount, programCount, attendedProgramsList,
        badgeCategories, dynamicBadges, specialStats,
        adminSchedules, calendarCategories, dashboardConfig, tabConfig,
        notifications, unreadNotificationCount, updateProfile, profileLoadingState,
        guestPosts, uploadingGuest, handleCreatePost, fetchGuestCommentsData, handleGuestCommentSubmit, handleDeleteGuestPost, handleDeleteGuestComment
    } = hookData;

    const [showVerificationWrite, setShowVerificationWrite] = useState(false);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [editVerificationPost, setEditVerificationPost] = useState(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [showMenuDrawer, setShowMenuDrawer] = useState(false);
    const [hideMainHeader, setHideMainHeader] = useState(false);
    const [activeParticipantNotice, setActiveParticipantNotice] = useState(null);
    const [selectedStaffForChat, setSelectedStaffForChat] = useState(null);

    const navigate = useNavigate();
    const location = useLocation();
    const [checkinToastMsg, setCheckinToastMsg] = useState(null);
    const [showCheckinSurveyModal, setShowCheckinSurveyModal] = useState(false);
    const [checkinLocationName, setCheckinLocationName] = useState('');

    useEffect(() => {
        if (!user?.id) return;
        const storedToast = sessionStorage.getItem('checkin_toast');
        const isFromToastOnly = location.state?.checkinToastOnly;
        const isForceRequireSurvey = location.state?.requireCheckinSurvey || sessionStorage.getItem('require_checkin_survey') === 'true';

        // Survey modal is strictly for QR Check-in flow! Normal web logins do not trigger survey modal.
        if (!isForceRequireSurvey) {
            return;
        }

        const checkTodayCheckin = async () => {
            const now = new Date();
            const kstDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 60 * 60 * 1000));
            const y = kstDate.getFullYear();
            const m = String(kstDate.getMonth() + 1).padStart(2, '0');
            const d = String(kstDate.getDate()).padStart(2, '0');
            const todayKst = `${y}-${m}-${d}`;
            const startOfTodayIso = `${todayKst}T00:00:00+09:00`;

            try {
                const { data: todayLogs } = await supabase
                    .from('logs')
                    .select('id, created_at')
                    .eq('user_id', user.id)
                    .eq('type', 'CHECKIN')
                    .gte('created_at', startOfTodayIso)
                    .order('created_at', { ascending: false })
                    .limit(1);

                const latestCheckinTime = todayLogs?.[0]?.created_at || sessionStorage.getItem('active_checkin_time');

                const userName = location.state?.userName || user?.name || '';
                const locName = location.state?.locationName || '하이픈';
                setCheckinLocationName(locName);

                const isDismissed = latestCheckinTime ? sessionStorage.getItem(`survey_dismissed_${latestCheckinTime}`) : null;
                if (!isDismissed) {
                    sessionStorage.removeItem('checkin_toast');
                    setShowCheckinSurveyModal(true);
                } else if (storedToast || isFromToastOnly) {
                    sessionStorage.removeItem('checkin_toast');
                    setCheckinToastMsg({
                        title: `${userName ? userName + '님, ' : ''}${locName} 체크인 완료!`,
                        sub: '오늘 하루도 SCI 센터에서 즐거운 시간 보내세요 ✨'
                    });
                    setTimeout(() => setCheckinToastMsg(null), 6000);
                }
            } catch (err) {
                console.error('Failed to verify today checkin survey status:', err);
            }
        };

        checkTodayCheckin();
    }, [location.state, user?.id, user?.name]);

    const [incomingRequest, setIncomingRequest] = useState(null);
    const [rejectionPromptOpen, setRejectionPromptOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [statusAlert, setStatusAlert] = useState(null);
    const [pendingCount, setPendingCount] = useState(0);
    const [studentChatStatus, setStudentChatStatus] = useState(null);
    const [activeChat, setActiveChat] = useState(null);
    const [dismissedRejectedChatId, setDismissedRejectedChatId] = useState(() => {
        return localStorage.getItem('dismissed_rejected_chat_id') || '';
    });

    const handleDismissRejection = (chatId) => {
        localStorage.setItem('dismissed_rejected_chat_id', chatId);
        setDismissedRejectedChatId(chatId);
    };

    const fetchCoffeeChatStats = async () => {
        if (!user?.id) return;
        const isStaff = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'staff' || user?.user_group?.toLowerCase() === 'staff' || user?.user_group === '관리자';
        try {
            if (isStaff) {
                // Pending Count
                const { count } = await supabase
                    .from('coffee_chats')
                    .select('*', { count: 'exact', head: true })
                    .eq('staff_id', user.id)
                    .eq('status', 'PENDING');
                setPendingCount(count || 0);

                // Active Chat within 30 minutes
                const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
                const { data: activeChats } = await supabase
                    .from('coffee_chats')
                    .select('*')
                    .eq('staff_id', user.id)
                    .eq('status', 'ACCEPTED')
                    .gt('accepted_at', thirtyMinutesAgo)
                    .order('accepted_at', { ascending: false })
                    .limit(1);
                if (activeChats && activeChats.length > 0) {
                    const chat = activeChats[0];
                    const { data: studentUser } = await supabase
                        .from('users')
                        .select('name, user_group')
                        .eq('id', chat.student_id)
                        .single();
                    setActiveChat({
                        ...chat,
                        users: { 
                            name: studentUser?.name || '학생',
                            user_group: studentUser?.user_group 
                        }
                    });
                } else {
                    setActiveChat(null);
                }
            }
            const { data, error } = await supabase
                .from('coffee_chats')
                .select('*')
                .eq('student_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1);
            if (!error && data && data.length > 0) {
                const chat = data[0];
                const { data: staffUser } = await supabase
                    .from('users')
                    .select('name, user_group')
                    .eq('id', chat.staff_id)
                    .single();
                setStudentChatStatus({
                    ...chat,
                    users: { 
                        name: staffUser?.name || '선생님',
                        user_group: staffUser?.user_group
                    }
                });
            } else {
                setStudentChatStatus(null);
            }
        } catch (e) {
            console.error('Failed to fetch coffee chat stats:', e);
        }
    };

    const handleEndChatEarly = async (chatId) => {
        try {
            const clearTime = new Date(Date.now() - 30 * 60 * 1000 - 1000).toISOString();
            const { error } = await supabase
                .from('coffee_chats')
                .update({ accepted_at: clearTime })
                .eq('id', chatId);
            if (error) throw error;
            alert('커피챗이 종료되었습니다. 이제 대화 가능 상태로 복귀합니다! ☕');
            fetchCoffeeChatStats();
        } catch (e) {
            alert('종료 처리 실패: ' + e.message);
        }
    };

    const handleExtendChat = async (chatId) => {
        try {
            const extendTime = new Date().toISOString();
            const { error } = await supabase
                .from('coffee_chats')
                .update({ accepted_at: extendTime })
                .eq('id', chatId);
            if (error) throw error;
            alert('커피챗 시간이 지금부터 30분 연장되었습니다! ⏰');
            fetchCoffeeChatStats();
        } catch (e) {
            alert('연장 처리 실패: ' + e.message);
        }
    };

    const handleIncomingRequest = async (chat) => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('name')
                .eq('id', chat.student_id)
                .single();
            if (!error && data) {
                setIncomingRequest({ ...chat, student_name: data.name });
            } else {
                setIncomingRequest({ ...chat, student_name: '학생' });
            }
        } catch (e) {
            setIncomingRequest({ ...chat, student_name: '학생' });
        }
        fetchCoffeeChatStats();
    };

    const handleStatusChanged = async (chat) => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('name')
                .eq('id', chat.staff_id)
                .single();
            if (!error && data) {
                setStatusAlert({ ...chat, staff_name: data.name });
            } else {
                setStatusAlert({ ...chat, staff_name: '선생님' });
            }
        } catch (e) {
            setStatusAlert({ ...chat, staff_name: '선생님' });
        }
        fetchCoffeeChatStats();
    };

    const handleAcceptRequest = async (chatId) => {
        try {
            const { error } = await supabase
                .from('coffee_chats')
                .update({ 
                    status: 'ACCEPTED',
                    accepted_at: new Date().toISOString()
                })
                .eq('id', chatId);
            if (error) throw error;
            alert('커피챗 신청을 수락했습니다! 30분간 대화 상태로 잠금 처리됩니다. ☕');
            setIncomingRequest(null);
            fetchCoffeeChatStats();
        } catch (e) {
            alert('수락 처리 실패: ' + e.message);
        }
    };

    const handleRejectRequestSubmit = async () => {
        if (!rejectionReason.trim()) {
            alert('거절 사유를 입력해주세요.');
            return;
        }
        try {
            const { error } = await supabase
                .from('coffee_chats')
                .update({ 
                    status: 'REJECTED',
                    rejection_reason: rejectionReason.trim()
                })
                .eq('id', incomingRequest.id);
            if (error) throw error;
            alert('커피챗 신청을 거절했습니다.');
            setIncomingRequest(null);
            setRejectionPromptOpen(false);
            setRejectionReason('');
            fetchCoffeeChatStats();
        } catch (e) {
            alert('거절 처리 실패: ' + e.message);
        }
    };

    const triggerPendingModal = async () => {
        if (!user?.id) return;
        try {
            const { data, error } = await supabase
                .from('coffee_chats')
                .select('*')
                .eq('staff_id', user.id)
                .eq('status', 'PENDING')
                .order('created_at', { ascending: false })
                .limit(1);
            if (!error && data && data.length > 0) {
                handleIncomingRequest(data[0]);
            } else {
                alert('대기 중인 커피챗 신청이 없습니다.');
            }
        } catch (e) {
            console.error('Failed to trigger pending modal:', e);
        }
    };

    useCoffeeChatRealtime(user, handleIncomingRequest, handleStatusChanged);

    useEffect(() => {
        if (!user?.id) return;
        
        fetchCoffeeChatStats();

        const isStaff = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'staff' || user?.user_group?.toLowerCase() === 'staff' || user?.user_group === '관리자';
        if (isStaff) {
            const fetchPendingRequestsOnLoad = async () => {
                try {
                    const { data, error } = await supabase
                        .from('coffee_chats')
                        .select('*')
                        .eq('staff_id', user.id)
                        .eq('status', 'PENDING')
                        .order('created_at', { ascending: false })
                        .limit(1);
                    if (!error && data && data.length > 0) {
                        handleIncomingRequest(data[0]);
                    }
                } catch (e) {
                    console.error('Failed to fetch pending requests on load:', e);
                }
            };
            fetchPendingRequestsOnLoad();
        }
    }, [user]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (incomingRequest) {
                    setIncomingRequest(null);
                }
                if (statusAlert) {
                    setStatusAlert(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [incomingRequest, statusAlert]);

    // B안: 뒤로가기 시 이전 탭으로 화면 전환을 위해 History API 연동 (학생용)
    useEffect(() => {
        // 첫 진입 시 현재 상태를 히스토리에 기재
        window.history.replaceState({ tab: activeTab }, '');

        const handlePopState = (event) => {
            if (event.state && event.state.tab) {
                handleTabChange(event.state.tab);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // activeTab이 변경될 때마다 새로운 히스토리 항목 추가 (동일한 탭 연속 중복 추가 방지)
    useEffect(() => {
        if (window.history.state?.tab !== activeTab) {
            window.history.pushState({ tab: activeTab }, '');
        }
    }, [activeTab]);

    useEffect(() => {
        setHideMainHeader(false);
    }, [activeTab]);

    // 탭 트랜지션 및 스와이프 내비게이션 핸들러
    const [direction, setDirection] = useState(0);
    const [touchStartX, setTouchStartX] = useState(null);
    const [touchEndX, setTouchEndX] = useState(null);
    const [touchStartY, setTouchStartY] = useState(null);
    const [touchEndY, setTouchEndY] = useState(null);

    const activeVisibleTabs = (tabConfig || []).filter(t => t.isVisible);
    const TAB_SEQUENCE = activeVisibleTabs.length > 0 
        ? activeVisibleTabs.map(t => t.id)
        : [TAB_NAMES.HOME, TAB_NAMES.BADGES, TAB_NAMES.PROGRAMS, TAB_NAMES.CALENDAR, TAB_NAMES.AZIT, TAB_NAMES.HAIFN];

    const tabIconMap = {
        [TAB_NAMES.HOME]: { icon: Home, defaultLabel: '홈' },
        [TAB_NAMES.BADGES]: { icon: Award, defaultLabel: '뱃지' },
        [TAB_NAMES.PROGRAMS]: { icon: BookOpen, defaultLabel: '센터', activeColor: 'text-blue-600' },
        [TAB_NAMES.CALENDAR]: { icon: Calendar, defaultLabel: '캘린더' },
        [TAB_NAMES.AZIT]: { icon: MessageSquareHeart, defaultLabel: '커뮤니티' },
        [TAB_NAMES.HAIFN]: { icon: Store, defaultLabel: '하이픈' }
    };
    const visibleTabs = (tabConfig || [])
        .filter(t => t.isVisible)
        .map(t => {
            const mapItem = tabIconMap[t.id];
            if (!mapItem) return null;
            return {
                id: t.id,
                icon: mapItem.icon,
                label: t.label || mapItem.defaultLabel,
                activeColor: mapItem.activeColor
            };
        })
        .filter(Boolean);

    const defaultTabsList = [
        { id: TAB_NAMES.HOME, icon: Home, label: '홈' },
        { id: TAB_NAMES.BADGES, icon: Award, label: '뱃지' },
        { id: TAB_NAMES.PROGRAMS, icon: BookOpen, label: '센터', activeColor: 'text-blue-600' },
        { id: TAB_NAMES.CALENDAR, icon: Calendar, label: '캘린더' },
        { id: TAB_NAMES.AZIT, icon: MessageSquareHeart, label: '커뮤니티' },
        { id: TAB_NAMES.HAIFN, icon: Store, label: '하이픈' }
    ];

    const navigationTabs = visibleTabs.length > 0 ? visibleTabs : defaultTabsList;

    const handleTabNavigation = (newTab) => {
        if (newTab === activeTab) return;
        const currentIndex = TAB_SEQUENCE.indexOf(activeTab);
        const newIndex = TAB_SEQUENCE.indexOf(newTab);
        
        let dir = newIndex > currentIndex ? 1 : -1;
        // 배열에 없는 탭(예: 공지사항 등)에서 이동할 땐 기본 우측 슬라이드
        if (currentIndex === -1 || newIndex === -1) dir = 1;
        
        setDirection(dir);
        handleTabChange(newTab);
    };

    const tabVariants = {
        enter: (direction) => ({
            x: direction > 0 ? '20%' : '-20%',
            opacity: 0,
        }),
        center: {
            x: 0,
            opacity: 1,
        },
        exit: (direction) => ({
            x: direction < 0 ? '20%' : '-20%',
            opacity: 0,
        })
    };

    const onTouchStart = (e) => {
        // 좌우 스크롤 객체나 입력창, 이모지 피커 등을 터치한 경우 스와이프 무시
        if (e.target.closest('.no-swipe, .overflow-x-auto, .overflow-x-scroll, .em-emoji-picker, textarea, input, button')) return;
        setTouchEndX(null);
        setTouchEndY(null);
        setTouchStartX(e.targetTouches[0].clientX);
        setTouchStartY(e.targetTouches[0].clientY);
    };

    const onTouchMove = (e) => {
        setTouchEndX(e.targetTouches[0].clientX);
        setTouchEndY(e.targetTouches[0].clientY);
    };

    const onTouchEnd = () => {
        if (!touchStartX || !touchEndX || !touchStartY || !touchEndY) return;

        const distanceX = touchStartX - touchEndX;
        const distanceY = touchStartY - touchEndY;
        
        // 민감도 조절: X축 거리가 70px 이상일 때 스와이프로 인정
        const minSwipeDistance = 70;

        // Y축 스크롤(세로)보다 X축 스와이프(가로)가 더 크면서, 최소 거리 조건을 만족할 때
        if (Math.abs(distanceX) > Math.abs(distanceY) && Math.abs(distanceX) > minSwipeDistance) {
            const isLeftSwipe = distanceX > minSwipeDistance;
            
            const currentIndex = TAB_SEQUENCE.indexOf(activeTab);
            if (currentIndex === -1) return;

            // 좌측 스와이프(손가락을 왼쪽으로 밈) -> 오른쪽 탭으로 이동
            if (isLeftSwipe && currentIndex < TAB_SEQUENCE.length - 1) {
                handleTabNavigation(TAB_SEQUENCE[currentIndex + 1]);
            } 
            // 우측 스와이프(손가락을 오른쪽으로 밈) -> 왼쪽 탭으로 이동
            else if (!isLeftSwipe && currentIndex > 0) {
                handleTabNavigation(TAB_SEQUENCE[currentIndex - 1]);
            }
        }
        
        setTouchStartX(null);
        setTouchEndX(null);
        setTouchStartY(null);
        setTouchEndY(null);
    };

    // 탭 변경 시 화면 스크롤을 최상단으로 이동
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [activeTab]);

    const openGuestPostDetail = async (post) => {
        hookData.setSelectedGuestPost(post);
        const data = await hookData.fetchGuestCommentsData(post.id);
        hookData.setGuestComments(data);
    };

    const handleDeletePostWrapper = async (postId) => {
        if (!window.confirm("정말로 삭제하시겠습니까? 지급된 하이픈도 반환됩니다.")) return;
        const success = await hookData.handleDeleteGuestPost(postId);
        if (success) {
            hookData.setSelectedGuestPost(null);
            userApi.fetchUser(user.id).then(u => {
                if (u) hookData.setUser(prev => ({ ...prev, ...u }));
            });
            setRefreshTrigger(prev => prev + 1);
        }
    };

    if (loading || !user) {
        return (
            <div className="w-full md:max-w-lg mx-auto min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-600 font-bold text-sm tracking-tight animate-pulse">대시보드 정보를 불러오는 중입니다...</p>
                </div>
            </div>
        );
    }

    const effectiveRegion = user?.role === 'admin'
        ? (hookData.selectedRegion === 'GANGDONG' ? '강동' : hookData.selectedRegion === 'GANGSEO' ? '강서' : null)
        : studentRegion;

    return (
        <div 
            className="w-full md:max-w-lg mx-auto min-h-screen bg-tossGrey50 pb-20 font-sans transition-all duration-300 pt-[max(env(safe-area-inset-top),0px)]"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            <AnimatePresence>
                {checkinToastMsg && !showCheckinSurveyModal && (
                    <motion.div
                        initial={{ y: -20, opacity: 0, scale: 0.95 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -20, opacity: 0, scale: 0.95 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="fixed left-4 right-4 z-[350] max-w-md mx-auto bg-[#191F28]/95 backdrop-blur-md border border-gray-700/50 shadow-2xl rounded-2xl p-4 flex items-center justify-between gap-3 text-white transition-all duration-300 bottom-20"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 text-xl font-bold">
                                🎉
                            </div>
                            <div className="space-y-0.5">
                                <div className="text-sm font-extrabold text-white tracking-tight">
                                    {checkinToastMsg.title}
                                </div>
                                <div className="text-xs font-medium text-gray-300">
                                    {checkinToastMsg.sub}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setCheckinToastMsg(null)}
                            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                        >
                            <X size={15} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Checkin Survey Modal */}
            <StudentCheckinSurveyModal
                isOpen={showCheckinSurveyModal}
                user={user}
                locationName={checkinLocationName}
                onClose={(didComplete) => {
                    setShowCheckinSurveyModal(false);
                    const now = new Date();
                    const kstDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 60 * 60 * 1000));
                    const y = kstDate.getFullYear();
                    const m = String(kstDate.getMonth() + 1).padStart(2, '0');
                    const d = String(kstDate.getDate()).padStart(2, '0');
                    const todayKst = `${y}-${m}-${d}`;
                    sessionStorage.setItem(`survey_dismissed_${todayKst}`, 'true');

                    setCheckinToastMsg({
                        title: `${user?.name ? user.name + '님, ' : ''}${checkinLocationName || '하이픈'} 체크인 완료!`,
                        sub: '오늘 하루도 SCI 센터에서 즐거운 시간 보내세요 ✨'
                    });
                    if (didComplete) {
                        try {
                            confetti({
                                particleCount: 120,
                                spread: 70,
                                origin: { y: 0.3 }
                            });
                        } catch (e) {}
                    }
                    setTimeout(() => {
                        setCheckinToastMsg(null);
                    }, 6000);
                }}
            />

            {/* 마스터 스태프 전용 학생 시점 미리보기 바 */}
            <StudentImpersonateBar
                user={hookData.realUser || user}
                impersonatedUser={hookData.impersonatedUser}
                onSelectStudent={(st) => hookData.setImpersonatedUser(st)}
                onReset={() => hookData.setImpersonatedUser(null)}
            />
            
            {/* Verification Write Modal */}
            {showVerificationWrite && (
                <VerificationWriteModal
                    setShowVerificationWrite={setShowVerificationWrite}
                    handleCreatePost={hookData.handleCreatePost}
                    handleUpdatePost={hookData.handleUpdatePost}
                    uploadingGuest={hookData.uploadingGuest}
                    editPost={editVerificationPost}
                    onSuccess={() => {
                        setEditVerificationPost(null);
                        setShowVerificationWrite(false);
                        userApi.fetchUser(user.id).then(u => {
                            if (u) hookData.setUser(prev => ({ ...prev, ...u }));
                        });
                        setRefreshTrigger(prev => prev + 1);
                    }}
                />
            )}

            {/* Modals & Overlays */}
            <AnimatePresence>
                {selectedNotice && (
                    <NoticeModal
                        key={selectedNotice.id}
                        notice={selectedNotice}
                        context={noticeContext}
                        onClose={() => { setSelectedNotice(null); setNoticeContext(null); }}
                        isImpersonating={Boolean(hookData.impersonatedUser)}
                        user={hookData.effectiveUser || hookData.impersonatedUser || user}
                        responses={responses}
                        responseDetails={responseDetails}
                        onResponse={handleResponse}
                        onRefresh={fetchNotices}
                        onRegisterRegularUser={() => setShowRegisterModal(true)}
                        comments={comments}
                        newComment={newComment}
                        setNewComment={setNewComment}
                        onPostComment={handlePostComment}
                        onDeleteComment={handleDeleteComment}
                        onUpdate={async (updatedNotice, isAlreadySaved = false) => {
                            try {
                                if (!isAlreadySaved) {
                                    await noticesApi.update(updatedNotice.id, updatedNotice);
                                    alert('성공적으로 수정되었습니다.');
                                }
                                fetchNotices();
                                setSelectedNotice(prev => prev ? { ...prev, ...updatedNotice } : null);
                            } catch (e) {
                                console.error('StudentDashboard onUpdate error:', e);
                                alert('수정 중 오류가 발생했습니다: ' + (e.message || e));
                            }
                        }}
                        onDelete={async (noticeId) => {
                            if (window.confirm('정말로 이 게시물을 삭제하시겠습니까?')) {
                                try {
                                    await noticesApi.delete(noticeId);
                                    alert('성공적으로 삭제되었습니다.');
                                    fetchNotices();
                                    setSelectedNotice(null);
                                } catch (e) {
                                    console.error(e);
                                    alert('삭제 중 오류가 발생했습니다.');
                                }
                            }
                        }}
                        onViewParticipants={setActiveParticipantNotice}
                    />
                )}

                {activeParticipantNotice && (
                    <ParticipantModal
                        notice={activeParticipantNotice}
                        onClose={() => setActiveParticipantNotice(null)}
                        onRefresh={() => {
                            fetchNotices();
                            if (selectedNotice && selectedNotice.id === activeParticipantNotice.id) {
                                noticesApi.fetchAll().then(data => {
                                    const latest = data?.find(n => n.id === selectedNotice.id);
                                    if (latest) {
                                        const countsMap = noticesApi.fetchAllJoinCounts().then(counts => {
                                            setSelectedNotice({
                                                ...latest,
                                                current_applicants: counts[latest.id] || 0
                                            });
                                        });
                                    }
                                });
                            }
                        }}
                    />
                )}

                {selectedBadge && (
                    <BadgeModal
                        badge={selectedBadge}
                        stats={{ visitCount, programCount, specialStats }}
                        onClose={() => setSelectedBadge(null)}
                    />
                )}

                {showProfileSettings && (
                    <ProfileSettingsModal 
                        user={user}
                        setShowProfileSettings={setShowProfileSettings}
                        updateProfile={updateProfile}
                        withdrawMembership={hookData.withdrawMembership}
                        profileLoadingState={profileLoadingState}
                    />
                )}

                {showRegisterModal && (
                    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <div 
                            onClick={() => setShowRegisterModal(false)}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        />
                        
                        {/* Modal Panel */}
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 z-10 shadow-toss-elevated flex flex-col gap-4 relative"
                        >
                            <button
                                onClick={() => setShowRegisterModal(false)}
                                className="absolute right-4 top-4 p-2 text-tossGrey500 hover:text-tossGrey800 hover:bg-tossGrey100 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                            
                            <div className="text-left mb-2">
                                <h3 className="text-[18px] font-black text-tossGrey900 leading-tight">하이픈 정식 회원 가입</h3>
                                <p className="text-xs text-tossGrey500 font-semibold mt-1">나머지 정보를 입력해 하이픈 등록을 완료해 주세요.</p>
                            </div>
                            
                            <SignUpForm 
                                onSuccess={() => {
                                    setShowRegisterModal(false);
                                    localStorage.removeItem('user');
                                    supabase.auth.signOut().then(() => {
                                        alert('하이픈 정식 등록이 완료되었습니다!\n방금 가입하신 정보로 다시 로그인해 주세요.');
                                        window.location.href = '/';
                                    });
                                }}
                                onCancel={() => setShowRegisterModal(false)}
                                guestUserId={user.id}
                                prefilledData={{
                                    name: user.name.replace('(guest)', ''),
                                    school: user.school
                                }}
                            />
                        </motion.div>
                    </div>
                )}

                {showGuestWrite && (
                    <GuestbookWriteModal 
                        setShowGuestWrite={setShowGuestWrite}
                        handleCreatePost={handleCreatePost}
                        uploadingGuest={uploadingGuest}
                    />
                )}

                {selectedGuestPost && (
                    <GuestbookDetailModal 
                        selectedGuestPost={hookData.selectedGuestPost}
                        guestComments={hookData.guestComments || []}
                        fetchGuestCommentsData={hookData.fetchGuestCommentsData}
                        user={user}
                        onDeleteGuestPost={handleDeletePostWrapper}
                        onDeleteGuestComment={hookData.handleDeleteGuestComment}
                        handleGuestCommentSubmit={hookData.handleGuestCommentSubmit}
                        setGuestComments={hookData.setGuestComments} 
                        setSelectedGuestPost={hookData.setSelectedGuestPost}
                        onEditPost={(post) => {
                            hookData.setSelectedGuestPost(null);
                            setEditVerificationPost(post);
                            setShowVerificationWrite(true);
                        }}
                    />
                )}

                {showEnlargedQr && (
                    <QRModal 
                        user={user} 
                        setShowEnlargedQr={setShowEnlargedQr} 
                    />
                )}

                {showNotificationsModal && (
                    <NotificationsModal 
                        notifications={notifications}
                        setShowNotificationsModal={setShowNotificationsModal}
                        markNotificationsAsRead={markNotificationsAsRead}
                    />
                )}

                {showProgramHistory && (
                    <ProgramHistoryModal 
                        attendedProgramsList={attendedProgramsList}
                        setShowProgramHistory={setShowProgramHistory}
                    />
                )}

                {selectedStaffForChat && (
                    <CoffeeChatModal
                        staff={selectedStaffForChat.id === user.id ? { ...selectedStaffForChat, ...user } : selectedStaffForChat}
                        student={user}
                        onClose={() => setSelectedStaffForChat(null)}
                        onSuccess={() => setSelectedStaffForChat(null)}
                    />
                )}

                {incomingRequest && (
                    <div 
                        className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
                        onClick={() => setIncomingRequest(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-5 text-center relative border border-tossGrey100"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Close Button Float */}
                            <button
                                onClick={() => setIncomingRequest(null)}
                                className="absolute top-4 right-4 p-1.5 bg-tossGrey100 hover:bg-tossGrey200 rounded-full text-tossGrey500 transition-colors z-20"
                            >
                                <X size={14} className="stroke-[3]" />
                            </button>

                            <div className="mx-auto w-12 h-12 bg-tossBlue/10 text-tossBlue rounded-full flex items-center justify-center text-xl font-bold">
                                ☕
                            </div>
                            <div className="space-y-1.5">
                                <h4 className="text-lg font-bold text-tossGrey900">새 커피챗 신청이 왔어요!</h4>
                                <p className="text-sm font-semibold text-tossGrey500">
                                    <strong className="text-tossGrey900 font-extrabold">{incomingRequest.student_name}</strong> 학생이 커피챗을 신청했습니다.
                                </p>
                            </div>
                            
                            <div className="bg-tossGrey50 rounded-2xl p-4 text-left text-xs font-semibold text-tossGrey600 space-y-2">
                                <div>
                                    <span className="text-tossGrey400 font-bold block mb-0.5">대화 주제</span>
                                    <span className="text-tossGrey800 font-extrabold text-[13px]">{incomingRequest.topics?.join(', ')}</span>
                                </div>
                                {incomingRequest.message && (
                                    <div className="border-t border-tossGrey200/60 pt-2">
                                        <span className="text-tossGrey400 font-bold block mb-0.5">하고 싶은 말</span>
                                        <span className="text-tossGrey800 font-bold">"{incomingRequest.message}"</span>
                                    </div>
                                )}
                            </div>

                            {!rejectionPromptOpen ? (
                                <div className="flex gap-2.5">
                                    <button
                                        onClick={() => setRejectionPromptOpen(true)}
                                        className="flex-1 py-3 bg-tossGrey100 hover:bg-tossGrey200 text-tossGrey600 rounded-xl font-bold text-sm transition-all"
                                    >
                                        거절하기
                                    </button>
                                    <button
                                        onClick={() => handleAcceptRequest(incomingRequest.id)}
                                        className="flex-1 py-3 bg-tossBlue text-white rounded-xl font-bold text-sm transition-all hover:bg-tossBlue/90 shadow-sm"
                                    >
                                        수락하기
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3 pt-1 text-left">
                                    <label className="text-xs font-bold text-tossGrey500 ml-1">거절 사유 입력</label>
                                    <input
                                        type="text"
                                        placeholder="사유를 입력해 주세요 (예: 지금 상담 중이야)"
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        className="w-full p-3 bg-tossGrey50 border border-tossGrey200 rounded-xl outline-none focus:border-tossBlue text-sm font-semibold text-tossGrey900"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setRejectionPromptOpen(false);
                                                setRejectionReason('');
                                            }}
                                            className="flex-1 py-3 bg-tossGrey100 text-tossGrey500 rounded-xl font-bold text-xs"
                                        >
                                            취소
                                        </button>
                                        <button
                                            onClick={handleRejectRequestSubmit}
                                            className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold text-xs hover:bg-red-600"
                                        >
                                            거절 전송
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}

                {statusAlert && (
                    <div 
                        className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
                        onClick={() => setStatusAlert(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center space-y-4 border border-tossGrey100"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center text-2xl">
                                {statusAlert.status === 'ACCEPTED' ? '🎉' : '✉️'}
                            </div>
                            <div className="space-y-1.5">
                                <h4 className="text-lg font-bold text-tossGrey900">
                                    {statusAlert.status === 'ACCEPTED' ? '커피챗 신청이 수락되었어요!' : '커피챗 신청 결과 안내'}
                                </h4>
                                <p className="text-sm font-semibold text-tossGrey600 leading-relaxed">
                                    {statusAlert.status === 'ACCEPTED' ? (
                                        <>
                                            <strong className="text-tossGrey900 font-extrabold">{statusAlert.staff_name} 쌤</strong>이 대화를 수락하셨습니다.<br />지금 쌤이 계신 곳으로 가보세요!
                                        </>
                                    ) : (
                                        <>
                                            아쉽게도 <strong className="text-tossGrey900 font-extrabold">{statusAlert.staff_name} 쌤</strong>이 지금은 대화가 어렵다고 하십니다.<br />
                                            {statusAlert.rejection_reason && (
                                                <span className="block mt-2.5 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold text-left border border-red-100">
                                                    💬 거절 사유: "{statusAlert.rejection_reason}"
                                                </span>
                                            )}
                                        </>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={() => setStatusAlert(null)}
                                className="w-full py-3 bg-tossBlue text-white rounded-xl font-bold text-sm transition-all"
                            >
                                확인
                            </button>
                        </motion.div>
                    </div>
                )}

                {showMenuDrawer && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            key="menu-drawer-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowMenuDrawer(false)}
                            className="fixed inset-0 bg-black/40 z-[200] backdrop-blur-[2px]"
                        />

                        {/* Drawer Panel */}
                        <motion.div
                            key="menu-drawer-panel"
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'tween', duration: 0.25, ease: 'easeInOut' }}
                            className="fixed top-0 bottom-0 left-0 md:left-[calc(50vw-256px)] w-64 bg-white z-[210] shadow-toss-elevated flex flex-col pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),16px)] border-r border-tossGrey200"
                        >
                            {/* Drawer Header */}
                            <div className="p-4 border-b border-tossGrey100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-tossBlueLight flex items-center justify-center text-tossBlue">
                                        <Home size={16} />
                                    </div>
                                    <span className="font-bold text-tossBlue tracking-tight text-sm select-none">SCI CENTER</span>
                                </div>
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => setShowMenuDrawer(false)}
                                    className="p-1.5 text-tossGrey500 hover:text-tossGrey800 hover:bg-tossGrey100 rounded-lg transition-colors"
                                >
                                    <X size={20} />
                                </motion.button>
                            </div>

                            {/* Mini Profile */}
                            <div className="p-5 bg-tossGrey50 border-b border-tossGrey100 flex items-center gap-3">
                                <div className="shrink-0 ring-2 ring-white shadow-toss-subtle rounded-full">
                                    <UserAvatar user={user} size="w-12 h-12" textSize="text-md" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] text-tossGrey500 font-bold tracking-wider uppercase mb-0.5">{user?.school || 'WELCOME'}</p>
                                    <h3 className="font-bold text-tossGrey900 text-sm flex items-center gap-1">
                                        {user?.name?.replace('(guest)', '')} 님
                                        {user?.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                    </h3>
                                </div>
                            </div>

                            {/* Menu Body */}
                            <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                                <p className="px-4 py-1 text-[10px] text-tossGrey500 font-bold tracking-wider uppercase">바로가기</p>
                                
                                {navigationTabs.map((tab) => {
                                    const IconComponent = tab.icon;
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={`drawer-tab-${tab.id}`}
                                            onClick={() => {
                                                handleTabNavigation(tab.id);
                                                setShowMenuDrawer(false);
                                            }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-toss-lg text-left font-bold text-sm transition-all ${
                                                isActive
                                                    ? 'bg-tossBlueLight text-tossBlue'
                                                    : 'text-tossGrey700 hover:bg-tossGrey100'
                                            }`}
                                        >
                                            <IconComponent size={18} className={isActive ? 'text-tossBlue' : 'text-tossGrey500'} />
                                            <span>{tab.label}</span>
                                        </button>
                                    );
                                })}

                                {user?.user_group === '게스트' && (
                                    <button
                                        onClick={() => {
                                            setShowMenuDrawer(false);
                                            setShowRegisterModal(true);
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-toss-lg text-left font-bold text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100/60 border border-indigo-100/50 transition-all mt-1"
                                    >
                                        <Sparkles size={18} className="text-indigo-600 animate-pulse" />
                                        <span>하이픈 정식 등록</span>
                                    </button>
                                )}

                                <div className="h-px bg-tossGrey100 my-2" />
                                <p className="px-4 py-1 text-[10px] text-tossGrey500 font-bold tracking-wider uppercase">사용자 설정</p>

                                <button
                                    onClick={() => {
                                        setShowProfileSettings(true);
                                        setShowMenuDrawer(false);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-toss-lg text-left font-bold text-sm text-tossGrey700 hover:bg-tossGrey100 transition-all"
                                >
                                    <Settings size={18} className="text-tossGrey500" />
                                    <span>설정</span>
                                </button>

                                {user?.role === 'admin' && (
                                    <button
                                        onClick={() => {
                                            navigate('/admin');
                                            setShowMenuDrawer(false);
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-toss-lg text-left font-bold text-sm text-tossBlue hover:bg-tossBlueLight transition-all"
                                    >
                                        <ShieldCheck size={18} className="text-tossBlue" />
                                        <span>관리자 페이지</span>
                                    </button>
                                )}
                            </div>

                            {/* Menu Footer */}
                            <div className="p-4 border-t border-tossGrey100">
                                <button
                                    onClick={() => {
                                        setShowMenuDrawer(false);
                                        handleLogout();
                                    }}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 border border-tossError/20 text-tossError rounded-toss-lg font-bold text-sm hover:bg-tossError/5 transition-colors"
                                >
                                    <LogOut size={16} />
                                    <span>로그아웃</span>
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                    key={activeTab}
                    custom={direction}
                    variants={tabVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                        x: { type: "tween", duration: 0.25, ease: "easeOut" },
                        opacity: { duration: 0.2 }
                    }}
                    className="w-full"
                >
                    {activeTab === TAB_NAMES.HOME && (
                <StudentHomeTab
                    user={user}
                    unreadNotificationCount={unreadNotificationCount}
                    setShowProfileSettings={setShowProfileSettings}
                    setShowNotificationsModal={setShowNotificationsModal}
                    handleShare={handleShare}
                    setShowEnlargedQr={setShowEnlargedQr}
                    navigate={navigate}
                    adminSchedules={adminSchedules}
                    calendarCategories={calendarCategories}
                    dashboardConfig={dashboardConfig}
                    totalHours={totalHours}
                    visitCount={visitCount}
                    programCount={programCount}
                    setShowProgramHistory={setShowProgramHistory}
                    handleTabChange={handleTabChange}
                    handleLogout={handleLogout}
                    homePrograms={homePrograms}
                    responses={responses}
                    openNoticeDetail={openNoticeDetail}
                    homeNotices={homeNotices}
                    locationGroups={locationGroups}
                    activeUserCountByGroup={activeUserCountByGroup}
                    dynamicChallenges={dynamicBadges}
                    specialStats={specialStats}
                    studentRegion={effectiveRegion}
                    selectedRegion={hookData.selectedRegion}
                    setSelectedRegion={hookData.setSelectedRegion}
                    onStaffClick={(staff) => setSelectedStaffForChat(staff)}
                    onCheckPendingRequest={triggerPendingModal}
                    pendingCount={pendingCount}
                    studentChatStatus={studentChatStatus}
                    activeChat={activeChat}
                    onEndChat={handleEndChatEarly}
                    onExtendChat={handleExtendChat}
                    dismissedRejectedChatId={dismissedRejectedChatId}
                    onDismissRejection={handleDismissRejection}
                    onRegisterRegularUser={() => setShowRegisterModal(true)}
                />
            )}

            {activeTab === TAB_NAMES.BADGES && (
                <StudentBadgesTab
                    dynamicBadges={dynamicBadges}
                    badgeCategories={badgeCategories}
                    visitCount={visitCount}
                    programCount={programCount}
                    specialStats={specialStats}
                    setSelectedBadge={setSelectedBadge}
                />
            )}

            {activeTab === TAB_NAMES.PROGRAMS && (
                <StudentCenterTab
                    user={user}
                    filteredPrograms={filteredPrograms}
                    allPrograms={allPrograms}
                    responses={responses}
                    responseDetails={responseDetails}
                    openNoticeDetail={openNoticeDetail}
                    refreshTrigger={refreshTrigger}
                    setRefreshTrigger={setRefreshTrigger}
                    selectedRegion={hookData.selectedRegion}
                    studentRegion={effectiveRegion}
                />
            )}

            {activeTab === TAB_NAMES.NOTICES && (
                <StudentNoticesTab
                    filteredNotices={filteredNotices}
                    openNoticeDetail={openNoticeDetail}
                />
            )}

            {activeTab === TAB_NAMES.MESSAGES && (
                <StudentChat currentUser={user} onRefreshUnread={() => { }} onSubViewToggle={setHideMainHeader} />
            )}

            {activeTab === TAB_NAMES.GUESTBOOK && (
                <StudentGuestbookTab
                    guestPosts={guestPosts}
                    openGuestPostDetail={openGuestPostDetail}
                    setShowGuestWrite={setShowGuestWrite}
                />
            )}

            {activeTab === TAB_NAMES.CALENDAR && (
                <StudentCalendarTab
                    adminSchedules={adminSchedules}
                    notices={filteredPrograms}
                    calendarCategories={calendarCategories}
                    openNoticeDetail={openNoticeDetail}
                    studentRegion={effectiveRegion}
                    onStaffClick={(staff) => setSelectedStaffForChat(staff)}
                />
            )}

            {activeTab === TAB_NAMES.COMMUNITY && (
                <CommunityTab user={user} />
            )}

            {activeTab === TAB_NAMES.AZIT && (
                <StudentAzitTab user={user} />
            )}

            {activeTab === TAB_NAMES.HAIFN && (
                <StudentHaifnTab 
                    user={user} 
                    notifyParentRefresh={() => {
                        userApi.fetchUser(user.id).then(u => {
                            if (u) hookData.setUser(prev => ({ ...prev, ...u }));
                        });
                    }}
                    refreshTrigger={refreshTrigger}
                />
            )}
                </motion.div>
            </AnimatePresence>

            {/* Bottom Navigation */}
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-lg bg-white border-t border-tossGrey200 flex justify-around items-center px-4 py-3 z-[120] safe-area-bottom">
                {navigationTabs.map((tab) => (
                    <motion.button
                        key={tab.id}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleTabNavigation(tab.id)}
                        className={`flex flex-col items-center gap-1 p-2 transition-all duration-300 flex-1 relative btn-tactile ${activeTab === tab.id ? 'text-tossBlue' : 'text-tossGrey400'}`}
                    >
                        <tab.icon size={22} strokeWidth={activeTab === tab.id ? 2.2 : 1.8} />
                        <span className={`text-[11px] font-medium tracking-tight mt-1 ${activeTab === tab.id ? 'text-tossBlue' : 'text-tossGrey500'}`}>
                            {tab.label}
                        </span>
                        {activeTab === tab.id && (
                            <motion.div
                                layoutId="activeTabPill"
                                className="absolute -top-1 w-1.5 h-1.5 rounded-full bg-tossBlue"
                            />
                        )}
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

export default StudentDashboard;
