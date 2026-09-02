import React, { useEffect, useState } from 'react';
import { CATEGORIES, TAB_NAMES, RESPONSE_STATUS, BADGE_DEFINITIONS } from '../constants/appConstants';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient';
import { AlertCircle, MapPin, Clock, Info, LogOut, CheckCircle, XCircle, HelpCircle, MessageSquare, Send, X, ArrowLeft, Image as ImageIcon, Grid, Settings, User, Plus, Heart, ZoomIn, RotateCw, Home, FileText, MessageCircle, BookOpen, MoreHorizontal, Bookmark, Share2, ShieldCheck, Calendar, Edit2, Trash2, Save, Trash, ChevronRight, Pin, Award, Share, Bell, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Microlink from '@microlink/react';
import { motion, AnimatePresence } from 'framer-motion';
import SunEditor from 'suneditor-react';
import 'suneditor/dist/css/suneditor.min.css';
import Cropper from 'react-easy-crop';
import confetti from 'canvas-confetti';
import { getAccountAuthClient, isAccountAuthEnabled } from '../auth/accountAuthRuntime';














import { stripHtml, extractUrls } from '../utils/textUtils';
import { formatToLocalISO } from '../utils/dateUtils';
import { subscribeToPush } from '../utils/pushUtils';
import getCroppedImg from '../utils/imageUtils';
import { hashPassword } from '../utils/hashUtils';

import { useMessaging } from '../hooks/useMessaging';
import { useNotices } from '../hooks/useNotices';
import { getRecruitment } from '../utils/programRecruitment';
import { useGuestbook } from '../hooks/useGuestbook';
import { useProfile } from '../hooks/useProfile';
import { badgesApi } from '../api/badgesApi';
import { userApi } from '../api/userApi';

import { parseISO, isWithinInterval, startOfDay, eachDayOfInterval, isSameDay } from 'date-fns';
import { getBadgeProgress } from '../components/student/BadgeComponents';
import { useDashboardNotifications } from './dashboard/useDashboardNotifications';
import { useRealtimePresence } from './dashboard/useRealtimePresence';
import { useDashboardBadges } from './dashboard/useDashboardBadges';
import { useDashboardCalendar } from './dashboard/useDashboardCalendar';
import { resolveSchoolRegion } from '../utils/schoolRegionUtils';

export const useStudentDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState(TAB_NAMES.HOME);
    const [loading, setLoading] = useState(true);
    const [studentRegion, setStudentRegion] = useState(null);

    // Real-time Status State (Hook)
    const { locationGroups, locations, allUsers, activeUserCountByGroup, fetchRealtimeStatusData } = useRealtimePresence();

    // Hooks
    const { user, setUser, totalHours, visitCount, programCount, fetchStats, updateProfile, withdrawMembership, loading: profileLoadingState } = useProfile(null);
    
    // Master Preview / Impersonation State
    const [impersonatedUser, setImpersonatedUser] = useState(null);
    const effectiveUser = impersonatedUser || user;

    const { notices, responses, responseDetails, fetchNotices, handleResponse } = useNotices(effectiveUser?.id);
    const { messages, unreadCount, markAsRead } = useMessaging(effectiveUser?.id);
    const { guestPosts, uploading: uploadingGuest, handleCreatePost, handleUpdatePost, fetchComments: fetchGuestCommentsData, handlePostComment: handleGuestCommentSubmit, handleDeletePost: handleDeleteGuestPost, handleDeleteComment: handleDeleteGuestComment } = useGuestbook(effectiveUser?.id);
    const { notifications, unreadNotificationCount, showNotificationsModal, setShowNotificationsModal, fetchNotifications, markNotificationsAsRead } = useDashboardNotifications(effectiveUser);

    // UI-Specific State (Not in hooks)
    const [selectedNotice, setSelectedNotice] = useState(null);
    const [noticeContext, setNoticeContext] = useState(null);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');

    const [showGuestWrite, setShowGuestWrite] = useState(false);
    const [newGuestPost, setNewGuestPost] = useState({ content: '', images: [], previews: [] });
    const [selectedGuestPost, setSelectedGuestPost] = useState(null);
    const [guestComments, setGuestComments] = useState([]);
    const [newGuestComment, setNewGuestComment] = useState('');

    const [showProfileSettings, setShowProfileSettings] = useState(false);
    const [profileImage, setProfileImage] = useState(null);
    const [profilePreview, setProfilePreview] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [showCropModal, setShowCropModal] = useState(false);
    const [photoURL, setPhotoURL] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    const [showProgramHistory, setShowProgramHistory] = useState(false);
    const [attendedProgramsList, setAttendedProgramsList] = useState([]);
    const [showEnlargedQr, setShowEnlargedQr] = useState(false);
    const { badgeCategories, dynamicBadges, badgesLoading, fetchBadgeData } = useDashboardBadges();
    const [specialStats, setSpecialStats] = useState({ isBirthdayVisited: false, uniqueLocationsCount: 0, maxConsecutiveDays: 0, earnedChallengeIds: [] });
    const [selectedBadge, setSelectedBadge] = useState(null);
    const { adminSchedules, calendarCategories, fetchSchedules } = useDashboardCalendar();
    const DEFAULT_STUDENT_DASHBOARD_ITEMS = [
        { id: 'operating_status', label: '센터 오픈 현황', isVisible: true, count: 0 },
        { id: 'live_chat', label: '실시간 라이브 채팅', isVisible: true, count: 0 },
        { id: 'notices', label: '공지사항', isVisible: true, count: 5 },
        { id: 'programs', label: '프로그램 신청', isVisible: true, count: 10 }
    ];

    const [dashboardConfig, setDashboardConfig] = useState(DEFAULT_STUDENT_DASHBOARD_ITEMS);
    const [tabConfig, setTabConfig] = useState([
        { id: 'home', label: '홈', isVisible: true },
        { id: 'badges', label: '뱃지', isVisible: true },
        { id: 'programs', label: '센터', isVisible: true },
        { id: 'calendar', label: '캘린더', isVisible: true },
        { id: 'azit', label: '커뮤니티', isVisible: true },
        { id: 'haifn', label: '하이픈', isVisible: true }
    ]);

    const [selectedRegion, setSelectedRegion] = useState('ALL'); // 'ALL', 'GANGDONG', 'GANGSEO'

    const handleTabChange = (tabName) => {
        setActiveTab(tabName);
        setSelectedNotice(null);
        setNoticeContext(null);
        setSelectedGuestPost(null);
        setShowProfileSettings(false);
        setShowGuestWrite(false);

        // Celebration Logic
        if (tabName === TAB_NAMES.BADGES) {
            const earnedCount = dynamicBadges.filter(ch => getBadgeProgress(ch, { visitCount, programCount, specialStats }).earned).length;
            const lastSeenEarned = parseInt(localStorage.getItem(`lastEarnedCount_${user?.id}`) || '0');

            if (earnedCount > lastSeenEarned) {
                // Celebrate!
                setTimeout(() => {
                    confetti({
                        particleCount: 150,
                        spread: 70,
                        origin: { y: 0.6 },
                        colors: ['#3b82f6', '#4f46e5', '#ec4899', '#fbbf24']
                    });
                }, 500);
                localStorage.setItem(`lastEarnedCount_${user?.id}`, earnedCount.toString());
            }
        }
    };

    // Notifications managed by useDashboardNotifications hook

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'SCI CENTER 학생앱',
                    text: '학생앱에 접속해보세요!',
                    url: 'https://app.schoolchurchimpact.org',
                });
            } catch (err) {
                console.error('Share failed:', err);
            }
        } else {
            alert('공유하기를 지원하지 않는 기기입니다. URL을 복사해주세요.');
        }
    };




    useEffect(() => {
        let storedUser = localStorage.getItem('user') || localStorage.getItem('admin_user');
        if (!storedUser) {
            alert('로그인이 필요합니다.');
            const params = new URLSearchParams(window.location.search);
            const noticeId = params.get('noticeId');
            const suffix = noticeId ? `?noticeId=${noticeId}` : '';
            navigate('/' + suffix);
            return;
        }

        if (!localStorage.getItem('user') && localStorage.getItem('admin_user')) {
            localStorage.setItem('user', storedUser);
        }

        const parsedUser = JSON.parse(storedUser);

        if (!user || user.id !== parsedUser.id) {
            setUser(parsedUser);
        }



        // Refresh User Data (to ensure profile image, is_leader, etc. are up-to-date)
        userApi.fetchUser(parsedUser.id).then(latestUser => {
            if (latestUser) {
                const mergedUser = { ...parsedUser, ...latestUser };
                setUser(mergedUser);
                localStorage.setItem('user', JSON.stringify(mergedUser));

                try {
                    const localAdmin = localStorage.getItem('admin_user');
                    if (localAdmin) {
                        const parsedAdmin = JSON.parse(localAdmin);
                        if (parsedAdmin && parsedAdmin.id === parsedUser.id) {
                            localStorage.setItem('admin_user', JSON.stringify({ ...parsedAdmin, ...latestUser }));
                        }
                    }
                } catch (e) {
                    console.error('Failed to sync admin_user in StudentDashboard effect:', e);
                }
            }
        });

        fetchStats(parsedUser.id).then(res => {
            if (res && res.attendedPrograms) {
                setAttendedProgramsList(res.attendedPrograms);
            }
            if (res && res.specialStats) {
                setSpecialStats(res.specialStats);
            }
        });

        fetchBadgeData();
        subscribeToPush(parsedUser.id);
        fetchSchedules();
        fetchRealtimeStatusData();
        fetchNotifications(parsedUser);

        // Region fetching handled in dedicated useEffect below for effectiveUser

        setLoading(false);

    }, [navigate, fetchStats, fetchBadgeData, fetchNotifications, fetchSchedules]); // Removed dependencies that cause loops

    useEffect(() => {
        let cancelled = false;

        if (!effectiveUser?.school) {
            setStudentRegion(null);
            return () => { cancelled = true; };
        }

        resolveSchoolRegion(effectiveUser.school)
            .then((region) => {
                if (!cancelled) setStudentRegion(region);
            })
            .catch((error) => {
                console.error('Failed to resolve student school region:', error);
                if (!cancelled) setStudentRegion(null);
            });

        return () => { cancelled = true; };
    }, [effectiveUser?.school]);

    // Handled by useRealtimePresence and useDashboardCalendar

    useEffect(() => {
        const fetchDashboardConfig = async () => {
            const { data } = await supabase
                .from('notices')
                .select('content')
                .eq('category', CATEGORIES.SYSTEM)
                .eq('title', 'STUDENT_DASHBOARD_CONFIG')
                .maybeSingle();

            if (data && data.content) {
                try {
                    const parsed = JSON.parse(data.content);
                    if (Array.isArray(parsed)) {
                        const filtered = parsed.filter(c => c.id !== 'gallery');
                        const merged = DEFAULT_STUDENT_DASHBOARD_ITEMS.map(def => {
                            const found = filtered.find(f => f.id === def.id);
                            return found ? { ...def, ...found } : def;
                        });
                        const ordered = [
                            ...filtered.map(f => merged.find(m => m.id === f.id)).filter(Boolean),
                            ...merged.filter(m => !filtered.find(f => f.id === m.id))
                        ];
                        setDashboardConfig(ordered);
                    }
                } catch (e) {
                    console.error('Failed to parse dashboard config', e);
                }
            }
        };

        const fetchTabConfig = async () => {
            const { data } = await supabase
                .from('notices')
                .select('content')
                .eq('category', CATEGORIES.SYSTEM)
                .eq('title', 'STUDENT_TAB_CONFIG')
                .maybeSingle();

            if (data && data.content) {
                try {
                    const parsed = JSON.parse(data.content);
                    if (Array.isArray(parsed)) {
                        const defaultTabs = [
                            { id: 'home', label: '홈', isVisible: true },
                            { id: 'badges', label: '뱃지', isVisible: true },
                            { id: 'programs', label: '센터', isVisible: true },
                            { id: 'calendar', label: '캘린더', isVisible: true },
                            { id: 'azit', label: '커뮤니티', isVisible: true },
                            { id: 'haifn', label: '하이픈', isVisible: true }
                        ];
                        const merged = defaultTabs.map(def => {
                            const found = parsed.find(p => p.id === def.id);
                            return found ? { ...def, ...found } : def;
                        });
                        const ordered = [
                            ...parsed.map(p => merged.find(m => m.id === p.id)).filter(Boolean),
                            ...merged.filter(m => !parsed.find(p => p.id === m.id))
                        ];
                        setTabConfig(ordered);
                    }
                } catch (e) {
                    console.error('Failed to parse tab config', e);
                }
            }
        };

        fetchDashboardConfig();
        fetchTabConfig();
    }, []);

    // Handled by useDashboardChallenges

    // Deep-linking: Open notice from URL query param or localStorage intent
    useEffect(() => {
        if (notices.length > 0) {
            const params = new URLSearchParams(window.location.search);
            const queryNoticeId = params.get('noticeId');
            const pendingNoticeId = localStorage.getItem('pendingProgramJoin');
            const targetId = queryNoticeId || pendingNoticeId;
            
            if (targetId) {
                const target = notices.find(n => String(n.id) === String(targetId));
                if (target) {
                    openNoticeDetail(target, 'all Programs'); // Open specifically
                    // Clear both
                    if (queryNoticeId) {
                        window.history.replaceState({}, '', window.location.pathname);
                    }
                    if (pendingNoticeId) {
                        localStorage.removeItem('pendingProgramJoin');
                    }
                }
            }
        }
    }, [notices]);

    const handlePostComment = async (e) => {
        e.preventDefault();
        if (!newComment.trim()) return;
        try {
            const { error } = await supabase.from('comments').insert([{
                notice_id: selectedNotice.id,
                user_id: user?.id,
                content: newComment
            }]);
            if (error) throw error;
            setNewComment('');
            // Fetch updated comments
            const { data } = await supabase
                .from('comments')
                .select('*, users(name, profile_image_url)')
                .eq('notice_id', selectedNotice.id)
                .order('created_at', { ascending: true });
            setComments(data || []);
        } catch (err) { alert('댓글 작성 실패'); }
    };

    const handleDeleteComment = async (commentId) => {
        if (!confirm('댓글을 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase
                .from('comments')
                .delete()
                .eq('id', commentId)
                .eq('user_id', user?.id);
            if (error) throw error;
            // Fetch updated comments
            const { data } = await supabase
                .from('comments')
                .select('*, users(name, profile_image_url)')
                .eq('notice_id', selectedNotice.id)
                .order('created_at', { ascending: true });
            setComments(data || []);
        } catch (err) {
            console.error(err);
            alert('댓글 삭제 실패');
        }
    };

    const openNoticeDetail = async (notice, context = null) => {
        setSelectedNotice(notice);
        setNoticeContext(context);
        try {
            const { data } = await supabase
                .from('comments')
                .select('*, users(name, profile_image_url)')
                .eq('notice_id', notice.id)
                .order('created_at', { ascending: true });
            setComments(data || []);
        } catch (err) { console.error(err); }
    };

    // Keep an open detail in sync when an administrator finishes a scheduled
    // program or changes its recruitment period on another device.
    useEffect(() => {
        setSelectedNotice(previous => {
            if (!previous || previous.tutorial_mode) return previous;
            return notices.find(item => item.id === previous.id) || previous;
        });
    }, [notices]);

    const handleCreateGuestPost = async () => {
        const success = await handleCreatePost(newGuestPost.content, newGuestPost.images);
        if (success) {
            setNewGuestPost({ content: '', images: [], previews: [] });
            setShowGuestWrite(false);
        }
    };
    const openGuestPostDetail = async (post) => {
        setSelectedGuestPost(post);
        const data = await fetchGuestCommentsData(post.id);
        setGuestComments(data);
    };

    const handlePostGuestCommentData = async (e) => {
        e.preventDefault();
        const success = await handleGuestCommentSubmit(selectedGuestPost.id, newGuestComment);
        if (success) {
            setNewGuestComment('');
            const data = await fetchGuestCommentsData(selectedGuestPost.id);
            setGuestComments(data);
        }
    };

    const onDeleteGuestPost = async (postId) => {
        if (!confirm('방명록 글을 삭제하시겠습니까?')) return;
        const success = await handleDeleteGuestPost(postId);
        if (success) {
            setSelectedGuestPost(null);
            alert('삭제되었습니다.');
        }
    };

    const onDeleteGuestComment = async (commentId) => {
        if (!confirm('댓글을 삭제하시겠습니까?')) return;
        const success = await handleDeleteGuestComment(selectedGuestPost.id, commentId);
        if (success) {
            const data = await fetchGuestCommentsData(selectedGuestPost.id);
            setGuestComments(data);
        }
    };

    const handleGuestFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            const newPreviews = files.map(file => URL.createObjectURL(file));
            setNewGuestPost(prev => ({
                ...prev,
                images: [...prev.images, ...files],
                previews: [...prev.previews, ...newPreviews]
            }));
        }
    };





    // Filter Notices



    const isNoticeEnded = (n) => {
        if (n.program_status === 'COMPLETED' || n.program_status === 'CANCELLED') return true;
        if ((n.guest_properties?.is_ended ?? n.is_ended) === true) return true;
        
        const pDateStr = n.program_end_date || n.program_date;
        if (!pDateStr) return false;
        const pDate = new Date(pDateStr);
        const durationHours = parseFloat(n.program_duration) || 0;
        const pEndDate = new Date(pDate.getTime() + (durationHours > 0 ? durationHours : 2) * 60 * 60 * 1000);

        return new Date() >= pEndDate;
    };

    // 종료 여부와 별개로 프로그램 일정에 오늘이 포함되면 자정까지 노출한다.
    // 단일 일정(program_date)과 여러 날 일정(start/end)을 모두 같은 기준으로 처리한다.
    const isProgramScheduledToday = (n) => {
        const today = startOfDay(new Date());
        const startValue = n.program_start_date || n.program_date || n.program_end_date;
        const endValue = n.program_end_date || n.program_date || n.program_start_date;
        if (!startValue && !endValue) return false;

        const startDate = startOfDay(parseISO(startValue || endValue));
        const endDate = startOfDay(parseISO(endValue || startValue));
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false;

        return today >= startDate && today <= endDate;
    };

    const isVisibleForStudentRegion = (notice) => {
        const targets = Array.isArray(notice.target_regions) ? notice.target_regions.filter(Boolean) : [];
        if (targets.length === 0 || targets.length >= 2) return true;

        // 프로그램을 신청한 게스트는 학교가 자유 입력이라 지역 매핑이
        // 비어 있어도 오늘 일정만큼은 신청 내역에서 사라지지 않도록 한다.
        const guestApplicationStatus = responses[notice.id];
        if (
            effectiveUser?.user_group === '게스트' &&
            notice.category === CATEGORIES.PROGRAM &&
            ['JOIN', 'WAITLIST'].includes(guestApplicationStatus) &&
            isProgramScheduledToday(notice)
        ) {
            return true;
        }

        // 관리자 미리보기에서는 선택한 지역을 기준으로 보여 준다.
        if (!impersonatedUser && (user?.role === 'admin' || user?.user_group === '관리자')) {
            if (selectedRegion === 'GANGDONG') return targets.includes('강동');
            if (selectedRegion === 'GANGSEO') return targets.includes('강서');
            return true;
        }

        return Boolean(studentRegion && targets.includes(studentRegion));
    };

    const filteredNotices = notices.filter(n =>
        n.category === CATEGORIES.NOTICE && isVisibleForStudentRegion(n)
    );

    const allPrograms = notices.filter(n => {
        if (n.category !== CATEGORIES.PROGRAM) return false;
        if (n.is_private && responses[n.id] !== 'JOIN') return false;
        return isVisibleForStudentRegion(n);
    });

    const filteredPrograms = allPrograms.filter(n => {
        if (n.program_status === 'CANCELLED') return false;
        // Safe calendar previews must also appear in the program tab before
        // recruitment opens, without requiring unpublished detail fields.
        if (getRecruitment(n).status === 'SCHEDULED') return true;

        // 종료됐더라도 일정이 오늘이면 당일 자정까지 학생 화면에 유지한다.
        const isScheduledToday = isProgramScheduledToday(n);
        if (isNoticeEnded(n) && !isScheduledToday) return false;

        const todayStart = startOfDay(new Date());
        const pDateStr = n.program_end_date || n.program_date || n.program_start_date;
        const pDate = pDateStr ? parseISO(pDateStr) : null;
        const isTodayOrFuture = pDate ? pDate >= todayStart : true;

        return isScheduledToday || isTodayOrFuture;
    });

    const homeNotices = filteredNotices.slice(0, 3);

    // 홈 탭의 '내가 신청한 프로그램': 오늘 진행/종료된 프로그램 및 미래 신청 프로그램 포함 (오늘 종료된 프로그램도 홈 탭에서 피드백 작성 가능)
    const homePrograms = allPrograms.filter(n => {
        if (n.program_status === 'CANCELLED') return false;

        const todayStart = startOfDay(new Date());
        const isJoined = responses[n.id] === 'JOIN' || responses[n.id] === 'WAITLIST';
        const isScheduledToday = isProgramScheduledToday(n);

        const pDateStr = n.program_end_date || n.program_date || n.program_start_date;
        const pDate = pDateStr ? parseISO(pDateStr) : null;
        const isTodayOrFuture = pDate ? pDate >= todayStart : true;

        if (isJoined) {
            return isScheduledToday || isTodayOrFuture;
        }

        if (isNoticeEnded(n) && !isScheduledToday) return false;
        return isScheduledToday || isTodayOrFuture;
    }).slice(0, 10);


    const handleProfileImageSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setPhotoURL(URL.createObjectURL(file));
            setShowCropModal(true);
            // Reset Cropper
            setZoom(1);
            setRotation(0);
            setCrop({ x: 0, y: 0 });
        }
    };

    const onCropComplete = (croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    const handleCropSave = async () => {
        try {
            const croppedImageBlob = await getCroppedImg(photoURL, croppedAreaPixels, rotation);
            const file = new File([croppedImageBlob], "profile_cropped.jpg", { type: "image/jpeg" });

            setProfileImage(file);
            setProfilePreview(URL.createObjectURL(file));
            setShowCropModal(false);
        } catch (e) {
            console.error(e);
            alert('이미지 크롭 실패');
        }
    };

    const handleSaveProfile = async () => {
        const updates = {};
        let passwordSaved = false;
        if (newPassword) {
            if (newPassword.length < 6) {
                alert('비밀번호는 6자리 이상이어야 합니다.');
                return;
            }
            if (newPassword !== confirmPassword) {
                alert('비밀번호 확인이 일치하지 않습니다.');
                return;
            }
            if (isAccountAuthEnabled()) {
                try {
                    await getAccountAuthClient().password({ profileId: user.id, newPassword });
                    passwordSaved = true;
                } catch (error) {
                    alert('비밀번호 변경 실패: ' + (error.message || '잠시 후 다시 시도해주세요.'));
                    return;
                }
            } else {
                const hashedPassword = await hashPassword(newPassword);
                updates.password = hashedPassword;
            }
        }

        const result = passwordSaved && !profileImage && Object.keys(updates).length === 0
            ? { success: true }
            : await updateProfile(updates, profileImage);

        if (result.success) {
            alert('프로필이 업데이트되었습니다.');
            setShowProfileSettings(false);
            setProfileImage(null);
            setNewPassword('');
            setConfirmPassword('');
        } else {
            alert('프로필 저장 실패: ' + result.error);
        }
    };
    const handleLogout = async () => {
        if (window.confirm("로그아웃 하시겠습니까?")) {
            await supabase.auth.signOut();
            localStorage.removeItem('user');
            localStorage.removeItem('admin_user');
            navigate('/');
        }
    };

    return {
        // Core State
        loading,
        user: effectiveUser, 
        realUser: user, 
        impersonatedUser, 
        setImpersonatedUser,
        setUser,
        activeTab,
        setActiveTab,
        handleLogout,
        selectedRegion,
        setSelectedRegion,
        
        // Modals Traps
        showProfileSettings, setShowProfileSettings,
        showGuestWrite, setShowGuestWrite,
        selectedGuestPost, setSelectedGuestPost,
        showProgramHistory, setShowProgramHistory,
        showEnlargedQr, setShowEnlargedQr,
        showNotificationsModal, setShowNotificationsModal,
        selectedBadge, setSelectedBadge,
        selectedNotice, setSelectedNotice,
        noticeContext, setNoticeContext,
        
        // Modal dependencies & handlers (passed through)
        comments, setComments,
        newComment, setNewComment,
        handlePostComment, handleDeleteComment,
        handleShare,
        handleTabChange,
        openNoticeDetail,
        markNotificationsAsRead,
        
        // Mapped Data For Tabs & Dashboard
        notices, responses, responseDetails, handleResponse, fetchNotices,
        filteredNotices, filteredPrograms, allPrograms,
        homeNotices, homePrograms,
        studentRegion, locationGroups, locations, allUsers, activeUserCountByGroup,
        totalHours, visitCount, programCount,
        attendedProgramsList,
        badgeCategories, dynamicBadges, badgesLoading, specialStats,
        adminSchedules, calendarCategories, dashboardConfig, tabConfig,
        notifications, unreadNotificationCount,
        updateProfile, withdrawMembership, profileLoadingState,
        
        // Guestbook Hooks
        guestPosts, uploadingGuest, handleCreatePost, handleUpdatePost, handleDeleteGuestPost,
        fetchGuestCommentsData, handleGuestCommentSubmit, handleDeleteGuestComment
    };
};
