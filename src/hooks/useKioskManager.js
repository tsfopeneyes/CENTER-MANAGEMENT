import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { isConsecutiveWorkingDay } from '../utils/analyticsUtils';
import confetti from 'canvas-confetti';
import { TERMS_VERSION } from '../constants/appConstants';
import { areExternalNotificationsMuted, dispatchServerNotification, dispatchVisitSlackAlert, serverIntegrationsEnabled } from '../utils/serverIntegration';
import { getTodayVisitState, recordVisitEvent } from '../utils/visitLifecycle';

const sendRealtimeNotification = async (user, type, location, metadata = {}) => {
    if (areExternalNotificationsMuted()) return { muted: true };
    let lineToken = '';
    let lineGroupId = '';
    let gsWebhookUrl = '';
    let discordWebhookUrl = '';
    let lineNotificationsEnabled = localStorage.getItem('line_notifications_enabled') !== 'false';

    if (!serverIntegrationsEnabled()) {
        lineToken = localStorage.getItem('line_channel_access_token') || '';
        lineGroupId = localStorage.getItem('line_group_id') || '';
        gsWebhookUrl = localStorage.getItem('gs_webhook_url') || '';
        discordWebhookUrl = localStorage.getItem('discord_webhook_url') || '';
        try {
        const { data: settings } = await supabase.from('global_settings').select('*');
        if (settings && settings.length > 0) {
            settings.forEach(s => {
                if (s.key === 'line_channel_access_token' && s.value) {
                    lineToken = s.value;
                    localStorage.setItem('line_channel_access_token', s.value);
                }
                if (s.key === 'line_group_id' && s.value) {
                    lineGroupId = s.value;
                    localStorage.setItem('line_group_id', s.value);
                }
                if (s.key === 'gs_webhook_url' && s.value) {
                    gsWebhookUrl = s.value;
                    localStorage.setItem('gs_webhook_url', s.value);
                }
                if (s.key === 'discord_webhook_url' && s.value) {
                    discordWebhookUrl = s.value;
                    localStorage.setItem('discord_webhook_url', s.value);
                }
            });
        }
        } catch (e) {
        console.error("Failed to fetch latest global_settings for realtime notification:", e);
        }
    }

    try {
        const { data: lineSetting } = await supabase
            .from('global_settings')
            .select('value')
            .eq('key', 'line_notifications_enabled')
            .maybeSingle();
        if (lineSetting?.value !== undefined) {
            lineNotificationsEnabled = lineSetting.value !== 'false';
            localStorage.setItem('line_notifications_enabled', String(lineNotificationsEnabled));
        }
    } catch (error) {
        console.error('Failed to load LINE notification setting:', error);
    }

    // 0. Check if it is Haifn branch to prevent LINE usage on ENOUGH_PLACE
    let isHaifnBranch = false;
    try {
        let locId = location?.id;
        let locName = location?.name || '';
        let groupId = location?.group_id;

        if (locId && (!groupId || !locName)) {
            const { data: loc } = await supabase
                .from('locations')
                .select('group_id, name')
                .eq('id', locId)
                .maybeSingle();
            if (loc) {
                groupId = loc.group_id;
                if (loc.name) locName = loc.name;
            }
        }

        if (groupId) {
            const { data: grp } = await supabase
                .from('location_groups')
                .select('name')
                .eq('id', groupId)
                .maybeSingle();
            if (grp?.name) {
                const grpName = grp.name;
                if (grpName.includes('하이픈') || grpName.includes('HAIFN') || grpName.includes('강동')) {
                    isHaifnBranch = true;
                } else if (grpName.includes('이높') || grpName.includes('ENOUGH_PLACE') || grpName.includes('강서')) {
                    isHaifnBranch = false;
                }
            }
        }

        if (locName.includes('하이픈') || locName.includes('HAIFN') || locName.includes('강동')) {
            isHaifnBranch = true;
        }
        if (locName.includes('이높') || locName.includes('ENOUGH_PLACE') || locName.includes('강서')) {
            isHaifnBranch = false;
        }
    } catch (err) {
        console.error("Failed to check branch for notification:", err);
    }

    const timeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    let message = '';
    
    if (type === 'CHECKIN') {
        const isGuest = user.user_group === '게스트' || user.name?.includes('(guest)');
        if (isGuest) {
            const cleanName = user.name.replace('(guest)', '').trim();
            const cleanSchool = user.school || '-';
            const surveyText = metadata.survey 
                ? `\n🧭 방문 경로\n▪ ${metadata.survey.split(', ').join('\n▪ ')}` 
                : '';
            message = `[GUEST CHECK-IN]\n💌 ${cleanName}(${cleanSchool})님이 게스트로 ${location.name}에 방문했어요 (${timeStr})${surveyText}`;
        } else {
            const surveyText = metadata.survey 
                ? `\n▪ ${metadata.survey.split(', ').join('\n▪ ')}` 
                : '';
            message = `[CHECK-IN]\n💌 ${user.name}님이 ${location.name}에 방문했어요 (${timeStr})${surveyText}`;
        }
    } else if (type === 'CHECKOUT') {
        const isGuest = user.user_group === '게스트' || user.name?.includes('(guest)');
        const durationText = metadata.duration ? `\n🕑 ${metadata.duration} 이용` : '';
        const purposeText = metadata.purpose
            ? `\n▪ ${metadata.purpose.split(', ').join('\n▪ ')}`
            : '';
        if (isGuest) {
            const cleanName = user.name.replace('(guest)', '').trim();
            message = `[GUEST CHECK-OUT]\n💙 ${cleanName}님이 ${location.name}에서 퇴실했어요 (${timeStr})${durationText}${purposeText}`;
        } else {
            message = `[CHECK-OUT]\n💙 ${user.name}님이 ${location.name}에서 퇴실했어요 (${timeStr})${durationText}${purposeText}`;
        }
    } else {
        message = `🔔 [이동] ${user.name}님이 ${location.name}에 이동했습니다. (${timeStr})`;
    }

    if (serverIntegrationsEnabled()) {
        try {
            await dispatchServerNotification({
                message,
                sendLine: lineNotificationsEnabled && (type === 'CHECKIN' || type === 'CHECKOUT') && isHaifnBranch,
                sendSlack: false,
                lineTarget: 'haifn',
            });
        } catch (error) {
            console.error('Server notification dispatch failed:', error);
        }
        if (isHaifnBranch) {
            await dispatchVisitSlackAlert({ message, userId: user.id, eventType: type, locationName: location?.name || '' });
        }
        return;
    }

    if (isHaifnBranch) {
        await dispatchVisitSlackAlert({ message, userId: user.id, eventType: type, locationName: location?.name || '' });
    }

    console.log("sendRealtimeNotification diagnostic:", {
        hasLineToken: !!lineToken,
        hasLineGroupId: !!lineGroupId,
        hasGsWebhookUrl: !!gsWebhookUrl,
        discordWebhookUrl: !!discordWebhookUrl,
        isHaifnBranch,
        message
    });

    // 1. Send Discord Webhook
    if (discordWebhookUrl) {
        try {
            await fetch(discordWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: message })
            });
        } catch (e) {
            console.error("Failed to send Discord webhook:", e);
        }
    }

    // 2. Send LINE Message via Google Apps Script Webhook (For CHECKIN & CHECKOUT at Haifn branch)
    if (lineNotificationsEnabled && (type === 'CHECKIN' || type === 'CHECKOUT') && lineToken && lineGroupId && gsWebhookUrl && isHaifnBranch) {
        try {
            await fetch(gsWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'LINE_NOTIFY',
                    token: lineToken,
                    to: lineGroupId,
                    message: message
                })
            });
            console.log("LINE Notification fetch sent to Google Sheets Webhook successfully.");
        } catch (e) {
            console.error("Failed to send LINE notification:", e);
        }
    }
};

