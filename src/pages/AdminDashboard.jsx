import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

// Utilities
import { performFullSyncToGoogleSheets } from '../utils/integrationUtils';
import { processAnalyticsData, processUserAnalytics, processProgramAnalytics } from '../utils/analyticsUtils';
import { aggregateVisitSessions } from '../utils/visitUtils';
import { feedbackApi } from '../api/feedbackApi';

// Components
import AdminSidebar from '../components/admin/AdminSidebar';
import AdminStatus from '../components/admin/dashboard/AdminStatus';
import AdminBoard from '../components/admin/board/AdminBoard';
import AdminUsers from '../components/admin/users/AdminUsers';
import AdminLogs from '../components/admin/dashboard/AdminLogs';
import AdminSettings from '../components/admin/settings/AdminSettings';
import AdminBadges from '../components/admin/settings/AdminBadges';
import AdminStatistics from '../components/admin/statistics/AdminStatistics';
import AdminMessages from '../components/admin/messages/AdminMessages';
import AdminReport from '../components/admin/statistics/AdminReport';
import AdminCalendar from '../components/admin/calendar/AdminCalendar';
import AdminSchool from '../components/admin/school/AdminSchool';
import AdminStore from '../components/admin/store/AdminStore';
import AdminRentals from '../components/admin/rentals/AdminRentals';
import AdminContents from '../components/admin/contents/AdminContents';
import AdminDuty from '../components/admin/duty/AdminDuty';
import StaffPresenceToggleCard from '../components/admin/dashboard/components/StaffPresenceToggleCard';
import { Menu, X as CloseIcon } from 'lucide-react';
import { subscribeToPush } from '../utils/pushUtils';

