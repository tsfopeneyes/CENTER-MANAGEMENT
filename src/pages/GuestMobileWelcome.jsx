import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, User, School, ArrowRight, CheckCircle2, ChevronRight, X, LogOut, Clock, LogIn, Lock, AlertCircle, Phone, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase } from '../supabaseClient';
import { normalizeSchoolName } from '../utils/userUtils';
import { hashPassword } from '../utils/hashUtils';
import SignUpForm from '../components/auth/SignUpForm';
import { sendCheckinNotification } from '../utils/integrationUtils';

const VISIT_REASON_OPTIONS = [
    { id: '1', emoji: '👥', label: '친구 / 지인 추천' },
    { id: '2', emoji: '🏫', label: '학교 / 선생님 추천' },
    { id: '3', emoji: '📱', label: 'SNS / 포스터 / 홍보물' },
    { id: '4', emoji: '🚶', label: '지나가다가 궁금해서' }
];

const GuestMobileWelcome = ({ isQRCheckin = true }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const locParam = searchParams.get('loc');

    const [step, setStep] = useState('HOME'); // 'HOME' | 'FORM' | 'SUCCESS' | 'ACTIVE_CHECKIN' | 'CHECKOUT_SUCCESS'
    const [name, setName] = useState('');
    const [school, setSchool] = useState('');
    const [selectedReasons, setSelectedReasons] = useState(['친구 / 지인 추천']);
    const [customReason, setCustomReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSignupModal, setShowSignupModal] = useState(false);
    const [activeSession, setActiveSession] = useState(null);

    // Login Modal States
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [loginName, setLoginName] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginDuplicates, setLoginDuplicates] = useState([]);
    const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);

    const toggleReason = (label) => {
        setSelectedReasons(prev =>
            prev.includes(label)
                ? prev.filter(r => r !== label)
                : [...prev, label]
        );
    };

    // Helper: update last_web_login_at in preferences
    const updateWebSessionPreferences = async (currentUser) => {
        try {
            const nowIso = new Date().toISOString();
            const updatedPrefs = { ...(currentUser.preferences || {}), last_web_login_at: nowIso };
            await supabase.from('users').update({ preferences: updatedPrefs }).eq('id', currentUser.id);
            const updatedUser = { ...currentUser, preferences: updatedPrefs };

            if (currentUser.user_group === '관리자' || currentUser.role === 'admin') {
                localStorage.setItem('admin_user', JSON.stringify(updatedUser));
            } else {
                localStorage.setItem('user', JSON.stringify(updatedUser));
            }
            return updatedUser;
        } catch (e) {
            console.error('Failed to update web session preferences:', e);
            return currentUser;
        }
    };

    // Perform Auto Check-in & Navigate to Student Dashboard Home Tab (Only for QR Checkin)
    const performAutoCheckin = async (currentUser, targetLocParam, selectedPurposes = null) => {
        const defaultPurpose = dynamicSurveyOptions?.[0]?.label || '당 충전하며 쉬고 싶어요';
        const activePurposes = selectedPurposes && selectedPurposes.length > 0 ? selectedPurposes : [defaultPurpose];
        if (!currentUser?.id) return;
        try {
            // 1. Fetch location info
            const { data: locations } = await supabase.from('locations').select('*');
            let locObj = null;
            if (targetLocParam) {
                locObj = (locations || []).find(l =>
                    l.id === targetLocParam ||
                    l.name.includes(targetLocParam) ||
                    (targetLocParam === 'HAIFN' && l.name.includes('하이픈')) ||
                    (targetLocParam === 'ENOUGH_PLACE' && l.name.includes('이높플레이스'))
                );
            }
            if (!locObj) {
                locObj = (locations || []).find(l => l.name.includes('하이픈')) || locations?.[0] || { id: null, name: '하이픈' };
            }

            // 2. Check if user already checked in today (within today KST)
            const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            const { data: existingLogs } = await supabase
                .from('logs')
                .select('id, created_at')
                .eq('user_id', currentUser.id)
                .eq('type', 'CHECKIN')
                .gte('created_at', `${todayKst}T00:00:00`)
                .order('created_at', { ascending: false })
                .limit(1);

            if (!existingLogs || existingLogs.length === 0) {
                await supabase.from('logs').insert([{
                    user_id: currentUser.id,
                    location_id: locObj.id,
                    type: 'CHECKIN'
                }]);

                sendCheckinNotification({
                    userName: currentUser.name,
                    schoolName: currentUser.school,
                    locationName: locObj.name,
                    isGuest: false,
                    purposes: activePurposes
                }).catch(e => console.error('Failed sendCheckinNotification:', e));
            }

            // 3. Save visit notes for Admin Dashboard
            try {
                const { data: existingNote } = await supabase
                    .from('visit_notes')
                    .select('id')
                    .eq('user_id', currentUser.id)
                    .eq('visit_date', todayKst)
                    .maybeSingle();

                if (existingNote?.id) {
                    await supabase.from('visit_notes').update({
                        remarks: '모바일 QR 체크인'
                    }).eq('id', existingNote.id);
                } else {
                    await supabase.from('visit_notes').insert([{
                        user_id: currentUser.id,
                        visit_date: todayKst,
                        remarks: '모바일 QR 체크인'
                    }]);
                }
            } catch (vErr) {
                console.error('Failed to save visit notes in auto checkin:', vErr);
            }

            // 4. Track web session time in user preferences
            const updatedUser = await updateWebSessionPreferences(currentUser);

            // 5. Set toast & survey signals, then navigate to student dashboard
            sessionStorage.removeItem('pending_checkin_survey');
            sessionStorage.setItem('checkin_toast', JSON.stringify({
                name: updatedUser.name,
                locationName: locObj.name,
                time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
            }));

            navigate('/student', { replace: true, state: { checkinToastOnly: true, userName: updatedUser.name, locationName: locObj.name } });
        } catch (err) {
            console.error('Auto check-in failed:', err);
            navigate('/student', { replace: true });
        }
    };

    const DEFAULT_CHECKIN_OPTIONS = [
        { id: '1', emoji: '🍽️', label: '당 충전하며 쉬고 싶어요', sub: '간식 먹고 편안하게 쉬어가기' },
        { id: '2', emoji: '🎲', label: '아무 생각 없이 놀고 싶어요', sub: '보드게임 및 자유 놀이' },
        { id: '3', emoji: '☕', label: '누군가와 이야기하고 싶어요', sub: '선생님이나 친구와 대화 나누기' },
        { id: '4', emoji: '🙏', label: '기도하거나 예배하고 싶어요', sub: '조용한 방에서 기도와 묵상' },
        { id: '5', emoji: '📚', label: '조용히 집중하고 싶어요', sub: '해야 하는 공부나 할 일에 집중' },
        { id: '6', emoji: '🤷', label: '아직 잘 모르겠어요', sub: '센터에 들어와서 천천히 정하기' }
    ];

    const [selectedPurposes, setSelectedPurposes] = useState([DEFAULT_CHECKIN_OPTIONS[0].label]);
    const [activeUserForSurvey, setActiveUserForSurvey] = useState(null);
    const [surveyQuestion, setSurveyQuestion] = useState('오늘 센터에서 무엇을 하고 싶나요?');
    const [dynamicSurveyOptions, setDynamicSurveyOptions] = useState(DEFAULT_CHECKIN_OPTIONS);
    const [isRedirecting, setIsRedirecting] = useState(false);

    useEffect(() => {
        const fetchSurveyConfig = async () => {
            try {
                const { data } = await supabase
                    .from('notices')
                    .select('content')
                    .eq('category', 'SYSTEM')
                    .eq('title', 'CHECKIN_SURVEY_CONFIG')
                    .maybeSingle();

                if (data?.content) {
                    const parsed = JSON.parse(data.content);
                    if (parsed.question) setSurveyQuestion(parsed.question);
                    if (parsed.options && parsed.options.length > 0) {
                        setDynamicSurveyOptions(parsed.options);
                        setSelectedPurposes([parsed.options[0].label]);
                    }
                }
            } catch (e) {
                console.error('Failed to fetch checkin survey config:', e);
            }
        };
        fetchSurveyConfig();
    }, []);

    const getSafeKSTDate = () => {
        const now = new Date();
        const kstDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 60 * 60 * 1000));
        const y = kstDate.getFullYear();
        const m = String(kstDate.getMonth() + 1).padStart(2, '0');
        const d = String(kstDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const ensureCheckinLogAndNavigate = useCallback(async (currentUser) => {
        try {
            const todayKst = getSafeKSTDate();

            const { data: locations } = await supabase.from('locations').select('*');
            let locObj = null;
            if (locParam) {
                locObj = (locations || []).find(l =>
                    l.id === locParam ||
                    l.name.includes(locParam) ||
                    (locParam === 'HAIFN' && l.name.includes('하이픈')) ||
                    (locParam === 'ENOUGH_PLACE' && l.name.includes('이높플레이스'))
                );
            }
            if (!locObj) {
                locObj = (locations || []).find(l => l.name.includes('하이픈')) || locations?.[0] || { id: null, name: '하이픈' };
            }

            const { data: insertedLogs } = await supabase.from('logs').insert([{
                user_id: currentUser.id,
                location_id: locObj.id,
                type: 'CHECKIN'
            }]).select('id, created_at');

            sendCheckinNotification({
                userName: currentUser.name,
                schoolName: currentUser.school,
                locationName: locObj.name,
                isGuest: false
            }).catch(e => console.error('Failed sendCheckinNotification:', e));

            const insertedLog = insertedLogs?.[0];

            try {
                await supabase.from('visit_notes').insert([{
                    user_id: currentUser.id,
                    visit_date: todayKst,
                    remarks: '모바일 QR 체크인'
                }]);
            } catch (vErr) {}

            sessionStorage.setItem('require_checkin_survey', 'true');
            if (insertedLog?.created_at) {
                sessionStorage.setItem('active_checkin_time', insertedLog.created_at);
            }

            updateWebSessionPreferences(currentUser).catch(() => {});
            navigate('/student', {
                replace: true,
                state: {
                    requireCheckinSurvey: true,
                    checkinTime: insertedLog?.created_at,
                    locationName: locObj.name
                }
            });
        } catch (err) {
            console.error('ensureCheckinLogAndNavigate error:', err);
            sessionStorage.setItem('require_checkin_survey', 'true');
            navigate('/student', { replace: true, state: { requireCheckinSurvey: true } });
        }
    }, [locParam, navigate]);

    // On mount effect
    useEffect(() => {

        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            try {
                const parsedUser = JSON.parse(savedUser);
                if (parsedUser?.id) {
                    const isAdmin = parsedUser.user_group === '관리자' || parsedUser.role === 'admin';
                    if (isAdmin) {
                        navigate('/admin', { replace: true });
                        return;
                    }

                    setIsRedirecting(true);
                    if (isQRCheckin) {
                        ensureCheckinLogAndNavigate(parsedUser);
                    } else {
                        // Normal Web App access: navigate straight to student dashboard
                        updateWebSessionPreferences(parsedUser);
                        navigate('/student', { replace: true });
                    }
                    return;
                }
            } catch (e) {
                console.error('Failed to parse saved user:', e);
            }
        }

        const savedAdmin = localStorage.getItem('admin_user');
        if (savedAdmin) {
            try {
                const parsedAdmin = JSON.parse(savedAdmin);
                if (parsedAdmin?.id) {
                    navigate('/admin', { replace: true });
                    return;
                }
            } catch (e) {}
        }

        // Check for active guest checkin session if not logged in
        const savedGuestSession = localStorage.getItem('guest_active_session');
        if (savedGuestSession) {
            try {
                const parsed = JSON.parse(savedGuestSession);
                const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
                if (parsed.date === todayKst && parsed.userId) {
                    setActiveSession(parsed);
                    setStep('ACTIVE_CHECKIN');
                } else {
                    localStorage.removeItem('guest_active_session');
                }
            } catch (e) {
                console.error('Failed to parse guest active session', e);
            }
        }
    }, [isQRCheckin, locParam, navigate, ensureCheckinLogAndNavigate]);

    // Trigger confetti on guest success
    useEffect(() => {
        if (step === 'SUCCESS') {
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
    }, [step]);

    // Login Handler
    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        if (!loginName.trim() || !loginPassword.trim()) {
            alert('이름과 비밀번호를 모두 입력해주세요.');
            return;
        }

        setLoginLoading(true);
        try {
            const hashedPassword = await hashPassword(loginPassword);

            let { data: candidates, error: rpcError } = await supabase
                .rpc('get_login_candidates', { p_name: loginName.trim() });

            if (rpcError) throw rpcError;

            if (!candidates || candidates.length === 0) {
                const { data: guestCandidates } = await supabase
                    .rpc('get_login_candidates', { p_name: `${loginName.trim()}(guest)` });

                if (guestCandidates && guestCandidates.length > 0) {
                    candidates = guestCandidates;
                } else {
                    alert('가입된 이름이 없습니다. 이름을 다시 확인해주세요.');
                    setLoginLoading(false);
                    return;
                }
            }

            if (candidates.length === 1) {
                await attemptLoginAuth(candidates[0], hashedPassword, loginPassword);
            } else {
                setLoginDuplicates(candidates);
                setShowDuplicatesModal(true);
            }
        } catch (err) {
            console.error('Login submit error:', err);
            alert('로그인 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
        } finally {
            setLoginLoading(false);
        }
    };

    const attemptLoginAuth = async (userCandidate, hashedPw, rawPassword) => {
        try {
            let matchedUser = null;

            const { data: dbUser } = await supabase
                .from('users')
                .select('*')
                .eq('id', userCandidate.id)
                .maybeSingle();

            const fullUser = dbUser ? { ...userCandidate, ...dbUser } : userCandidate;

            if (fullUser && (fullUser.password === hashedPw || fullUser.password === rawPassword)) {
                matchedUser = fullUser;
            } else if (userCandidate?.email) {
                try {
                    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                        email: userCandidate.email,
                        password: rawPassword
                    });

                    if (!authError && authData?.user) {
                        matchedUser = fullUser;
                    }
                } catch (e) {
                    console.error('Supabase Auth attempt failed:', e);
                }
            }

            if (!matchedUser) {
                alert('비밀번호가 일치하지 않습니다. 다시 확인해 주세요.');
                return false;
            }

            setShowLoginModal(false);

            // Handle Admin Login
            if (matchedUser.user_group === '관리자' || matchedUser.role === 'admin') {
                localStorage.setItem('admin_user', JSON.stringify(matchedUser));
                localStorage.setItem('user', JSON.stringify(matchedUser));
                updateWebSessionPreferences(matchedUser).catch(() => {});
                navigate('/admin', { replace: true });
                return true;
            }

            // Handle Student Login
            localStorage.setItem('user', JSON.stringify(matchedUser));

            if (isQRCheckin) {
                await ensureCheckinLogAndNavigate(matchedUser);
            } else {
                updateWebSessionPreferences(matchedUser).catch(() => {});
                navigate('/student', { replace: true });
            }
            return true;
        } catch (err) {
            console.error('Login auth error:', err);
            alert('로그인 시도 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
            return false;
        }
    };

    const handleDuplicateSelect = (selectedUser) => {
        setShowDuplicatesModal(false);
        hashPassword(loginPassword).then(hashedPw => {
            attemptLoginAuth(selectedUser, hashedPw, loginPassword);
        });
    };

    // Guest Check-in Submission
    const handleGuestCheckinSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim() || !school.trim()) {
            alert('이름과 학교명을 모두 입력해주세요.');
            return;
        }

        setLoading(true);
        try {
            const cleanName = name.trim();
            const cleanSchool = normalizeSchoolName(school.trim());
            const reasonBase = selectedReasons.length > 0 ? selectedReasons.join(', ') : '기타';
            const finalVisitReason = customReason.trim()
                ? `${reasonBase} (${customReason.trim()})`
                : reasonBase;

            // 1. Fetch Location Info
            const { data: locations } = await supabase.from('locations').select('*');
            const haifnLoc = (locations || []).find(l => l.name.includes('하이픈')) || locations?.[0] || { id: null, name: '하이픈' };

            // 2. Find or create guest user
            let guestUserId = null;
            try {
                const targetName = cleanName.includes('(guest)') ? cleanName : `${cleanName}(guest)`;
                const { data: existingGuest } = await supabase
                    .from('users')
                    .select('id')
                    .or(`name.eq.${cleanName},name.eq.${targetName}`)
                    .eq('school', cleanSchool)
                    .eq('user_group', '게스트')
                    .maybeSingle();

                if (existingGuest?.id) {
                    guestUserId = existingGuest.id;
                } else {
                    let uniquePhone = '';
                    let back4 = '';
                    let isUnique = false;
                    let retries = 0;
                    while (!isUnique && retries < 20) {
                        const candidate4 = Math.floor(1000 + Math.random() * 9000).toString();
                        const testPhone = `010-0000-${candidate4}`;
                        const { data: existing } = await supabase
                            .from('users')
                            .select('id')
                            .eq('phone', testPhone)
                            .maybeSingle();
                        if (!existing) {
                            uniquePhone = testPhone;
                            back4 = candidate4;
                            isUnique = true;
                        }
                        retries++;
                    }
                    if (!uniquePhone) {
                        back4 = Date.now().toString().slice(-4);
                        uniquePhone = `010-0000-${back4}`;
                    }

                    const { data: newGuest, error: createErr } = await supabase.from('users').insert([{
                        name: `${cleanName}(guest)`,
                        school: cleanSchool,
                        user_group: '게스트',
                        role: 'student',
                        status: 'approved',
                        password: '0000',
                        gender: 'M',
                        birth: '000000',
                        phone: uniquePhone,
                        phone_back4: back4,
                        memo: `[모바일 게스트 체크인: ${new Date().toLocaleDateString()}]`
                    }]).select('id').single();

                    if (createErr) {
                        console.error('Failed to insert new guest user:', createErr);
                    } else if (newGuest?.id) {
                        guestUserId = newGuest.id;
                    }
                }
            } catch (gErr) {
                console.error('Failed to create/lookup guest user:', gErr);
            }

            // 3. Insert CHECKIN log into logs table ONLY for QR checkin route
            if (isQRCheckin) {
                const { error: logErr } = await supabase.from('logs').insert([{
                    user_id: guestUserId,
                    location_id: haifnLoc.id,
                    type: 'CHECKIN'
                }]);
                if (logErr) throw logErr;
            }

            // 4. Save visit reason to visit_notes and checkin_surveys
            const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            if (guestUserId) {
                try {
                    const { data: existingNote } = await supabase
                        .from('visit_notes')
                        .select('id')
                        .eq('user_id', guestUserId)
                        .eq('visit_date', todayKst)
                        .maybeSingle();

                    if (existingNote?.id) {
                        await supabase.from('visit_notes').update({
                            remarks: '게스트 체크인'
                        }).eq('id', existingNote.id);
                    } else {
                        await supabase.from('visit_notes').insert([{
                            user_id: guestUserId,
                            visit_date: todayKst,
                            remarks: '게스트 체크인'
                        }]);
                    }

                    if (finalVisitReason) {
                        await supabase.from('checkin_surveys').insert([{
                            user_id: guestUserId,
                            selections: [finalVisitReason],
                            created_at: new Date().toISOString()
                        }]);
                    }
                } catch (vErr) {
                    console.error('Failed to save guest visit note/survey:', vErr);
                }
            }

            // Save active session locally
            const sessionData = {
                userId: guestUserId,
                name: cleanName,
                school: cleanSchool,
                checkInTime: new Date().toISOString(),
                locationId: haifnLoc.id,
                locationName: haifnLoc.name,
                date: todayKst
            };
            localStorage.setItem('guest_active_session', JSON.stringify(sessionData));
            setActiveSession(sessionData);

            // 5. Trigger Realtime LINE / Discord Notification
            const timeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
            const reasonListText = selectedReasons.length > 0
                ? selectedReasons.map(r => `▪ ${r}`).join('\n')
                : '▪ 기타';
            const customDetailText = customReason.trim()
                ? `\n📋 상세 내용\n▪ ${customReason.trim()}`
                : '';

            const alertMessage = `[GUEST CHECK-IN]\n💌 ${cleanName}(${cleanSchool})님이 게스트로 ${haifnLoc.name}에 방문했어요 (${timeStr})\n🧭 방문 경로\n${reasonListText}${customDetailText}`;

            try {
                const { data: settings } = await supabase.from('global_settings').select('*');
                let lineToken = '', lineGroupId = '', gsWebhookUrl = '', discordWebhookUrl = '';

                if (settings) {
                    settings.forEach(s => {
                        if (s.key === 'line_channel_access_token') lineToken = s.value;
                        if (s.key === 'line_group_id') lineGroupId = s.value;
                        if (s.key === 'gs_webhook_url') gsWebhookUrl = s.value;
                        if (s.key === 'discord_webhook_url') discordWebhookUrl = s.value;
                    });
                }

                const isHaifnLoc = haifnLoc && (
                    haifnLoc.name?.includes('하이픈') ||
                    haifnLoc.name?.includes('HAIFN') ||
                    haifnLoc.name?.includes('강동')
                ) && !(
                    haifnLoc.name?.includes('이높') ||
                    haifnLoc.name?.includes('ENOUGH_PLACE') ||
                    haifnLoc.name?.includes('강서')
                );

                if (isHaifnLoc && lineToken && lineGroupId && gsWebhookUrl) {
                    fetch(gsWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            action: 'LINE_NOTIFY',
                            token: lineToken,
                            to: lineGroupId,
                            message: alertMessage
                        })
                    }).catch(e => console.error('LINE Notify error:', e));
                }

                if (discordWebhookUrl) {
                    fetch(discordWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: alertMessage })
                    }).catch(e => console.error('Discord Notify error:', e));
                }
            } catch (notifyErr) {
                console.error('Notification dispatch error:', notifyErr);
            }

            setStep('SUCCESS');
        } catch (err) {
            console.error('Mobile Guest Checkin Error:', err);
            alert('체크인 처리 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
        } finally {
            setLoading(false);
        }
    };

    // Guest Checkout Submission
    const handleGuestCheckoutSubmit = async () => {
        if (!activeSession) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('logs').insert([{
                user_id: activeSession.userId,
                location_id: activeSession.locationId,
                type: 'CHECKOUT'
            }]);

            if (error) throw error;

            const timeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
            const alertMessage = `[GUEST CHECK-OUT]\n👋 ${activeSession.name}(${activeSession.school}) 게스트님이 ${activeSession.locationName} 공간에서 퇴실하셨어요 (${timeStr})`;

            try {
                const { data: settings } = await supabase.from('global_settings').select('*');
                let lineToken = '', lineGroupId = '', gsWebhookUrl = '', discordWebhookUrl = '';

                if (settings) {
                    settings.forEach(s => {
                        if (s.key === 'line_channel_access_token') lineToken = s.value;
                        if (s.key === 'line_group_id') lineGroupId = s.value;
                        if (s.key === 'gs_webhook_url') gsWebhookUrl = s.value;
                        if (s.key === 'discord_webhook_url') discordWebhookUrl = s.value;
                    });
                }

                const locName = activeSession.locationName || '';
                const isHaifnLoc = (locName.includes('하이픈') || locName.includes('HAIFN') || locName.includes('강동')) &&
                    !(locName.includes('이높') || locName.includes('ENOUGH_PLACE') || locName.includes('강서'));

                if (isHaifnLoc && lineToken && lineGroupId && gsWebhookUrl) {
                    fetch(gsWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            action: 'LINE_NOTIFY',
                            token: lineToken,
                            to: lineGroupId,
                            message: alertMessage
                        })
                    }).catch(e => console.error('LINE Notify error:', e));
                }

                if (discordWebhookUrl) {
                    fetch(discordWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: alertMessage })
                    }).catch(e => console.error('Discord Notify error:', e));
                }
            } catch (notifyErr) {
                console.error('Notification dispatch error:', notifyErr);
            }

            localStorage.removeItem('guest_active_session');
            setActiveSession(null);
            setStep('CHECKOUT_SUCCESS');
        } catch (err) {
            console.error('Mobile Guest Checkout Error:', err);
            alert('퇴실 처리 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
        } finally {
            setLoading(false);
        }
    };

    if (isRedirecting) {
        return (
            <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6 text-center select-none font-sans">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-gray-700 font-extrabold text-base tracking-tight mb-1">입실 체크인을 처리하고 있습니다...</p>
                <p className="text-gray-400 font-medium text-xs">잠시만 기다려 주세요 ✨</p>
            </div>
        );
    }

    return (
        <div className="h-screen bg-[#F8F9FA] text-[#191F28] flex flex-col justify-between relative overflow-hidden select-none font-sans bg-[radial-gradient(rgba(148,163,184,0.12)_1.5px,transparent_0)] bg-[size:32px_32px]">
            {/* Background Glow Accents */}
            <div className="absolute inset-0 overflow-hidden -z-10 pointer-events-none">
                <motion.div animate={{ scale: [1, 1.2, 1], x: [0, 30, 0] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute -top-32 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-gradient-to-b from-[#E63946]/10 to-orange-500/5 rounded-full blur-[100px]" />
                <motion.div animate={{ scale: [1.1, 1, 1.1], x: [0, -30, 0] }} transition={{ duration: 25, repeat: Infinity, ease: "linear" }} className="absolute -bottom-20 -right-20 w-80 h-80 bg-blue-500/5 rounded-full blur-[90px]" />
            </div>

            {/* Background Branding Typography */}
            <div className="absolute inset-0 overflow-hidden opacity-[0.035] z-0 select-none pointer-events-none flex flex-col justify-around rotate-[-12deg] scale-150 origin-center">
                {Array.from({ length: 8 }).map((_, rIdx) => (
                    <div
                        key={rIdx}
                        className={`text-[8vw] font-black uppercase tracking-[0.2em] whitespace-nowrap leading-none flex gap-12 ${rIdx % 2 === 0 ? 'justify-start' : 'justify-end'}`}
                        style={{ WebkitTextStroke: '2px #191F28' }}
                    >
                        {Array.from({ length: 6 }).map((_, cIdx) => (
                            <span key={cIdx}>SCI CENTER</span>
                        ))}
                    </div>
                ))}
            </div>

            {/* Header Brand */}
            <header className="px-6 pt-4 pb-0 relative z-10 flex items-center justify-between max-w-md mx-auto w-full shrink-0">
                <span className="font-black tracking-tight text-lg sm:text-xl text-[#191F28]">
                    SCHOOL CHURCH IMPACT
                </span>
                {isQRCheckin && (
                    <span className="text-[11px] font-bold px-2.5 py-1 bg-red-50 text-[#E63946] border border-red-100 rounded-full shrink-0">
                        QR 체크인 모드
                    </span>
                )}
            </header>

            {/* Main Content Areas */}
            <main className="flex-1 px-6 py-0 flex flex-col justify-center relative z-10 max-w-md mx-auto w-full overflow-hidden">
                <AnimatePresence mode="wait">
                    {step === 'HOME' && (
                        <motion.div
                            key="home"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -16 }}
                            transition={{ duration: 0.25 }}
                            className="space-y-7 my-auto"
                        >
                            {/* Welcome Typography Header */}
                            <div className="space-y-5">
                                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E63946]/10 text-[#E63946] text-[12px] font-bold">
                                    <Sparkles size={13} className="animate-pulse" />
                                    <span>Welcome to SCHOOL CHURCH IMPACT</span>
                                </div>

                                <h1 className="text-[30px] sm:text-[34px] font-black text-[#191F28] leading-[1.25] tracking-tight">
                                    SCI 센터에 오신 걸<br />
                                    <span className="text-[#E63946]">
                                        환영합니다!
                                    </span>
                                </h1>

                                <p className="text-[#4E5968] text-[14px] leading-[1.6] font-medium">
                                    SCI 센터는 일상 속 그리스도인을 꿈꾸는 모든 청소년을 위한 공간으로, 하나님과 이웃, 그리고 세상과의 연결을 지향합니다.
                                </p>

                                <p className="text-[#191F28] text-[14px] font-bold tracking-tight pt-0.5">
                                    원하시는 접속 방식을 선택해 주세요!
                                </p>
                            </div>

                            {/* Primary Action Buttons: 로그인 / 게스트(QR전용) / 센터 등록 */}
                            <div className="space-y-3 pt-1">
                                {/* 1. 로그인 (Primary Accent Button) */}
                                <button
                                    onClick={() => setShowLoginModal(true)}
                                    className="w-full h-14 px-6 bg-[#E63946] hover:bg-[#D62839] text-white font-bold rounded-2xl border-0 outline-none shadow-[0_8px_20px_-4px_rgba(230,57,70,0.35)] active:scale-[0.98] transition-all flex items-center justify-between group text-[16px] tracking-tight cursor-pointer"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <LogIn size={20} />
                                        <span>로그인</span>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                                        <ArrowRight size={18} className="text-white" />
                                    </div>
                                </button>

                                {/* 2. 게스트 (Secondary Slate Button - QR 체크인 접속 전용) */}
                                {isQRCheckin && (
                                    <button
                                        onClick={() => setStep('FORM')}
                                        className="w-full h-14 px-6 bg-[#EAECEF] hover:bg-[#DFE2E6] text-[#191F28] font-bold rounded-2xl border-0 outline-none active:scale-[0.98] transition-all flex items-center justify-between group text-[16px] tracking-tight cursor-pointer"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <User size={20} className="text-[#4E5968]" />
                                            <span>게스트</span>
                                        </div>
                                        <ChevronRight size={20} className="text-[#8B95A1] group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                )}

                                {/* 3. 센터 등록 (Sub Light Button) */}
                                <button
                                    onClick={() => setShowSignupModal(true)}
                                    className="w-full h-14 px-6 bg-white hover:bg-gray-50 text-[#4E5968] font-bold rounded-2xl border border-[#E5E8EB] outline-none active:scale-[0.98] transition-all flex items-center justify-between group text-[16px] tracking-tight shadow-xs cursor-pointer"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <School size={20} className="text-[#8B95A1]" />
                                        <span>센터 등록</span>
                                    </div>
                                    <ChevronRight size={20} className="text-[#8B95A1] group-hover:translate-x-0.5 transition-transform" />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* GUEST FORM STEP */}
                    {step === 'FORM' && (
                        <motion.div
                            key="form"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.25 }}
                            className="bg-white border border-[#E5E8EB] rounded-3xl p-6 shadow-xl space-y-4 my-auto max-h-[85vh] overflow-y-auto"
                        >
                            <div className="flex justify-between items-center border-b border-[#F2F4F6] pb-3">
                                <div>
                                    <h2 className="text-lg font-extrabold text-[#191F28]">게스트 방문 작성</h2>
                                    <p className="text-[12px] text-[#8B95A1] mt-0.5 font-medium">간단한 정보 입력 후 둘러보실 수 있어요</p>
                                </div>
                                <button onClick={() => setStep('HOME')} className="p-2 text-[#8B95A1] hover:text-[#191F28] rounded-full bg-[#F2F4F6]">
                                    <X size={18} />
                                </button>
                            </div>

                            <form onSubmit={handleGuestCheckinSubmit} className="space-y-4 pt-1">
                                <div>
                                    <label className="block text-[12px] font-bold text-[#4E5968] mb-1 ml-1">이름</label>
                                    <div className="relative">
                                        <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B95A1]" />
                                        <input
                                            type="text"
                                            required
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="이름을 입력해주세요"
                                            className="w-full pl-9 pr-3 py-2.5 bg-[#F9FAFB] border border-[#E5E8EB] rounded-xl text-[#191F28] placeholder-[#B0B8C1] outline-none focus:bg-white focus:border-[#E63946] font-bold text-sm"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[12px] font-bold text-[#4E5968] mb-1 ml-1">학교</label>
                                    <div className="relative">
                                        <School size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B95A1]" />
                                        <input
                                            type="text"
                                            required
                                            value={school}
                                            onChange={(e) => setSchool(e.target.value)}
                                            placeholder="학교 이름 (예: 하이픈고등학교)"
                                            className="w-full pl-9 pr-3 py-2.5 bg-[#F9FAFB] border border-[#E5E8EB] rounded-xl text-[#191F28] placeholder-[#B0B8C1] outline-none focus:bg-white focus:border-[#E63946] font-bold text-sm"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[12px] font-bold text-[#4E5968] mb-1 ml-1">
                                        방문 계기
                                    </label>
                                    <div className="space-y-2 mt-1.5">
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {VISIT_REASON_OPTIONS.map(opt => {
                                                const isSelected = selectedReasons.includes(opt.label);
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => toggleReason(opt.label)}
                                                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${isSelected ? 'bg-[#E63946]/10 border-[#E63946] text-[#E63946] font-bold' : 'bg-[#F9FAFB] border-[#E5E8EB] text-[#4E5968] hover:bg-white'}`}
                                                    >
                                                        <span className="text-base shrink-0">{opt.emoji}</span>
                                                        <span className="text-[11.5px] leading-snug font-medium line-clamp-1">{opt.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <input
                                            type="text"
                                            value={customReason}
                                            onChange={(e) => setCustomReason(e.target.value)}
                                            placeholder="상세 내용을 직접 적어주세요"
                                            className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E8EB] rounded-xl text-[#191F28] placeholder-[#B0B8C1] outline-none focus:bg-white focus:border-[#E63946] font-bold text-xs"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-14 bg-[#E63946] hover:bg-[#D62839] text-white font-bold rounded-2xl transition shadow-md shadow-[#E63946]/25 active:scale-[0.98] disabled:opacity-50 mt-3 text-[16px] tracking-tight flex items-center justify-center"
                                >
                                    {loading ? (isQRCheckin ? '체크인 처리 중...' : '접속 처리 중...') : (isQRCheckin ? '게스트 체크인 완료' : '게스트 접속')}
                                </button>
                            </form>
                        </motion.div>
                    )}

                    {/* ACTIVE GUEST CHECKIN VIEW */}
                    {step === 'ACTIVE_CHECKIN' && activeSession && (
                        <motion.div
                            key="active_checkin"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.25 }}
                            className="bg-white border border-[#E5E8EB] rounded-3xl p-6 shadow-xl space-y-6 my-auto text-center"
                        >
                            <div className="w-16 h-16 bg-[#E63946]/10 border border-[#E63946]/20 rounded-full flex items-center justify-center mx-auto text-[#E63946]">
                                <Sparkles size={32} />
                            </div>

                            <div className="space-y-2">
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold">
                                    <Clock size={13} />
                                    <span>현재 이용 중 ({new Date(activeSession.checkInTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 입실)</span>
                                </span>
                                <h2 className="text-2xl font-extrabold text-[#191F28]">
                                    <span className="text-[#E63946]">{activeSession.name}</span>님, 반갑습니다!
                                </h2>
                                <p className="text-[#4E5968] text-sm leading-relaxed font-medium">
                                    현재 <strong className="text-[#191F28] font-bold">{activeSession.locationName}</strong>을 이용하고 계십니다.<br />
                                    공간 이용을 모두 마치셨다면 퇴실하기 버튼을 눌러주세요.
                                </p>
                            </div>

                            <div className="space-y-3 pt-2">
                                <button
                                    onClick={handleGuestCheckoutSubmit}
                                    disabled={loading}
                                    className="w-full h-14 bg-[#E63946] hover:bg-[#D62839] text-white font-bold rounded-2xl transition shadow-md shadow-[#E63946]/25 active:scale-[0.98] disabled:opacity-50 text-[16px] tracking-tight flex items-center justify-between px-6"
                                >
                                    <span>{loading ? '퇴실 처리 중...' : '퇴실하기 (Check-Out)'}</span>
                                    <LogOut size={20} />
                                </button>

                                <button
                                    onClick={() => setShowSignupModal(true)}
                                    className="w-full h-14 bg-[#EAECEF] hover:bg-[#DFE2E6] text-[#191F28] font-bold rounded-2xl border-0 outline-none active:scale-[0.98] transition-all flex items-center justify-between px-6 group text-[16px] tracking-tight"
                                >
                                    <span>센터 등록</span>
                                    <ChevronRight size={20} className="text-[#8B95A1]" />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* CHECKIN SURVEY SELECTION STEP */}
                    {step === 'SURVEY' && (
                        <motion.div
                            key="survey"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.25 }}
                            className="bg-white border border-[#E5E8EB] rounded-3xl p-6 shadow-xl space-y-6 my-auto"
                        >
                            <div className="text-center space-y-2">
                                <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-black uppercase tracking-wider border border-blue-100">
                                    📍 {locParam === 'ENOUGH_PLACE' ? '이높플레이스' : '하이픈'} 입실 체크인
                                </span>
                                <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                                    {surveyQuestion}
                                </h2>
                                <p className="text-xs font-semibold text-gray-500">
                                    원하시는 방문 목적을 선택해 주시면 체크인이 완료됩니다 ✨
                                </p>
                            </div>

                            <div className="space-y-2.5">
                                {dynamicSurveyOptions.map(opt => {
                                    const isSelected = selectedPurposes.includes(opt.label);
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => {
                                                if (isSelected) {
                                                    setSelectedPurposes(selectedPurposes.filter(p => p !== opt.label));
                                                } else {
                                                    setSelectedPurposes([...selectedPurposes, opt.label]);
                                                }
                                            }}
                                            className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                                                isSelected
                                                    ? 'bg-blue-50/80 border-blue-500 text-blue-700 shadow-sm'
                                                    : 'bg-gray-50/50 border-gray-100 text-gray-700 hover:bg-white'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3.5">
                                                <span className="text-2xl">{opt.emoji}</span>
                                                <span className="font-extrabold text-sm text-gray-800">{opt.label}</span>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                                isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
                                            }`}>
                                                {isSelected && <Check size={12} strokeWidth={3} />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => {
                                    const fallbackLabel = dynamicSurveyOptions?.[0]?.label || '당 충전하며 쉬고 싶어요';
                                    const finalPurposes = selectedPurposes.length > 0 ? selectedPurposes : [fallbackLabel];
                                    performAutoCheckin(activeUserForSurvey, locParam, finalPurposes);
                                }}
                                disabled={loading}
                                className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition shadow-lg shadow-blue-500/25 active:scale-[0.98] disabled:opacity-50 text-base tracking-tight flex items-center justify-center gap-2"
                            >
                                <span>{loading ? '체크인 처리 중...' : '입실 체크인 완료'}</span>
                                <ArrowRight size={18} />
                            </button>
                        </motion.div>
                    )}

                    {/* GUEST SUCCESS STEP */}
                    {step === 'SUCCESS' && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white border border-[#E5E8EB] rounded-3xl p-8 shadow-xl text-center space-y-6 my-auto"
                        >
                            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-600">
                                <CheckCircle2 size={36} />
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-extrabold text-[#191F28]">
                                    {isQRCheckin ? '체크인 완료!' : '게스트 접속 완료!'}
                                </h2>
                                <p className="text-[#4E5968] text-sm leading-relaxed font-medium">
                                    <strong className="text-[#E63946] font-bold">{name}</strong>님, 환영합니다!<br />
                                    SCI 센터에서 즐거운 연결을 누려보세요
                                </p>
                            </div>

                            <button
                                onClick={() => setStep('ACTIVE_CHECKIN')}
                                className="w-full py-3.5 bg-[#EAECEF] hover:bg-[#DFE2E6] text-[#191F28] font-bold rounded-xl transition text-sm"
                            >
                                확인
                            </button>
                        </motion.div>
                    )}

                    {/* CHECKOUT SUCCESS STEP */}
                    {step === 'CHECKOUT_SUCCESS' && (
                        <motion.div
                            key="checkout_success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="bg-white border border-[#E5E8EB] rounded-3xl p-8 shadow-xl text-center space-y-6 my-auto"
                        >
                            <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto text-blue-600">
                                <CheckCircle2 size={36} />
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-2xl font-extrabold text-[#191F28]">퇴실 완료!</h2>
                                <p className="text-[#4E5968] text-sm leading-relaxed font-medium">
                                    하이픈에서의 경험은 어떠했나요?<br />
                                    우리가 다시 연결될 날을 기대합니다
                                </p>
                            </div>

                            <button
                                onClick={() => setStep('HOME')}
                                className="w-full py-3.5 bg-[#EAECEF] hover:bg-[#DFE2E6] text-[#191F28] font-bold rounded-xl transition text-sm"
                            >
                                처음 화면으로
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Mobile Login Modal Overlay */}
            {showLoginModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-[#E5E8EB] space-y-4"
                    >
                        <div className="flex justify-between items-center border-b border-[#F2F4F6] pb-3">
                            <div>
                                <h2 className="text-lg font-extrabold text-[#191F28] flex items-center gap-2">
                                    <LogIn size={20} className="text-[#E63946]" />
                                    로그인
                                </h2>
                                <p className="text-[12px] text-[#8B95A1] mt-0.5 font-medium">
                                    {isQRCheckin ? '로그인 시 자동으로 체크인이 진행됩니다' : '아이디(이름)와 비밀번호를 입력해 주세요'}
                                </p>
                            </div>
                            <button onClick={() => setShowLoginModal(false)} className="p-2 text-[#8B95A1] hover:text-[#191F28] rounded-full bg-[#F2F4F6]">
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleLoginSubmit} className="space-y-4 pt-1">
                            <div>
                                <label className="block text-[12px] font-bold text-[#4E5968] mb-1 ml-1">이름</label>
                                <div className="relative">
                                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B95A1]" />
                                    <input
                                        type="text"
                                        required
                                        value={loginName}
                                        onChange={(e) => setLoginName(e.target.value)}
                                        placeholder="이름 입력 (예: 홍길동)"
                                        className="w-full pl-9 pr-3 py-3 bg-[#F9FAFB] border border-[#E5E8EB] rounded-xl text-[#191F28] placeholder-[#B0B8C1] outline-none focus:bg-white focus:border-[#E63946] font-bold text-sm"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[12px] font-bold text-[#4E5968] mb-1 ml-1">비밀번호</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B95A1]" />
                                    <input
                                        type="password"
                                        required
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                        placeholder="비밀번호 입력"
                                        className="w-full pl-9 pr-3 py-3 bg-[#F9FAFB] border border-[#E5E8EB] rounded-xl text-[#191F28] placeholder-[#B0B8C1] outline-none focus:bg-white focus:border-[#E63946] font-bold text-sm"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loginLoading}
                                className="w-full h-14 bg-[#E63946] hover:bg-[#D62839] text-white font-bold rounded-2xl transition shadow-md shadow-[#E63946]/25 active:scale-[0.98] disabled:opacity-50 mt-4 text-[16px] tracking-tight flex items-center justify-center gap-2"
                            >
                                {loginLoading ? '로그인 중...' : (isQRCheckin ? '로그인 및 자동 체크인' : '로그인')}
                                <ArrowRight size={18} />
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}

            {/* Duplicate User Selection Modal Overlay */}
            {showDuplicatesModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-[#E5E8EB] space-y-4">
                        <h2 className="text-lg font-extrabold text-[#191F28]">동명이인 선택</h2>
                        <p className="text-xs text-[#4E5968]">동일한 이름을 가진 계정이 여러 개 존재합니다. 자신의 계정을 선택해주세요.</p>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {loginDuplicates.map((cand) => (
                                <button
                                    key={cand.id}
                                    onClick={() => handleDuplicateSelect(cand)}
                                    className="w-full p-3.5 bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-xl text-left flex justify-between items-center transition"
                                >
                                    <div>
                                        <div className="font-bold text-sm text-[#191F28]">{cand.name}</div>
                                        <div className="text-xs text-gray-500">{cand.school || '학교 미설정'}</div>
                                    </div>
                                    <ChevronRight size={16} className="text-gray-400" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* In-Page Direct Signup Modal Overlay */}
            {showSignupModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-[#E5E8EB] space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b border-[#F2F4F6] pb-3">
                            <div>
                                <h2 className="text-lg font-extrabold text-[#191F28]">
                                    센터 정식 등록
                                </h2>
                                <p className="text-[12px] text-[#8B95A1] mt-0.5 font-medium">
                                    {isQRCheckin ? '회원가입 완료 시 자동으로 체크인됩니다' : '회원가입 후 이용이 가능합니다'}
                                </p>
                            </div>
                            <button onClick={() => setShowSignupModal(false)} className="p-2 text-[#8B95A1] hover:text-[#191F28] rounded-full bg-[#F2F4F6]">
                                <X size={18} />
                            </button>
                        </div>

                        <SignUpForm
                            prefilledData={{
                                name: activeSession?.name || name || '',
                                school: activeSession?.school || school || ''
                            }}
                            guestUserId={activeSession?.userId}
                            onSuccess={async (newSignedUser) => {
                                setShowSignupModal(false);
                                if (newSignedUser) {
                                    if (isQRCheckin) {
                                        localStorage.setItem('user', JSON.stringify(newSignedUser));
                                        await performAutoCheckin(newSignedUser, locParam);
                                    } else {
                                        localStorage.setItem('user', JSON.stringify(newSignedUser));
                                        await updateWebSessionPreferences(newSignedUser);
                                        navigate('/student', { replace: true });
                                    }
                                } else {
                                    alert('회원가입이 완료되었습니다! 로그인해 주세요.');
                                }
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer className="py-4 text-center text-xs text-[#8B95A1] relative z-10 font-medium shrink-0">
                © SCI CENTER • HAIFN & ENOUGH PLACE
            </footer>
        </div>
    );
};

export default GuestMobileWelcome;