export const useKioskManager = (navigate) => {
    // Logic States
    const [locations, setLocations] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [matchingUsers, setMatchingUsers] = useState([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    // UI States
    const [pincode, setPincode] = useState('');
    const [status, setStatus] = useState('IDLE'); // IDLE, SCANNING, SELECTING, LOADING
    const [result, setResult] = useState(null); // { type, message, subMessage, color }
    const [showMasterPin, setShowMasterPin] = useState(false);
    const [showOptionsMenu, setShowOptionsMenu] = useState(false);
    const [masterPinInput, setMasterPinInput] = useState('');
    const [afterPinAction, setAfterPinAction] = useState(null); // 'SETTINGS' or 'EXIT'
    const [showSignupForm, setShowSignupForm] = useState(false);
    const [showGuestForm, setShowGuestForm] = useState(false);
    const [pendingKioskUser, setPendingKioskUser] = useState(null);
    const [pendingCheckoutUser, setPendingCheckoutUser] = useState(null);
    const [checkoutVisitDate, setCheckoutVisitDate] = useState('');
    const [checkoutHaifnMsg, setCheckoutHaifnMsg] = useState('');
    const [checkoutDuration, setCheckoutDuration] = useState('');

    // Checkin Survey States
    const [pendingCheckinFeedback, setPendingCheckinFeedback] = useState(null);
    const [surveySelections, setSurveySelections] = useState([]);
    const [checkinSurveyConfig, setCheckinSurveyConfig] = useState(null);

    // Scanner Settings
    const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) or 'user' (front)
    const [lastScan, setLastScan] = useState({ code: '', time: 0 });
    const [badges, setBadges] = useState([]);
    const [isBadgeSystemEnabled, setIsBadgeSystemEnabled] = useState(true);

    // 1. Initial Data Fetch
    useEffect(() => {
        const fetchLocs = async () => {
            const { data } = await supabase.from('locations').select('*').order('name');
            if (data) setLocations(data.filter(l => l.is_active !== false));
        };
        fetchLocs();

        const savedLoc = localStorage.getItem('kiosk_location');
        if (savedLoc) {
            try {
                setSelectedLocation(JSON.parse(savedLoc));
            } catch (e) {
                console.error("Failed to parse saved location", e);
            }
        }

        const fetchBadges = async () => {
            try {
                const { data: config } = await supabase
                    .from('notices')
                    .select('content')
                    .eq('category', 'SYSTEM')
                    .eq('title', 'BADGE_SYSTEM_CONFIG')
                    .maybeSingle();
                
                if (config?.content) {
                    const parsed = JSON.parse(config.content);
                    setIsBadgeSystemEnabled(parsed.enabled !== false);
                }
            } catch (e) {
                console.error("Failed to load BADGE_SYSTEM_CONFIG", e);
            }

            let { data: badgeData, error: badgeErr } = await supabase.from('badges').select('*');
            if (badgeErr) {
                const { data: fbData } = await supabase.from('challenges').select('*');
                badgeData = fbData;
            }
            if (badgeData) setBadges(badgeData);

            const { data: surveyData } = await supabase
                .from('notices')
                .select('content')
                .eq('category', 'SYSTEM')
                .eq('title', 'CHECKIN_SURVEY_CONFIG')
                .maybeSingle();
            
            if (surveyData?.content) {
                try {
                    const parsed = JSON.parse(surveyData.content);
                    setCheckinSurveyConfig(parsed);
                } catch (e) {
                    console.error("Failed to load CHECKIN_SURVEY_CONFIG", e);
                }
            }
        };
        fetchBadges();

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleSetLocation = (loc) => {
        setSelectedLocation(loc);
        localStorage.setItem('kiosk_location', JSON.stringify(loc));
    };

    const resetLocation = () => {
        setAfterPinAction('SETTINGS');
        setShowMasterPin(true);
    };

    const handleMasterPinSubmit = (pin) => {
        const master = localStorage.getItem('kiosk_master_pin') || '1801';
        if (pin === master) {
            if (afterPinAction === 'SETTINGS') {
                setShowOptionsMenu(true);
            } else if (afterPinAction === 'EXIT') {
                navigate('/');
            }
            setShowMasterPin(false);
            setMasterPinInput('');
        } else {
            alert('핀 번호가 일치하지 않습니다.');
            setMasterPinInput('');
        }
    };

    const handleResetLocation = () => {
        localStorage.removeItem('kiosk_location');
        setSelectedLocation(null);
        setShowOptionsMenu(false);
        resetState();
    };

    const processKioskAction = async (user) => {
        if (!selectedLocation) return;

        // Check for terms agreement
        const isGuest = user.user_group === '게스트';
        if (!isGuest && (!user.preferences?.terms_agreed || user.preferences?.terms_version !== TERMS_VERSION)) {
            setPendingKioskUser(user);
            setStatus('REQUIRE_TERMS_AGREEMENT');
            return;
        }

        const { getKSTDateString } = await import('../utils/dateUtils');
        const kstDateStr = getKSTDateString(new Date());
        const kstOffset = 9 * 60 * 60 * 1000; // UTC+9
        const nowKST = new Date(new Date().getTime() + kstOffset);
        const startKST = new Date(nowKST);
        startKST.setUTCHours(0, 0, 0, 0);
        const startUTC = new Date(startKST.getTime() - kstOffset);
        const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000 - 1);
        const kstStartISO = startUTC.toISOString();
        const kstEndISO = endUTC.toISOString();

        const currentBackgroundStatus = status;
        setStatus('LOADING');

        try {
            // A. Use the same visit state as QR and mobile screens so a late
            // scan after 22:00 cannot be interpreted as a new check-in.
            const visitState = await getTodayVisitState(user.id);
            let nextType = 'CHECKIN';
            if (visitState.status === 'AUTO_CHECKED_OUT') {
                nextType = 'CHECKOUT';
            } else if (visitState.status === 'ACTIVE') {
                nextType = visitState.locationId === selectedLocation.id ? 'CHECKOUT' : 'MOVE';
            }

            // B. Stats Calculation (only on CHECKIN)
            let streakCount = 0;
            let isFirstToday = false;
            let activeProgram = null;
            let activeBadge = null;
            let totalVisitCount = 0;

            if (nextType === 'CHECKIN') {
                // 1. Streak Calculation (Consecutive days including today)
                const { data: recentLogs } = await supabase
                    .from('logs')
                    .select('created_at')
                    .eq('user_id', user.id)
                    .eq('type', 'CHECKIN')
                    .order('created_at', { ascending: false });

                if (recentLogs && recentLogs.length > 0) {
                    let currentStreak = 1;
                    let lastDate = new Date();
                    lastDate.setHours(0, 0, 0, 0);

                    const uniqueDates = [...new Set(recentLogs.map(l => new Date(l.created_at).toDateString()))];

                    for (let i = 1; i < uniqueDates.length; i++) {
                        const prevDateStr = uniqueDates[i];
                        const currDateStr = uniqueDates[i - 1];

                        if (isConsecutiveWorkingDay(prevDateStr, currDateStr)) {
                            currentStreak++;
                        } else {
                            break;
                        }
                    }
                    streakCount = currentStreak;
                }

                // 2. First-in Recognition (Today, this location - KST base)
                const { count: todayLogsCount } = await supabase
                    .from('logs')
                    .select('*', { count: 'exact', head: true })
                    .eq('location_id', selectedLocation.id)
                    .eq('type', 'CHECKIN')
                    .gte('created_at', kstStartISO)
                    .lte('created_at', kstEndISO);

                if (todayLogsCount === 0) isFirstToday = true;

                // 3. Smart Check-in (Automatic Program Attendance Integration)
                const kstToday = getKSTDateString(new Date()); // 'YYYY-MM-DD'
                const { data: allNoticesToday } = await supabase
                    .from('notices')
                    .select('id, title, program_date')
                    .eq('category', 'PROGRAM');

                const todayPrograms = (allNoticesToday || []).filter(p => {
                    if (!p.program_date) return false;
                    const datePart = p.program_date.slice(0, 10);
                    return datePart === kstToday;
                });

                if (todayPrograms.length > 0) {
                    const programIds = todayPrograms.map(p => p.id);
                    const { data: myRsvps } = await supabase
                        .from('notice_responses')
                        .select('notice_id')
                        .eq('user_id', user.id)
                        .in('notice_id', programIds)
                        .eq('status', 'JOIN');

                    if (myRsvps && myRsvps.length > 0) {
                        const matchedNoticeIds = myRsvps.map(r => r.notice_id);
                        activeProgram = todayPrograms.find(p => p.id === matchedNoticeIds[0]);

                        await supabase
                            .from('notice_responses')
                            .update({ is_attended: true })
                            .in('notice_id', matchedNoticeIds)
                            .eq('user_id', user.id);
                    }
                }

                // 4. Milestone Check (Total History)
                const { count: fetchedTotalVisitCount } = await supabase
                    .from('logs')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('type', 'CHECKIN');

                totalVisitCount = fetchedTotalVisitCount || 0;

                const { count: totalPrgCount } = await supabase
                    .from('notice_responses')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('is_attended', true);

                const currentVisitCount = totalVisitCount + 1;
                const currentPrgCount = totalPrgCount || 0;

                const visitBadge = (nextType === 'CHECKIN' && isBadgeSystemEnabled)
                    ? badges.find(b => b.type === 'VISIT' && b.threshold === currentVisitCount)
                    : null;
                const prgBadge = (activeProgram && isBadgeSystemEnabled)
                    ? badges.find(b => b.type === 'PROGRAM' && b.threshold === currentPrgCount)
                    : null;

                if (visitBadge || prgBadge) {
                    activeBadge = visitBadge || prgBadge;
                }
            }

            // Check if it is Haifn branch early
            let isHaifnBranch = false;
            if (selectedLocation?.group_id) {
                const { data: grp } = await supabase
                    .from('location_groups')
                    .select('name')
                    .eq('id', selectedLocation.group_id)
                    .maybeSingle();
                if (grp && (grp.name.includes('하이픈') || grp.name.includes('HAIFN') || grp.name.includes('강동'))) {
                    isHaifnBranch = true;
                }
            }

            // C. Record one idempotent visit event.
            const visitWrite = await recordVisitEvent({
                userId: user.id,
                locationId: selectedLocation.id,
                type: nextType,
            });
            if (!['CREATED', 'RECONCILED'].includes(visitWrite.outcome)) {
                throw new Error('이미 처리된 방문 상태입니다. 화면을 다시 확인해주세요.');
            }

            // Send real-time notification (Delay for checkin-survey or checkout-purpose)
            const shouldDelayNotification = nextType === 'CHECKOUT' || (nextType === 'CHECKIN' && isHaifnBranch);
            if (!shouldDelayNotification) {
                sendRealtimeNotification(user, nextType, selectedLocation);
            }

            // D. If guest user checking in, also insert GUEST_ENTRY for statistics
            if (nextType === 'CHECKIN' && user.user_group === '게스트') {
                await supabase.from('logs').insert([{
                    user_id: user.id,
                    location_id: selectedLocation.id,
                    type: 'GUEST_ENTRY'
                }]);
            }

            // Point settlement is centralized in recordVisitEvent so QR,
            // admin, guest and kiosk visits all use the same rules.
            const pointSettlement = visitWrite.pointSettlement;
            const earnedCheckinMsg = nextType === 'CHECKIN'
                && pointSettlement?.adjustments?.VISIT?.delta > 0
                ? ' (+1 하이픈)'
                : '';

            // D. Set Feedback Content
            let msg = `${user.name}님 반가워요 👋`;
            let sub = '입실 완료';
            let color = 'bg-green-500';
            let isFirstEver = (totalVisitCount || 0) === 0;

            if (nextType === 'MOVE') {
                msg = `${selectedLocation.name} 장소로 이동🚀`;
                sub = '이동 완료';
                color = 'bg-blue-600';
            } else if (nextType === 'CHECKOUT') {
                const durationMinutes = Math.max(1, pointSettlement?.entitlement?.longestCompletedStayMinutes || 1);
                const hours = Math.floor(durationMinutes / 60);
                const mins = durationMinutes % 60;
                setCheckoutDuration(hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`);
                const earnedMsg = pointSettlement?.adjustments?.STAY?.delta > 0
                    ? '🎉 1시간 이상 체류하여 1 하이픈이 적립되었습니다!'
                    : '';

                // Intercept Checkout to ask for purpose
                setPendingCheckoutUser(user);
                setCheckoutVisitDate(getKSTDateString(new Date()));
                setCheckoutHaifnMsg(earnedMsg);
                setStatus('REQUIRE_PURPOSE');
                setPincode('');
                setMatchingUsers([]);
                return; // Wait for purpose selection
            }

            if (nextType === 'CHECKIN') {
                if (isFirstEver) {
                    msg = `첫 방문을 환영합니다! 🎊`;
                    sub = `${user.name}님, SCI CENTER에 오신 것을 환영해요!`;
                    color = 'bg-indigo-600';

                    try {
                        confetti({
                            particleCount: 150,
                            spread: 70,
                            origin: { y: 0.6 },
                            colors: ['#2563eb', '#4f46e5', '#f59e0b', '#10b981', '#ef4444']
                        });
                    } catch (cErr) {
                        console.error('Confetti error:', cErr);
                    }
                } else if (activeProgram) {
                    sub = `잠시 후 [${activeProgram.title}] 시작! 📅`;
                } else if (streakCount > 1) {
                    sub = `${streakCount}일 연속 출석 중! 🔥`;
                }
                
                if (earnedCheckinMsg) {
                    sub += earnedCheckinMsg;
                }

                if (isHaifnBranch) {
                    // Intercept CHECKIN to ask survey
                    setPendingKioskUser(user);
                    setPendingCheckinFeedback({
                        msg, sub, color, streakCount, activeBadge, isFirstEver, activeProgram
                    });
                    setStatus('SHOW_SURVEY');
                    setPincode('');
                    setMatchingUsers([]);
                    return;
                }
            }

            setResult({
                type: 'SUCCESS',
                message: activeBadge ? `축하해요! [${activeBadge.name}] 획득!` : msg,
                subMessage: activeBadge ? '새로운 뱃지를 획득하셨습니다✨' : sub,
                color: activeBadge ? 'bg-yellow-500' : color,
                streak: streakCount > 1 ? streakCount : null,
                isFirst: isFirstEver,
                program: activeProgram,
                badge: activeBadge
            });

            setStatus('IDLE');
            setPincode('');
            setMatchingUsers([]);

            const delay = (isFirstToday || activeProgram || streakCount > 1 || activeBadge) ? 3000 : 800;
            setTimeout(() => {
                setResult(null);
            }, delay);

        } catch (err) {
            console.error('Kiosk Action Error:', err);
            setResult({
                type: 'ERROR',
                message: '처리 오류',
                subMessage: err.message || '다시 시도해 주세요.',
                color: 'bg-red-500'
            });
            setStatus('IDLE');
            setPincode('');
            setTimeout(() => setResult(null), 2000);
        }
    };

    const handleKioskTermsAgree = async () => {
        if (!pendingKioskUser) return;

        try {
            const updatedPreferences = {
                ...(pendingKioskUser.preferences || {}),
                terms_agreed: true,
                terms_version: TERMS_VERSION
            };
            const { error } = await supabase
                .from('users')
                .update({ preferences: updatedPreferences })
                .eq('id', pendingKioskUser.id);

            if (error) throw error;

            const userWithTerms = { ...pendingKioskUser, preferences: updatedPreferences };
            setPendingKioskUser(null);
            await processKioskAction(userWithTerms);
        } catch (err) {
            console.error('Kiosk Terms Agree Error:', err);
            setResult({
                type: 'ERROR',
                message: '인증 실패',
                subMessage: err.message || '약관 동의 처리 중 오류가 발생했습니다.',
                color: 'bg-red-500'
            });
            setStatus('IDLE');
            setTimeout(() => setResult(null), 2000);
        }
    };

    const handleCheckoutPurpose = async (purposes) => {
        // Validation check for required data
        if (!pendingCheckoutUser || !checkoutVisitDate) {
            console.error('Missing data for checkout purpose:', { pendingCheckoutUser, checkoutVisitDate });
            setResult({
                type: 'ERROR',
                message: '데이터 유실',
                subMessage: '사용자 정보가 확인되지 않습니다. 처음부터 다시 시도해주세요.',
                color: 'bg-red-500'
            });
            setTimeout(() => resetState(), 2000);
            return;
        }

        try {
            setStatus('LOADING');
            const purposeString = purposes.join(', ');

            // Attempt to save the visit purpose
            const { error } = await supabase.from('visit_notes').upsert({
                user_id: pendingCheckoutUser.id,
                visit_date: checkoutVisitDate,
                purpose: purposeString,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,visit_date' });

            if (error) throw error;

            // Trigger the delayed checkout LINE notification
            sendRealtimeNotification(pendingCheckoutUser, 'CHECKOUT', selectedLocation, {
                duration: checkoutDuration,
                purpose: purposeString
            });

            // 1. Fetch branch name
            let branchKorean = '센터';
            if (selectedLocation?.group_id) {
                const { data: grp } = await supabase
                    .from('location_groups')
                    .select('name')
                    .eq('id', selectedLocation.group_id)
                    .maybeSingle();
                if (grp?.name) {
                    if (grp.name.includes('하이픈') || grp.name.includes('HAIFN') || grp.name.includes('강동')) {
                        branchKorean = '하이픈';
                    } else if (grp.name.includes('이높플레이스') || grp.name.includes('ENOUGH_PLACE') || grp.name.includes('이높') || grp.name.includes('강서')) {
                        branchKorean = '이높플레이스';
                    } else {
                        branchKorean = grp.name;
                    }
                }
            }

            // 2. Fetch today's earned points
            const now = new Date();
            const kstOffset = 9 * 60 * 60 * 1000;
            const kstTodayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const kstStartISO = new Date(kstTodayStart.getTime() - kstOffset).toISOString();
            const kstEndISO = new Date(kstTodayStart.getTime() + (24 * 60 * 60 * 1000) - 1 - kstOffset).toISOString();

            const { data: todayTxs } = await supabase
                .from('haifn_transactions')
                .select('amount')
                .eq('user_id', pendingCheckoutUser.id)
                .eq('transaction_type', 'EARN')
                .gte('created_at', kstStartISO)
                .lte('created_at', kstEndISO);
            const todayEarned = todayTxs ? todayTxs.reduce((sum, tx) => sum + tx.amount, 0) : 0;

            // 3. Fetch cumulative points balance
            const { data: allTxs } = await supabase
                .from('haifn_transactions')
                .select('amount')
                .eq('user_id', pendingCheckoutUser.id);
            const balance = allTxs ? allTxs.reduce((sum, tx) => sum + tx.amount, 0) : 0;

            // 4. Fetch operating hours config
            const { data: opData } = await supabase
                .from('notices')
                .select('content')
                .eq('category', 'SYSTEM')
                .eq('title', 'OPERATING_HOURS_CONFIG')
                .maybeSingle();
            const operatingHours = opData?.content ? JSON.parse(opData.content) : null;

            // 5. Fetch schedules for the current week to check special closures
            const dayOfToday = now.getDay();
            const diff = now.getDate() - dayOfToday + (dayOfToday === 0 ? -6 : 1);
            const monday = new Date(now.setDate(diff));
            monday.setHours(0,0,0,0);

            const weekEnd = new Date(monday);
            weekEnd.setDate(monday.getDate() + 7);
            const { data: schData } = await supabase
                .from('admin_schedules')
                .select('*')
                .gte('start_date', monday.toISOString())
                .lte('start_date', weekEnd.toISOString());
            const weeklySchedules = schData || [];

            const { data: catData } = await supabase
                .from('calendar_categories')
                .select('*');
            const calendarCategories = catData || [];

            const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
            const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            const openDays = [];

            for (let i = 0; i < 7; i++) {
                const targetDate = new Date(monday);
                targetDate.setDate(monday.getDate() + i);
                
                const isClosed = weeklySchedules.some(sch => {
                    const cat = calendarCategories.find(c => c.id === sch.category_id);
                    if (cat?.name !== '휴관') return false;

                    const start = new Date(sch.start_date);
                    start.setHours(0,0,0,0);
                    const end = new Date(sch.end_date);
                    end.setHours(23,59,59,999);

                    if (targetDate >= start && targetDate <= end) {
                        let closedSpaces = [];
                        try {
                            const parsed = JSON.parse(sch.content);
                            if (parsed && typeof parsed === 'object' && parsed.closed_spaces) {
                                closedSpaces = parsed.closed_spaces;
                            }
                        } catch (e) {}

                        if (branchKorean === '하이픈') {
                            return closedSpaces.includes('HAIFN');
                        } else if (branchKorean === '이높플레이스') {
                            return closedSpaces.includes('ENOUGH_PLACE') || closedSpaces.includes('ENOUGH_PLACE');
                        }
                        return true;
                    }
                    return false;
                });

                if (!isClosed) {
                    const dayOfWeekStr = dayKeys[i];
                    const spaceHours = operatingHours
                        ? (operatingHours[branchKorean] || (operatingHours.monday ? operatingHours : null))
                        : null;
                    const dayConfig = spaceHours ? spaceHours[dayOfWeekStr] : null;
                    if (dayConfig && dayConfig.isOpen) {
                        openDays.push(dayNames[i]);
                    }
                }
            }

            const openDaysListText = openDays.length > 0 ? openDays.join(', ') : '';

            setResult({
                type: 'SUCCESS',
                message: `${pendingCheckoutUser.name}님 다음에 또 만나요!`,
                todayEarned: todayEarned,
                balance: balance,
                openDaysText: openDaysListText || '없음',
                footerMsg: `${branchKorean}에서 함께하는 기쁨을 나눠요💙`,
                color: 'bg-indigo-600'
            });

            // Reset all kiosk states
            setPendingCheckoutUser(null);
            setCheckoutVisitDate('');
            setCheckoutHaifnMsg('');
            setStatus('IDLE');
            setPincode('');
            setMatchingUsers([]);
            setTimeout(() => setResult(null), 5000);

        } catch (err) {
            console.error('Checkout Purpose Error:', err);
            setResult({
                type: 'ERROR',
                message: '내용 저장 실패',
                subMessage: '퇴실 처리에 오류가 발생했습니다. (내용: ' + (err.message || 'Unknown') + ')',
                color: 'bg-red-500'
            });
            setTimeout(() => {
                setResult(null);
                setStatus('IDLE');
            }, 3000);
        }
    };

    const handleSurveySubmit = async (selections) => {
        if (!pendingKioskUser || !selectedLocation) {
            console.error('Missing data for checkin survey submit:', { pendingKioskUser, selectedLocation });
            resetState();
            return;
        }

        try {
            setStatus('LOADING');

            // Save survey selections to checkin_surveys table (gracefully handle missing table/network errors)
            if (selections && selections.length > 0) {
                try {
                    const { error } = await supabase.from('checkin_surveys').insert([{
                        user_id: pendingKioskUser.id,
                        location_id: selectedLocation.id,
                        selections: selections
                    }]);
                    if (error) {
                        console.error('Database checkin_surveys insert warning:', error.message);
                    }
                } catch (dbErr) {
                    console.error('Failed to log checkin survey to database:', dbErr);
                }
            }

            // Trigger the delayed check-in LINE notification with survey selections (mapped to labels)
            let surveyLabels = [];
            if (selections && selections.length > 0) {
                if (checkinSurveyConfig && checkinSurveyConfig.options) {
                    surveyLabels = selections.map(id => {
                        const opt = checkinSurveyConfig.options.find(o => String(o.id) === String(id));
                        return opt ? opt.label : id;
                    });
                } else {
                    surveyLabels = selections;
                }
            }
            const surveyString = surveyLabels.join(', ');
            sendRealtimeNotification(pendingKioskUser, 'CHECKIN', selectedLocation, {
                survey: surveyString
            });

            // Load feedback result calculated during processKioskAction
            const { msg, sub, color, streakCount, activeBadge, isFirstEver, activeProgram } = pendingCheckinFeedback || {};

            setResult({
                type: 'SUCCESS',
                message: activeBadge ? `축하해요! [${activeBadge.name}] 획득!` : msg,
                subMessage: activeBadge ? '새로운 뱃지를 획득하셨습니다✨' : sub,
                color: activeBadge ? 'bg-yellow-500' : color,
                streak: streakCount > 1 ? streakCount : null,
                isFirst: isFirstEver,
                program: activeProgram,
                badge: activeBadge
            });

            setSurveySelections(selections);
            setStatus('SHOW_RECOMMENDATIONS');
            setPincode('');
            setMatchingUsers([]);

        } catch (err) {
            console.error('Survey submit error:', err);
            setResult({
                type: 'ERROR',
                message: '저장 실패',
                subMessage: err.message || '설문 저장 중 오류가 발생했습니다.',
                color: 'bg-red-500'
            });
            setStatus('IDLE');
            setTimeout(() => resetState(), 2000);
        }
    };

    const handleVerifyNumeric = useCallback(async (code) => {
        if (code.length !== 4) return;
        const currentBackgroundStatus = status;
        setStatus('LOADING');

        try {

            const { data, error } = await supabase
                .from('users')
                .select('id, name, school, phone_back4, preferences, user_group')
                .eq('phone_back4', code);

            if (error) throw error;

            if (!data || data.length === 0) {
                setResult({
                    type: 'ERROR',
                    message: '등록되지 않은 번호',
                    subMessage: '번호를 다시 확인해 주세요.',
                    color: 'bg-red-500'
                });
                setStatus(currentBackgroundStatus);
                setPincode('');
                setTimeout(() => setResult(null), 1500);
                return;
            }

            // [Refactor] Block Temporary Students from Kiosk
            const nonTempUsers = data.filter(u => !u.preferences?.is_temporary);
            
            if (nonTempUsers.length === 0) {
                setResult({
                    type: 'ERROR',
                    message: '등록 절차 필요',
                    subMessage: '정식 회원가입 후 이용 가능합니다.',
                    color: 'bg-amber-500'
                });
                setStatus(currentBackgroundStatus);
                setPincode('');
                setTimeout(() => setResult(null), 2500);
                return;
            }

            if (nonTempUsers.length === 1) {
                await processKioskAction(nonTempUsers[0]);
            } else {
                setMatchingUsers(nonTempUsers);
                setStatus('SELECTING');
            }
        } catch (err) {
            console.error('Verify Numeric Error:', err);
            setResult({
                type: 'ERROR',
                message: '조회 실패',
                subMessage: err.message || '네트워크 상태를 확인해 주세요.',
                color: 'bg-red-500'
            });
            setStatus(currentBackgroundStatus);
            setTimeout(() => setResult(null), 1500);
        }
    }, [selectedLocation, status, pincode]);

    const handleNumberClick = (num) => {
        if (result || status === 'LOADING') return;
        if (pincode.length < 4) {
            const nextCode = pincode + num;
            setPincode(nextCode);
            if (nextCode.length === 4) {
                handleVerifyNumeric(nextCode);
            }
        }
    };

    const handleIdentifyUser = async (val) => {
        const currentBackgroundStatus = status;
        setStatus('LOADING');
        try {
            const { data: byId } = await supabase.from('users').select('*').eq('id', val).single();
            if (byId) {
                if (byId.preferences?.is_temporary) {
                    setResult({
                        type: 'ERROR',
                        message: '등록 절차 필요',
                        subMessage: '정식 회원가입 후 이용 가능합니다.',
                        color: 'bg-amber-500'
                    });
                    setStatus(currentBackgroundStatus);
                    setTimeout(() => setResult(null), 2500);
                    return;
                }
                await processKioskAction(byId);
            } else if (val.length === 4) {
                await handleVerifyNumeric(val);
            } else {
                throw new Error('인식 불가');
            }
        } catch (err) {
            console.error('Identify User Error:', err);
            setResult({
                type: 'ERROR',
                message: '인식 실패',
                subMessage: '올바른 QR 코드가 아닙니다.',
                color: 'bg-red-500'
            });
            setStatus(currentBackgroundStatus);
            setTimeout(() => setResult(null), 1500);
        }
    };

    const handleQrScan = (resultScan) => {
        if (result || status === 'LOADING') return;
        if (resultScan && resultScan[0]?.rawValue) {
            const val = resultScan[0].rawValue;
            const now = Date.now();
            if (val === lastScan.code && (now - lastScan.time < 5000)) return;
            setLastScan({ code: val, time: now });
            handleIdentifyUser(val);
        }
    };

    const resetState = () => {
        if (status === 'SHOW_SURVEY' && pendingKioskUser && selectedLocation) {
            sendRealtimeNotification(pendingKioskUser, 'CHECKIN', selectedLocation, { survey: '' });
        }
        setPincode('');
        setStatus('IDLE');
        setMatchingUsers([]);
        setResult(null);
        setCheckoutDuration('');
        setPendingCheckoutUser(null);
        setCheckoutVisitDate('');
        setCheckoutHaifnMsg('');
        setPendingKioskUser(null);
    };

    return {
        // State
        locations, selectedLocation, matchingUsers, currentTime, pincode, status, result,
        showMasterPin, showOptionsMenu, masterPinInput, showSignupForm, showGuestForm, facingMode, lastScan, badges,
        pendingKioskUser,
        // Setters
        setSelectedLocation, setPincode, setStatus, setResult,
        setShowMasterPin, setShowOptionsMenu, setMasterPinInput, setShowSignupForm, setShowGuestForm, setFacingMode, setLastScan, setAfterPinAction,
        setPendingKioskUser,
        // Handlers
        handleSetLocation, resetLocation, handleMasterPinSubmit, handleResetLocation,
        processKioskAction, handleVerifyNumeric, handleNumberClick, handleQrScan, handleIdentifyUser, resetState,
        handleKioskTermsAgree, handleCheckoutPurpose, handleSurveySubmit,
        // Checkin Survey States
        checkinSurveyConfig, surveySelections, pendingCheckinFeedback,
        // Missing states for checkout purpose
        pendingCheckoutUser, checkoutVisitDate
    };
};