const AdminDashboard = () => {
    const navigate = useNavigate();

    // Auth & Data State
    const [currentAdmin, setCurrentAdmin] = useState(null);
    const [activeMenu, setActiveMenu] = useState('STATUS'); // STATUS, BOARD, GALLERY, USERS, STATISTICS, LOGS, SETTINGS
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSidebarPinned, setIsSidebarPinned] = useState(true);
    const [loading, setLoading] = useState(true);
    const [isStatsLoading, setIsStatsLoading] = useState(false);

    // Data
    const [users, setUsers] = useState([]);
    const [locations, setLocations] = useState([]);
    const [locationGroups, setLocationGroups] = useState([]);
    const [notices, setNotices] = useState([]);
    const [allLogs, setAllLogs] = useState([]);
    const [schoolLogs, setSchoolLogs] = useState([]);
    const [responses, setResponses] = useState([]);
    const [feedbacks, setFeedbacks] = useState([]);
    const [zoneStats, setZoneStats] = useState({});
    const [dailyVisitStats, setDailyVisitStats] = useState({});
    const [currentLocations, setCurrentLocations] = useState({}); // { userId: locationId }
    const [visitNotes, setVisitNotes] = useState([]);
    const [checkinSurveys, setCheckinSurveys] = useState([]);

    // Alert & Realtime Notification State
    const [isAlertEnabled, setIsAlertEnabled] = useState(localStorage.getItem('admin_alert_enabled') !== 'false');
    const [toasts, setToasts] = useState([]);
    const usersRef = React.useRef([]);
    const locationsRef = React.useRef([]);
    const currentAdminRef = React.useRef(null);

    useEffect(() => {
        usersRef.current = users;
    }, [users]);

    useEffect(() => {
        locationsRef.current = locations;
    }, [locations]);

    useEffect(() => {
        currentAdminRef.current = currentAdmin;
    }, [currentAdmin]);

    const playChime = useCallback(() => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            oscillator.start();
            
            oscillator.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime + 0.12);
            
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
            oscillator.stop(audioCtx.currentTime + 0.6);
        } catch (e) {
            console.error("Audio play failed:", e);
        }
    }, []);

    const handleToggleAlert = useCallback((enabled) => {
        setIsAlertEnabled(enabled);
        localStorage.setItem('admin_alert_enabled', String(enabled));
        if (enabled && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    const fetchData = useCallback(async (isFullFetch = false) => {
        // Automatically perform full fetch if currently in statistics or report mode
        const needsFullFetch = isFullFetch || activeMenu === 'STATISTICS' || activeMenu === 'REPORTS';
        if (needsFullFetch) setIsStatsLoading(true);
        try {
            const { data: userData } = await supabase.from('users').select('*').order('name');
            setUsers(userData || []);

            // Automatically sync currentAdmin with latest DB data
            const storedAdminStr = localStorage.getItem('admin_user');
            if (storedAdminStr && userData) {
                try {
                    const parsedAdmin = JSON.parse(storedAdminStr);
                    const latestAdminUser = userData.find(u => u.id === parsedAdmin.id);
                    if (latestAdminUser) {
                        const mergedAdmin = { ...parsedAdmin, ...latestAdminUser };
                        setCurrentAdmin(mergedAdmin);
                        localStorage.setItem('admin_user', JSON.stringify(mergedAdmin));
                    }
                } catch (e) {
                    console.error('Failed to sync currentAdmin:', e);
                }
            }

            const { data: locData } = await supabase.from('locations').select('*').order('id');
            setLocations(locData || []);

            const { data: lgData } = await supabase.from('location_groups').select('*').order('created_at');
            setLocationGroups(lgData || []);

            const { data: noticeData } = await supabase.from('notices').select('*')
                .order('is_sticky', { ascending: false })
                .order('created_at', { ascending: false });
            setNotices(noticeData || []);

            const { data: responseData } = await supabase.from('notice_responses').select('*');
            setResponses(responseData || []);

            let feedbackData = [];
            try {
                feedbackData = await feedbackApi.fetchAllFeedbacks();
            } catch (fbErr) {
                console.error("Failed to fetch feedbacks", fbErr);
            }
            setFeedbacks(feedbackData || []);

            const { data: vNotesData } = await supabase.from('visit_notes').select('*');
            setVisitNotes(vNotesData || []);

            let surveyDataList = [];
            try {
                const { data: sData } = await supabase
                    .from('checkin_surveys')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(1000);
                surveyDataList = sData || [];
            } catch (e) {
                console.error("Failed to fetch checkin surveys:", e);
            }
            setCheckinSurveys(surveyDataList);

            // Stats Calculation - Increase limit for initial load and allow full fetch for statistics
            const logLimit = isFullFetch ? 10000 : 3000;
            const { data: rawLogs } = await supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(logLimit);
            const logs = rawLogs ? [...rawLogs].reverse() : [];

            const userCurrentLocation = {};
            logs?.forEach(log => {
                const key = log.user_id || `guest_${log.id}`;
                if (log.type === 'CHECKIN') {
                    userCurrentLocation[key] = { locId: log.location_id, checkInTime: log.created_at, isGuest: !log.user_id };
                } else if (log.type === 'MOVE') {
                    userCurrentLocation[key] = { 
                        locId: log.location_id, 
                        checkInTime: userCurrentLocation[key]?.checkInTime || log.created_at,
                        isGuest: !log.user_id
                    };
                } else if (log.type === 'CHECKOUT') {
                    userCurrentLocation[key] = null;
                }
            });

            const adminIdsSet = new Set(userData?.filter(u =>
                u.name === 'admin' || u.user_group === '관리자' || u.role === 'admin'
            ).map(u => u.id) || []);

            // Occupancy Stats Calculation (Real-time) - Only count non-staff
            const zStats = {};
            locData?.forEach(l => zStats[l.id] = 0);
            Object.entries(userCurrentLocation).forEach(([key, locInfo]) => {
                const locId = locInfo?.locId;
                const userId = locInfo?.isGuest ? null : key;
                if (locId && zStats[locId] !== undefined && (!userId || !adminIdsSet.has(userId))) {
                    zStats[locId]++;
                }
            });

            // Visitor Stats Calculation (Today)
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayLogs = logs?.filter(l => new Date(l.created_at) >= todayStart) || [];

            const vStats = {};
            const locVisitors = {}; // { locId: Set of studentIds }

            locData?.forEach(l => {
                vStats[l.id] = 0;
                locVisitors[l.id] = new Set();
            });

            todayLogs.forEach(log => {
                if (log.location_id && vStats[log.location_id] !== undefined) {
                    if (log.type === 'GUEST_ENTRY') {
                        vStats[log.location_id]++;
                    } else if ((log.type === 'CHECKIN' || log.type === 'MOVE') && (!log.user_id || !adminIdsSet.has(log.user_id))) {
                        const visitorKey = log.user_id || `guest_${log.id}`;
                        locVisitors[log.location_id].add(visitorKey);
                    }
                }
            });

            // Merge student sets into counts
            Object.keys(locVisitors).forEach(locId => {
                vStats[locId] += locVisitors[locId].size;
            });

            setZoneStats(zStats);
            setDailyVisitStats(vStats);
            setCurrentLocations(userCurrentLocation);
            setAllLogs(logs || []);

            // Fetch School Logs for AdminLogs
            const { data: sLogs } = await supabase.from('school_logs').select('*, users(name), schools(name)').order('date', { ascending: false });
            setSchoolLogs(sLogs || []);

            return { users: userData || [], locations: locData || [], locationGroups: lgData || [], notices: noticeData || [], responses: responseData || [], allLogs: logs || [], schoolLogs: sLogs || [], feedbacks: feedbackData || [] };

        } catch (error) { console.error(error); }
        finally {
            setLoading(false);
            setIsStatsLoading(false);
        }
    }, [activeMenu]);

    useEffect(() => {
        const storedAdmin = localStorage.getItem('admin_user');
        if (!storedAdmin) {
            alert('관리자 권한이 필요합니다.');
            navigate('/');
            return;
        }
        const admin = JSON.parse(storedAdmin);
        setCurrentAdmin(admin);
        fetchData();
        subscribeToPush(admin.id); // Ask for notification permission

        // Realtime Subscription with Debounce (for UI updates)
        let debounceTimer;
        const debouncedFetch = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchData();
            }, 1000);
        };

        const subscription = supabase
            .channel('public:updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notice_responses' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'checkin_surveys' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'visit_notes' }, debouncedFetch)
            .subscribe();

        // 100% Reliable Polling Fallback for Check-in Alerts
        const lastCheckedTimeRef = { current: new Date().toISOString() };
        
        const pollCheckins = async () => {
            const isAlertOn = localStorage.getItem('admin_alert_enabled') !== 'false';
            if (!isAlertOn) return;
            
            try {
                const adminId = currentAdminRef.current?.id;
                if (!adminId) return;

                // 1. Fetch STAFF_PRESENCE_CONFIG and STATUS
                const { data: configs } = await supabase
                    .from('notices')
                    .select('title, content')
                    .eq('category', 'SYSTEM')
                    .in('title', ['STAFF_PRESENCE_CONFIG', 'STAFF_PRESENCE_STATUS']);

                let staffConfig = { "하이픈": [], "이높플레이스": [] };
                let presenceStatus = {};

                if (configs && configs.length > 0) {
                    const configNotice = configs.find(c => c.title === 'STAFF_PRESENCE_CONFIG');
                    const statusNotice = configs.find(c => c.title === 'STAFF_PRESENCE_STATUS');

                    if (configNotice?.content) {
                        try {
                            const parsed = JSON.parse(configNotice.content);
                            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                staffConfig = parsed;
                            } else if (Array.isArray(parsed)) {
                                staffConfig = { "하이픈": parsed, "이높플레이스": parsed };
                            }
                        } catch (e) {}
                    }
                    if (statusNotice?.content) {
                        try {
                            presenceStatus = JSON.parse(statusNotice.content) || {};
                        } catch (e) {}
                    }
                }

                // 2. Check if admin is currently marked as working ("근무 중")
                const isWorking = presenceStatus[adminId] === true;
                if (!isWorking) return; // Skip alerts if not working

                // 3. Determine admin's assigned branches
                const isAdminAtHaifn = (staffConfig["하이픈"] || []).includes(adminId);
                const isAdminAtInop = (staffConfig["이높플레이스"] || []).includes(adminId);

                // 4. Fetch new check-in logs
                const { data: newLogs } = await supabase
                    .from('logs')
                    .select('id, user_id, type, location_id, created_at')
                    .eq('type', 'CHECKIN')
                    .gt('created_at', lastCheckedTimeRef.current)
                    .order('created_at', { ascending: true });
                
                if (newLogs && newLogs.length > 0) {
                    lastCheckedTimeRef.current = newLogs[newLogs.length - 1].created_at;
                    
                    newLogs.forEach(log => {
                        // Find checked-in location
                        const loc = locationsRef.current.find(l => l.id === log.location_id);
                        if (!loc) return;

                        const isLocHaifn = loc.name?.includes('하이픈');
                        const isLocInop = loc.name?.includes('이높플레이스');

                        // Filter by branch match
                        let shouldAlert = false;
                        if (isLocHaifn && isAdminAtHaifn) shouldAlert = true;
                        else if (isLocInop && isAdminAtInop) shouldAlert = true;
                        else if (!isLocHaifn && !isLocInop) shouldAlert = true; // Alert all if location doesn't match standard branches
                        
                        if (!shouldAlert) return; // Skip alert for this logged-in admin

                        const u = usersRef.current.find(user => user.id === log.user_id);
                        if (u) {
                            const branchName = isLocHaifn ? '하이픈' : (isLocInop ? '이높플레이스' : '센터');
                            const message = `${u.name} 학생이 ${branchName}에 체크인했어요!`;
                            playChime();
                            
                            if (Notification.permission === 'granted') {
                                new Notification('체크인 알림', {
                                    body: message,
                                    icon: '/favicon.ico'
                                });
                            }
                            
                            const toastId = Date.now() + Math.random();
                            setToasts(prev => [...prev, { id: toastId, message, name: u.name, school: u.school }]);
                            
                            setTimeout(() => {
                                setToasts(prev => prev.filter(t => t.id !== toastId));
                            }, 5000);
                        }
                    });
                    
                    fetchData();
                }
            } catch (err) {
                console.error("Failed to poll checkins:", err);
            }
        };

        const pollInterval = setInterval(pollCheckins, 4000); // Poll every 4 seconds for fast response

        return () => {
            clearTimeout(debounceTimer);
            clearInterval(pollInterval);
            supabase.removeChannel(subscription);
        };
    }, [navigate, fetchData, playChime]);

    const handleForceCheckout = useCallback(async (userId) => {
        if (!confirm('해당 이용자를 강제 퇴실 처리하시겠습니까?')) return;
        try {
            const isGuestId = typeof userId === 'string' && userId.startsWith('guest_');
            const targetUserId = isGuestId ? null : userId;
            const { error } = await supabase.from('logs').insert([{
                user_id: targetUserId,
                type: 'CHECKOUT',
                location_id: null
            }]);

            if (error) throw error;
            fetchData();
            alert('퇴실 처리되었습니다.');
        } catch (err) {
            console.error(err);
            alert(`퇴실 처리 실패: ${err.message || '알 수 없는 오류'}`);
        }
    }, [fetchData]);

    const handleBatchCheckout = useCallback(async (userIds) => {
        if (userIds.length === 0) return;
        if (!confirm(`현재 입실 중인 ${userIds.length}명 전원을 퇴실 처리하시겠습니까?`)) return;

        try {
            const checkoutLogs = userIds.map(uid => ({
                user_id: uid,
                type: 'CHECKOUT',
                location_id: null
            }));

            const { error } = await supabase.from('logs').insert(checkoutLogs);
            if (error) throw error;

            fetchData();
            alert('전원 퇴실 처리되었습니다.');
        } catch (err) {
            console.error(err);
            alert(`일괄 퇴실 실패: ${err.message}`);
        }
    }, [fetchData]);

    // Trigger full fetch when entering statistics
    useEffect(() => {
        if (activeMenu === 'STATISTICS') {
            fetchData(true);
        }
    }, [activeMenu]);

    // B안: 뒤로가기 시 이전 탭으로 화면 전환을 위해 History API 연동
    useEffect(() => {
        // 첫 진입 시 현재 상태를 히스토리에 기재
        window.history.replaceState({ menu: activeMenu }, '');

        const handlePopState = (event) => {
            if (event.state && event.state.menu) {
                setActiveMenu(event.state.menu);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // activeMenu가 변경될 때마다 새로운 히스토리 항목 추가 (동일한 탭 연속 중복 추가 방지)
    useEffect(() => {
        if (window.history.state?.menu !== activeMenu) {
            window.history.pushState({ menu: activeMenu }, '');
        }
    }, [activeMenu]);

    // Responsive Sidebar Fix: Handle window resize to sync states
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                // When expanding to desktop, close mobile drawer
                setIsMenuOpen(false);
                // Auto-pin when returning to desktop to restore original behavior
                setIsSidebarPinned(true);
            } else {
                // When shrinking to mobile, always close the overlay and clear pin
                setIsMenuOpen(false);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Weekday 10PM Auto Sync Scheduler
    const syncDataRef = React.useRef({ users, allLogs, responses, notices, locations, schoolLogs, feedbacks });
    useEffect(() => {
        syncDataRef.current = { users, allLogs, responses, notices, locations, schoolLogs, feedbacks };
    }, [users, allLogs, responses, notices, locations, schoolLogs, feedbacks]);

    useEffect(() => {
        const checkAutoSync = () => {
            const now = new Date();
            const day = now.getDay(); // 0: Sun, 1-5: Mon-Fri, 6: Sat
            const isWeekday = day >= 1 && day <= 5;
            const hour = now.getHours();

            if (isWeekday && hour === 22) {
                const today = format(now, 'yyyy-MM-dd');
                const lastSync = localStorage.getItem('last_auto_sync_date');
                const gsWebhookUrl = localStorage.getItem('gs_webhook_url');

                if (lastSync !== today && gsWebhookUrl && syncDataRef.current.users.length > 0) {
                    console.log('--- Triggering Weekday 10PM Auto Sync ---');
                    handleAutoSync(gsWebhookUrl, today);
                }
            }
        };

        const interval = setInterval(checkAutoSync, 60000); // Check every minute
        checkAutoSync(); // Initial check

        return () => clearInterval(interval);
    }, []);

    const handleAutoSync = async (webhookUrl, todayStr) => {
        try {
            // Need latest visit notes for the sync
            const { data: vNotes } = await supabase.from('visit_notes').select('*');
            const { users, allLogs, responses, notices, locations, schoolLogs, feedbacks } = syncDataRef.current;

            await performFullSyncToGoogleSheets({
                webhookUrl,
                users,
                logs: allLogs,
                responses,
                notices,
                locations,
                schoolLogs,
                feedbacks,
                visitNotes: vNotes,
                processUserAnalytics,
                processProgramAnalytics,
                processAnalyticsData,
                aggregateVisitSessions
            });

            localStorage.setItem('last_auto_sync_date', todayStr);
            console.log('Auto Sync Successful:', todayStr);
        } catch (err) {
            console.error('Auto Sync Failed:', err);
        }
    };

    const handleLogout = async () => {
        if (confirm("로그아웃 하시겠습니까?")) {
            await supabase.auth.signOut();
            localStorage.removeItem('admin_user');
            localStorage.removeItem('user');
            navigate('/');
        }
    };

    if (loading) return <div className="flex items-center justify-center h-screen text-gray-400 font-bold">로딩 중...</div>;

    return (
        <div className="flex bg-gray-50 min-h-screen font-sans">
            {/* Sidebar */}
            <AdminSidebar
                activeMenu={activeMenu}
                setActiveMenu={(menu) => {
                    setActiveMenu(menu);
                    setIsMenuOpen(false);
                }}
                onLogout={handleLogout}
                isOpen={isMenuOpen}
                setIsOpen={setIsMenuOpen}
                isPinned={isSidebarPinned}
                setIsPinned={setIsSidebarPinned}
                notices={notices}
            />

            {/* Main Content */}
            <div className={`flex-1 ${isSidebarPinned ? 'md:ml-64' : 'ml-0'} min-w-0 transition-all duration-300 ease-in-out`}>
                {/* Universal Header - Visible on all sizes */}
                <header className="bg-white border-b border-gray-100 p-4 sticky top-0 z-30 flex justify-between items-center shadow-sm">
                    <h1 className="text-lg font-extrabold text-blue-600 tracking-tight">SCI CENTER <span className="text-gray-400 text-[10px] ml-1 uppercase">Admin</span></h1>
                    <button
                        onClick={() => {
                            // On desktop, toggle pinning. On mobile, toggle overlay.
                            if (window.innerWidth >= 768) {
                                // If already unpinned but overlay is open, close overlay
                                if (!isSidebarPinned && isMenuOpen) {
                                    setIsMenuOpen(false);
                                } else {
                                    setIsSidebarPinned(!isSidebarPinned);
                                }
                            } else {
                                setIsMenuOpen(!isMenuOpen);
                            }
                        }}
                        className="p-2 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors border border-gray-100 shadow-sm"
                    >
                        {(isMenuOpen || (window.innerWidth >= 768 && isSidebarPinned)) ? <CloseIcon size={20} /> : <Menu size={20} />}
                    </button>
                </header>

                <main className="p-4 md:p-10 max-w-[1600px] mx-auto">
                    {activeMenu === 'STATUS' && (
                        <AdminStatus
                            users={users}
                            locations={locations}
                            locationGroups={locationGroups}
                            zoneStats={zoneStats}
                            currentLocations={currentLocations}
                            handleBatchCheckout={handleBatchCheckout}
                            fetchData={fetchData}
                            allLogs={allLogs}
                            dailyVisitStats={dailyVisitStats}
                            setActiveMenu={setActiveMenu}
                            handleForceCheckout={handleForceCheckout}
                            isAlertEnabled={isAlertEnabled}
                            handleToggleAlert={handleToggleAlert}
                            checkinSurveys={checkinSurveys}
                            visitNotes={visitNotes}
                            surveyConfig={(() => {
                                const notice = notices.find(n => n.category === 'SYSTEM' && n.title === 'CHECKIN_SURVEY_CONFIG');
                                if (notice?.content) {
                                    try { return JSON.parse(notice.content); } catch (e) {}
                                }
                                return null;
                            })()}
                        />
                    )}
                    {activeMenu === 'WORK_STATUS' && (
                        <div className="animate-fade-in-up">
                            <StaffPresenceToggleCard users={users} />
                        </div>
                    )}
                    {activeMenu === 'CALENDAR' && (
                        <AdminCalendar notices={notices} fetchData={fetchData} setActiveMenu={setActiveMenu} />
                    )}
                    {activeMenu === 'PROGRAMS' && (
                        <AdminBoard mode="PROGRAM" notices={notices} fetchData={fetchData} users={users} currentLocations={currentLocations} setActiveMenu={setActiveMenu} />
                    )}
                    {activeMenu === 'BOARD' && (
                        <AdminBoard mode="NOTICE" notices={notices} fetchData={fetchData} users={users} currentLocations={currentLocations} setActiveMenu={setActiveMenu} />
                    )}
                    {activeMenu === 'GALLERY' && (
                        <AdminBoard mode="GALLERY" notices={notices} fetchData={fetchData} users={users} currentLocations={currentLocations} setActiveMenu={setActiveMenu} />
                    )}
                    {activeMenu === 'STORE' && (
                        <AdminStore users={users} />
                    )}
                    {activeMenu === 'CONTENTS_MGMT' && (
                        <AdminContents />
                    )}
                    {activeMenu === 'RENTAL_MGMT' && (
                        <AdminRentals />
                    )}
                    {activeMenu === 'DUTY' && (
                        <AdminDuty currentAdmin={currentAdmin} users={users} />
                    )}
                    {activeMenu === 'USERS' && (
                        <AdminUsers users={users} allLogs={allLogs} locations={locations} fetchData={fetchData} />
                    )}
                    {activeMenu === 'SCHOOLS' && (
                        <AdminSchool users={users} fetchData={fetchData} />
                    )}
                    {activeMenu === 'RENTALS' && (
                        <AdminRentals notices={notices} />
                    )}
                    {activeMenu === 'CONTENTS' && (
                        <AdminContents />
                    )}
                    {activeMenu === 'MESSAGES' && (
                        <AdminMessages users={users} />
                    )}
                    {activeMenu === 'STATISTICS' && (
                        <AdminStatistics 
                            logs={allLogs} 
                            schoolLogs={schoolLogs} 
                            locations={locations} 
                            locationGroups={locationGroups} 
                            users={users} 
                            notices={notices} 
                            responses={responses} 
                            feedbacks={feedbacks}
                            visitNotes={visitNotes}
                            isLoading={isStatsLoading} 
                            fetchData={fetchData} 
                        />
                    )}
                    {activeMenu === 'LOGS' && (
                        <AdminLogs allLogs={allLogs} schoolLogs={schoolLogs} users={users} locations={locations} notices={notices} fetchData={fetchData} />
                    )}
                    {activeMenu === 'REPORTS' && (
                        <AdminReport allLogs={allLogs} users={users} locations={locations} notices={notices} responses={responses} />
                    )}
                    {activeMenu === 'BADGES' && (
                        <AdminBadges />
                    )}
                    {activeMenu === 'SETTINGS' && (
                        <AdminSettings currentAdmin={currentAdmin} locations={locations} locationGroups={locationGroups} notices={notices} fetchData={fetchData} users={users} allLogs={allLogs} responses={responses} schoolLogs={schoolLogs} />
                    )}
                </main>
            </div>

            {/* Realtime Toast Container */}
            <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className="bg-white/90 backdrop-blur-md border border-blue-100 rounded-2xl p-4 shadow-xl flex items-start gap-3 pointer-events-auto transition-all hover:scale-[1.02] animate-fade-in"
                    >
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 font-bold">
                            🔔
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-400 font-black truncate">{toast.school || '센터 이용자'}</p>
                            <p className="text-sm font-bold text-[#191f28] mt-0.5 leading-tight">{toast.message}</p>
                        </div>
                        <button
                            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                            className="text-gray-400 hover:text-gray-600 transition shrink-0 p-1 hover:bg-gray-100 rounded-lg"
                        >
                            <CloseIcon size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminDashboard;

