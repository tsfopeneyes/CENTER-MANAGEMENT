import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, User, School, ArrowRight, Check, CheckCircle2, ChevronRight, X, LogOut, Clock, LogIn, Lock, AlertCircle, Phone, ShieldCheck, Calendar } from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase } from '../supabaseClient';
import { verifiedProfileLogin } from '../utils/verifiedProfileLogin';
import { requestSupabaseFunction } from '../utils/supabaseRest';
import { findMatchingGuestAccount, normalizeSchoolName } from '../utils/userUtils';
import { hashPassword } from '../utils/hashUtils';
import SignUpForm from '../components/auth/SignUpForm';
import StudentCheckoutSurveyModal from '../components/student/modals/StudentCheckoutSurveyModal';
import { sendCheckinNotification, sendCheckoutNotification } from '../utils/integrationUtils';
import { areExternalNotificationsMuted, dispatchVisitSlackAlert } from '../utils/serverIntegration';
import { requestSupabaseRest } from '../utils/supabaseRest';
import { getTodayVisitState, recordVisitEvent } from '../utils/visitLifecycle';
import { isHaifnRotatingQrEnabled, isKioskQrAccessError, requiresRotatingQrAccess } from '../utils/kioskQr';
import { markTodayProgramAttendance } from '../utils/programAttendance';
import { buildGuestPrivacyPreferences, parseGuestBirthDate } from '../utils/guestBirthUtils';
import { getAccountAuthClient, isAccountAuthEnabled } from '../auth/accountAuthRuntime';
import { createAccountLoginAdapter } from '../auth/accountLoginAdapter';
import { loadAssignedSurvey } from '../utils/surveyAssignments';

let secureLoginAdapter;
const getSecureLoginAdapter=()=>secureLoginAdapter??=createAccountLoginAdapter({client:getAccountAuthClient(),auth:supabase.auth});

const VISIT_REASON_OPTIONS = [
    { id: '1', emoji: '👥', label: '친구 / 지인 추천' },
    { id: '2', emoji: '🏫', label: '학교 / 선생님 추천' },
    { id: '3', emoji: '📱', label: 'SNS / 포스터 / 홍보물' },
    { id: '4', emoji: '🚶', label: '지나가다가 궁금해서' }
];

const getLocationDisplayName = (locationName = '') => {
    const normalized = String(locationName);
    if (normalized.includes('이높') || normalized.includes('ENOUGH_PLACE') || normalized.includes('강서')) {
        return '이높플레이스';
    }
    if (normalized.includes('하이픈') || normalized.includes('HAIFN') || normalized.includes('강동')) {
        return '하이픈';
    }
    return normalized || '센터';
};

const getObjectParticle = (word = '') => {
    const lastChar = String(word).slice(-1);
    const code = lastChar.charCodeAt(0);
    const hasFinalConsonant = code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 !== 0;
    return hasFinalConsonant ? '을' : '를';
};

const GuestMobileWelcome = ({ isQRCheckin = true }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const locParam = searchParams.get('loc');
    const qrToken = searchParams.get('qr');
    const rotatingQrFeatureEnabled = isHaifnRotatingQrEnabled();
    const isLegacyHaifnQr = rotatingQrFeatureEnabled && isQRCheckin && locParam === 'HAIFN' && !qrToken;
    const [haifnRotationActive, setHaifnRotationActive] = useState(isLegacyHaifnQr ? null : true);
    const requiresRotatingQr = requiresRotatingQrAccess({
        enabled: rotatingQrFeatureEnabled && (!isLegacyHaifnQr || haifnRotationActive !== false),
        isQRCheckin,
        locationParam: locParam,
    });
    const isProgramLoginFlow = Boolean(
        location.state?.fromProgram || searchParams.get('programLogin')
    );

    const [step, setStep] = useState('HOME'); // 'HOME' | 'FORM' | 'SUCCESS' | 'ACTIVE_CHECKIN' | 'CHECKOUT_SUCCESS'
    const [name, setName] = useState('');
    const [school, setSchool] = useState('');
    const [guestBirthDate, setGuestBirthDate] = useState('');
    const [guestPrivacyConsent, setGuestPrivacyConsent] = useState(false);
    const [guardianName, setGuardianName] = useState('');
    const [guardianPhone, setGuardianPhone] = useState('');
    const [guardianRelation, setGuardianRelation] = useState('');
    const [guardianConsent, setGuardianConsent] = useState(false);
    const [selectedReasons, setSelectedReasons] = useState(['친구 / 지인 추천']);
    const [customReason, setCustomReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSignupModal, setShowSignupModal] = useState(false);
    const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
    const [showCheckoutSurvey, setShowCheckoutSurvey] = useState(false);
    const [activeSession, setActiveSession] = useState(null);
    const [checkoutSurveySession, setCheckoutSurveySession] = useState(null);
    const checkoutCompletionInFlightRef = useRef(new Set());
    const qrEntryInFlightRef = useRef(new Set());
    const [completedCheckoutLocationName, setCompletedCheckoutLocationName] = useState('');
    const [qrAccess, setQrAccess] = useState(() => ({
        status: requiresRotatingQr ? 'VERIFYING' : 'NOT_REQUIRED',
        presenceGrant: null,
        location: null,
        expiresAt: null,
    }));

    useEffect(() => {
        let cancelled = false;
        if (!isLegacyHaifnQr) {
            setHaifnRotationActive(true);
            return () => { cancelled = true; };
        }
        setHaifnRotationActive(null);
        requestSupabaseFunction('kiosk-qr', { action: 'rotation-status' }, 1)
            .then((status) => {
                if (!cancelled) setHaifnRotationActive(status.active === true);
            })
            .catch((error) => {
                console.error('Failed to read Haifn QR transition status:', error);
                if (!cancelled) setHaifnRotationActive(true);
            });
        return () => { cancelled = true; };
    }, [isLegacyHaifnQr]);

    useEffect(() => {
        let cancelled = false;
        if (isLegacyHaifnQr && haifnRotationActive === null) {
            setQrAccess({ status: 'VERIFYING', presenceGrant: null, location: null, expiresAt: null });
            return () => { cancelled = true; };
        }
        if (!requiresRotatingQr) {
            setQrAccess({ status: 'NOT_REQUIRED', presenceGrant: null, location: null, expiresAt: null });
            return () => { cancelled = true; };
        }
        if (!qrToken) {
            setQrAccess({ status: 'INVALID', presenceGrant: null, location: null, expiresAt: null });
            return () => { cancelled = true; };
        }

        setQrAccess((current) => ({ ...current, status: 'VERIFYING' }));
        requestSupabaseFunction('kiosk-qr', { action: 'exchange-qr', token: qrToken }, 1)
            .then((access) => {
                if (cancelled) return;
                setQrAccess({
                    status: 'VALID',
                    presenceGrant: access.presenceGrant,
                    location: access.location,
                    expiresAt: access.expiresAt,
                });
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('QR exchange failed:', error);
                setQrAccess({ status: 'INVALID', presenceGrant: null, location: null, expiresAt: null });
            });
        return () => { cancelled = true; };
    }, [haifnRotationActive, isLegacyHaifnQr, qrToken, requiresRotatingQr]);

    const recordMobileVisitEvent = useCallback(async (visit) => {
        if (!requiresRotatingQr) {
            if (isLegacyHaifnQr && haifnRotationActive === false) {
                const latestStatus = await requestSupabaseFunction('kiosk-qr', { action: 'rotation-status' }, 1);
                if (latestStatus.active === true) {
                    setHaifnRotationActive(true);
                    throw new Error('QR_TOKEN_EXPIRED');
                }
            }
            return recordVisitEvent(visit);
        }
        if (qrAccess.status !== 'VALID' || !qrAccess.presenceGrant) {
            throw new Error('QR_ACCESS_REQUIRED');
        }
        try {
            const validation = await requestSupabaseFunction('kiosk-qr', {
                action: 'validate-presence',
                presenceGrant: qrAccess.presenceGrant,
                locationId: visit.locationId,
                type: visit.type,
            }, 1);
            return recordVisitEvent({
                ...visit,
                locationId: visit.type === 'CHECKOUT' ? visit.locationId : validation.locationId,
            });
        } catch (error) {
            if (isKioskQrAccessError(error?.message)) {
                setQrAccess({ status: 'INVALID', presenceGrant: null, location: null, expiresAt: null });
            }
            throw error;
        }
    }, [haifnRotationActive, isLegacyHaifnQr, qrAccess.presenceGrant, qrAccess.status, requiresRotatingQr]);

    // Frequent Guest Recommendation Modal State
    const [showFrequentGuestModal, setShowFrequentGuestModal] = useState(false);
    const [frequentGuestData, setFrequentGuestData] = useState(null);

    // Login Modal States
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [loginName, setLoginName] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginDuplicates, setLoginDuplicates] = useState([]);
    const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
    const [resetCandidate, setResetCandidate] = useState(null);
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
    const [resetBirth, setResetBirth] = useState('');
    const [resetPhoneBack4, setResetPhoneBack4] = useState('');
    const [resetPassword, setResetPassword] = useState('');
    const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

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

    // All QR entry paths use the same visit lifecycle handler.  Keeping this
    // wrapper prevents the check-in-survey and signup flows from bypassing
    // duplicate prevention or turning an automatic checkout into a new visit.
    const performAutoCheckin = async (currentUser, _targetLocParam, selectedPurposes = null) => {
        if (!currentUser?.id) return;
        await ensureCheckinLogAndNavigate(currentUser, selectedPurposes);
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
    const [surveyDescription, setSurveyDescription] = useState('');
    const [activeSurveyId, setActiveSurveyId] = useState(null);
    const [dynamicSurveyOptions, setDynamicSurveyOptions] = useState(DEFAULT_CHECKIN_OPTIONS);
    const [isRedirecting, setIsRedirecting] = useState(false);

    useEffect(() => {
        const fetchSurveyConfig = async () => {
            try {
                const assigned = await loadAssignedSurvey({
                    surveyType: 'CHECKIN',
                    locationName: qrAccess.location?.name || locParam
                });
                if (assigned?.config) {
                    const parsed = assigned.config;
                    setActiveSurveyId(assigned.id || null);
                    if (parsed.question) setSurveyQuestion(parsed.question);
                    setSurveyDescription(parsed.description || '');
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
    }, [locParam, qrAccess.location?.name]);

    const getSafeKSTDate = () => {
        const now = new Date();
        const kstDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 60 * 60 * 1000));
        const y = kstDate.getFullYear();
        const m = String(kstDate.getMonth() + 1).padStart(2, '0');
        const d = String(kstDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const findLoginCandidates = async (targetName) => {
        if(isAccountAuthEnabled()){
            return getSecureLoginAdapter().candidates(targetName);
        }
        let lastError = null;

        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                // Do not use the Supabase client for the first QR-page login
                // request: Samsung Internet can abort its internal signal while
                // handing a PWA view over to the browser.
                const response = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/get_login_candidates`,
                    {
                        method: 'POST',
                        headers: {
                            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ p_name: targetName }),
                    }
                );
                if (!response.ok) {
                    throw new Error(`로그인 정보를 불러오지 못했습니다. (${response.status})`);
                }
                return await response.json();
            } catch (requestError) {
                lastError = requestError;
            }

            // Samsung Internet can occasionally abort a freshly opened QR-page
            // request while its web-app view is being handed over to the browser.
            if (lastError?.name !== 'AbortError' || attempt === 1) break;
            await new Promise(resolve => setTimeout(resolve, 350));
        }

        throw lastError;
    };

    const isAdminAccount = (user) =>
        user?.user_group === '관리자' || user?.role === 'admin' || user?.is_master === true;

    const openPasswordReset = () => {
        setResetBirth('');
        setResetPhoneBack4('');
        setResetPassword('');
        setResetPasswordConfirm('');
        setShowPasswordResetModal(true);
    };

    const handlePasswordReset = async (event) => {
        event.preventDefault();
        if (!resetCandidate || isAdminAccount(resetCandidate)) return;
        if (resetPassword.length < 6) {
            alert('새 비밀번호는 6자리 이상으로 설정해주세요.');
            return;
        }
        if (resetPassword !== resetPasswordConfirm) {
            alert('새 비밀번호와 확인 값이 일치하지 않습니다.');
            return;
        }

        setResetLoading(true);
        try {
            await requestSupabaseFunction('dispatch-notification', {
                action: 'reset-student-password',
                profileId: resetCandidate.id,
                birth: resetBirth.trim(),
                phoneBack4: resetPhoneBack4.trim(),
                password: resetPassword,
            });

            setLoginPassword('');
            setShowPasswordResetModal(false);
            setResetCandidate(null);
            alert('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.');
        } catch (error) {
            console.error('Password reset error:', error);
            alert(error.message || '비밀번호 초기화 중 오류가 발생했습니다.');
        } finally {
            setResetLoading(false);
        }
    };

    // The QR is both an entry and an exit point.  Determine the user's current
    // visit from the source of truth before creating another CHECKIN record.
    const getActiveVisitSession = useCallback(async (userId) => {
        if (!userId) return null;

        const state = await getTodayVisitState(userId);
        if (!['ACTIVE', 'AUTO_CHECKED_OUT'].includes(state.status)) return null;

        let locationName = '공간';
        if (state.locationId) {
            const locations = await requestSupabaseRest(
                `locations?select=name&id=eq.${encodeURIComponent(state.locationId)}`
            );
            locationName = locations?.[0]?.name || locationName;
        }

        return {
            checkInTime: state.checkInTime,
            locationId: state.locationId,
            locationName,
            isAutoCheckedOut: state.isAutoCheckedOut,
        };
    }, []);

    const ensureCheckinLogAndNavigate = useCallback(async (currentUser, completedSurveyPurposes = null) => {
        if (!currentUser?.id || qrEntryInFlightRef.current.has(currentUser.id)) return;
        qrEntryInFlightRef.current.add(currentUser.id);
        try {
            const activeVisit = await getActiveVisitSession(currentUser.id);
            if (activeVisit) {
                // Repair attendance as well when this scan reconciles a visit
                // that was already created by an earlier QR attempt.
                markTodayProgramAttendance(currentUser.id).catch(error => {
                    console.error('QR program attendance reconciliation failed:', error);
                });
                setActiveSession({
                    userId: currentUser.id,
                    name: currentUser.name,
                    school: currentUser.school,
                    date: getSafeKSTDate(),
                    isMember: true,
                    ...activeVisit
                });
                setStep('ACTIVE_CHECKIN');
                setShowCheckoutConfirm(true);
                setIsRedirecting(false);
                return;
            }

            const visitState = await getTodayVisitState(currentUser.id);
            if (visitState.status === 'CHECKED_OUT') {
                const shouldCheckInAgain = window.confirm(
                    '오늘 이미 체크아웃한 기록이 있습니다.\n센터에 다시 입실하려는 경우에만 확인을 눌러주세요.'
                );
                if (!shouldCheckInAgain) {
                    setIsRedirecting(false);
                    navigate('/student', { replace: true });
                    return;
                }
            }

            const todayKst = getSafeKSTDate();

            const locations = await requestSupabaseRest('locations?select=*');
            let locObj = null;
            const verifiedLocationId = requiresRotatingQr ? qrAccess.location?.id : locParam;
            if (verifiedLocationId) {
                locObj = (locations || []).find(l =>
                    l.id === verifiedLocationId ||
                    l.name.includes(verifiedLocationId) ||
                    (verifiedLocationId === 'HAIFN' && l.name.includes('하이픈')) ||
                    (verifiedLocationId === 'ENOUGH_PLACE' && l.name.includes('이높플레이스'))
                );
            }
            if (!locObj) {
                locObj = (locations || []).find(l => l.name.includes('하이픈')) || locations?.[0] || { id: null, name: '하이픈' };
            }

            const checkinResult = await recordMobileVisitEvent({
                userId: currentUser.id,
                locationId: locObj.id,
                type: 'CHECKIN',
            });
            if (!['CREATED', 'RECONCILED'].includes(checkinResult.outcome)) {
                const visit = await getActiveVisitSession(currentUser.id);
                if (visit) {
                    setActiveSession({
                        userId: currentUser.id,
                        name: currentUser.name,
                        school: currentUser.school,
                        date: todayKst,
                        isMember: true,
                        ...visit,
                    });
                    setShowCheckoutConfirm(true);
                    setStep('ACTIVE_CHECKIN');
                    setIsRedirecting(false);
                    return;
                }

                throw new Error('현재 방문 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.');
            }

            try {
                await markTodayProgramAttendance(currentUser.id);
            } catch (attendanceError) {
                // A temporary attendance failure must not erase a completed
                // visit. A repeated scan safely reconciles it on the next try.
                console.error('QR program attendance update failed:', attendanceError);
            }

            sessionStorage.setItem('pending_checkin_notif', JSON.stringify({
                userName: currentUser.name,
                schoolName: currentUser.school,
                locationName: locObj.name,
                isGuest: false
            }));

            const insertedLog = checkinResult.event || checkinResult.state?.lastEvent;

            try {
                const purpose = Array.isArray(completedSurveyPurposes) && completedSurveyPurposes.length > 0
                    ? completedSurveyPurposes.join(', ')
                    : undefined;
                const { data: existingNote } = await supabase
                    .from('visit_notes')
                    .select('id')
                    .eq('user_id', currentUser.id)
                    .eq('visit_date', todayKst)
                    .maybeSingle();
                const noteData = {
                    remarks: '모바일 QR 체크인',
                    ...(purpose ? { purpose } : {}),
                };
                if (existingNote?.id) {
                    await supabase.from('visit_notes').update(noteData).eq('id', existingNote.id);
                } else {
                    await supabase.from('visit_notes').insert([{
                        user_id: currentUser.id,
                        visit_date: todayKst,
                        ...noteData,
                    }]);
                }
            } catch (vErr) {}

            const hasCompletedCheckinSurvey = Array.isArray(completedSurveyPurposes) && completedSurveyPurposes.length > 0;
            if (hasCompletedCheckinSurvey) {
                sessionStorage.removeItem('require_checkin_survey');
            } else {
                sessionStorage.setItem('require_checkin_survey', 'true');
            }
            if (insertedLog?.created_at) {
                sessionStorage.setItem('active_checkin_time', insertedLog.created_at);
            }

            updateWebSessionPreferences(currentUser).catch(() => {});
            navigate('/student', {
                replace: true,
                state: {
                    requireCheckinSurvey: !hasCompletedCheckinSurvey,
                    checkinTime: insertedLog?.created_at,
                    locationName: locObj.name
                }
            });
        } catch (err) {
            console.error('ensureCheckinLogAndNavigate error:', err);
            setIsRedirecting(false);
            if (isKioskQrAccessError(err?.message)) return;
            sessionStorage.setItem('require_checkin_survey', 'true');
            navigate('/student', { replace: true, state: { requireCheckinSurvey: true } });
        } finally {
            qrEntryInFlightRef.current.delete(currentUser.id);
        }
    }, [getActiveVisitSession, locParam, navigate, qrAccess.location?.id, recordMobileVisitEvent, requiresRotatingQr]);

    // On mount effect
    useEffect(() => {
        if (requiresRotatingQr && qrAccess.status !== 'VALID') return;
        const querySearch = location.search || '';

        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            try {
                const parsedUser = JSON.parse(savedUser);
                if (parsedUser?.id) {
                    const isAdmin = parsedUser.user_group === '관리자' || parsedUser.role === 'admin';
                    if (isAdmin) {
                        navigate('/admin' + querySearch, { replace: true });
                        return;
                    }

                    setIsRedirecting(true);
                    if (isQRCheckin) {
                        ensureCheckinLogAndNavigate(parsedUser);
                    } else {
                        // Normal Web App access: navigate straight to student dashboard
                        updateWebSessionPreferences(parsedUser);
                        navigate('/student' + querySearch, { replace: true });
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
                    navigate('/admin' + querySearch, { replace: true });
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
                    getActiveVisitSession(parsed.userId)
                        .then((activeVisit) => {
                            if (activeVisit) {
                                setActiveSession({ ...parsed, ...activeVisit });
                                setStep('ACTIVE_CHECKIN');
                                setShowCheckoutConfirm(true);
                            } else {
                                localStorage.removeItem('guest_active_session');
                            }
                        })
                        .catch((error) => {
                            console.error('Failed to verify guest active session', error);
                            // Keep the existing local session available when the network is temporarily unavailable.
                            setActiveSession(parsed);
                            setStep('ACTIVE_CHECKIN');
                            setShowCheckoutConfirm(true);
                        });
                } else {
                    localStorage.removeItem('guest_active_session');
                }
            } catch (e) {
                console.error('Failed to parse guest active session', e);
            }
        }
    }, [isQRCheckin, locParam, navigate, ensureCheckinLogAndNavigate, getActiveVisitSession, qrAccess.status, requiresRotatingQr]);

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
            if(isAccountAuthEnabled()){
                let direct=await attemptLoginAuth({name:loginName.trim()},null,loginPassword);
                if(direct===true||direct===false)return;
                if(direct==='name_not_found'){
                    direct=await attemptLoginAuth({name:`${loginName.trim()}(guest)`},null,loginPassword);
                    if(direct===true||direct===false)return;
                    if(direct==='name_not_found'){
                        alert('가입된 이름이 없습니다. 이름을 다시 확인해주세요.');return;
                    }
                }
                if(direct!=='selection_required')return;
            }

            const hashedPassword = await hashPassword(loginPassword);

            let candidates = await findLoginCandidates(loginName.trim());

            if (!candidates || candidates.length === 0) {
                const guestCandidates = await findLoginCandidates(`${loginName.trim()}(guest)`);

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
            if (isAccountAuthEnabled() && ['temporarily_unavailable', 'cancelled'].includes(err?.code)) {
                alert('인증 서버 연결이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
            } else {
                alert('로그인 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
            }
        } finally {
            setLoginLoading(false);
        }
    };

    const attemptLoginAuth = async (userCandidate, hashedPw, rawPassword) => {
        try {
            let matchedUser = null;

            if(isAccountAuthEnabled()){
                matchedUser=await getSecureLoginAdapter().login(userCandidate.id?{profileId:userCandidate.id,password:rawPassword}:
                    {name:userCandidate.name,password:rawPassword});
            } else {

            const userResponse = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?select=*&id=eq.${encodeURIComponent(userCandidate.id)}`,
                {
                    headers: {
                        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    },
                }
            );
            if (!userResponse.ok) {
                throw new Error(`회원 정보를 불러오지 못했습니다. (${userResponse.status})`);
            }
            const [dbUser] = await userResponse.json();

            const fullUser = dbUser ? { ...userCandidate, ...dbUser } : userCandidate;

            if (fullUser && (fullUser.password === hashedPw || fullUser.password === rawPassword)) {
                const authId=await verifiedProfileLogin({
                    profileId:fullUser.id,password:rawPassword,hashedPassword:hashedPw,
                    resolve:payload=>requestSupabaseFunction('dispatch-notification',payload),auth:supabase.auth,
                });
                matchedUser={...fullUser,auth_user_id:authId};
            }
            }

            if (!matchedUser) {
                setResetCandidate(isAdminAccount(userCandidate) ? null : userCandidate);
                alert('비밀번호가 일치하지 않습니다. 다시 확인해 주세요.');
                return false;
            }

            setResetCandidate(null);
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
            if(isAccountAuthEnabled()&&err?.code==='invalid_login'){
                setResetCandidate(null);
                alert('비밀번호가 일치하지 않습니다. 다시 확인해 주세요.');
                return false;
            }
            if(isAccountAuthEnabled()&&['name_not_found','selection_required'].includes(err?.code))return err.code;
            if (isAccountAuthEnabled() && ['temporarily_unavailable', 'cancelled'].includes(err?.code)) {
                alert('인증 서버 연결이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
                return false;
            }
            alert('로그인 시도 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            return false;
        }
    };

    const handleDuplicateSelect = (selectedUser) => {
        setShowDuplicatesModal(false);
        hashPassword(loginPassword).then(hashedPw => {
            attemptLoginAuth(selectedUser, hashedPw, loginPassword);
        });
    };

    const [guestPendingInfo, setGuestPendingInfo] = useState(null);

    // Guest Check-in Form Submission -> Transition to Dynamic Check-in Survey (Admin Config)
    const handleGuestCheckinSubmit = async (e) => {
        e.preventDefault();
        const birthInfo = parseGuestBirthDate(guestBirthDate);
        if (!name.trim() || !school.trim() || !birthInfo) {
            alert('이름, 학교명, 생년월일을 정확히 입력해주세요.');
            return;
        }
        if (!guestPrivacyConsent) {
            alert('게스트 방문을 위한 개인정보 수집·이용에 동의해주세요.');
            return;
        }
        if (birthInfo.isUnder14 && (!guardianName.trim() || !guardianPhone.trim() || !guardianRelation.trim() || !guardianConsent)) {
            alert('만 14세 미만은 법정대리인 정보와 동의 확인이 필요합니다. 보호자와 함께 입력하거나 직원에게 문의해주세요.');
            return;
        }
        if (birthInfo.isUnder14 && guardianPhone.replace(/[^0-9]/g, '').length < 10) {
            alert('법정대리인 연락처를 정확히 입력해주세요.');
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
            const locations = await requestSupabaseRest('locations?select=*');
            let haifnLoc = null;
            const verifiedLocationId = requiresRotatingQr ? qrAccess.location?.id : locParam;
            if (verifiedLocationId) {
                haifnLoc = (locations || []).find(l => {
                    const locationName = String(l?.name || '');
                    return l?.id === verifiedLocationId ||
                    locationName.includes(verifiedLocationId) ||
                    (verifiedLocationId === 'HAIFN' && locationName.includes('하이픈')) ||
                    (verifiedLocationId === 'ENOUGH_PLACE' && locationName.includes('이높플레이스'));
                }
                );
            }
            haifnLoc = haifnLoc || (locations || []).find(l => String(l?.name || '').includes('하이픈')) || locations?.[0];
            if (!haifnLoc?.id) throw new Error('체크인할 센터를 찾지 못했습니다.');

            // 2. Find or create guest user
            let guestUserId = null;
            const targetName = cleanName.includes('(guest)') ? cleanName : `${cleanName}(guest)`;
            const guestCandidates = await requestSupabaseRest(
                `users?select=*&name=eq.${encodeURIComponent(targetName)}`
            );
            const existingGuest = findMatchingGuestAccount(guestCandidates, cleanName, cleanSchool);
            const privacyPreferences = buildGuestPrivacyPreferences(existingGuest?.preferences, birthInfo.isUnder14);

            const memberCandidates = await requestSupabaseRest(
                `users?select=id,name,school,user_group,role,status&name=eq.${encodeURIComponent(cleanName)}`
            );
            const matchingMembers = (memberCandidates || []).filter(candidate =>
                candidate.user_group !== '게스트' &&
                candidate.user_group !== '미가입' &&
                normalizeSchoolName(candidate.school).replace(/\s+/g, '') === cleanSchool.replace(/\s+/g, '')
            );
            if (matchingMembers.length > 0) {
                setLoginName(cleanName);
                setLoginPassword('');
                setResetCandidate(null);
                setShowLoginModal(true);
                alert(
                    matchingMembers.length === 1
                        ? '이미 같은 이름과 학교로 가입된 정식 회원 계정이 있습니다. 게스트 계정을 새로 만들지 않고 기존 계정으로 로그인해주세요.'
                        : '같은 이름과 학교의 회원 계정이 여러 개 있습니다. 로그인 후 본인 계정을 선택해주세요.'
                );
                return;
            }

            if (existingGuest?.id) {
                guestUserId = existingGuest.id;
                await requestSupabaseRest(`users?id=eq.${encodeURIComponent(existingGuest.id)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
                    body: JSON.stringify({
                        birth: birthInfo.yymmdd,
                        guardian_name: birthInfo.isUnder14 ? guardianName.trim() : null,
                        guardian_phone: birthInfo.isUnder14 ? guardianPhone.trim() : null,
                        guardian_relation: birthInfo.isUnder14 ? guardianRelation.trim() : null,
                        preferences: privacyPreferences,
                    }),
                });
            } else {
                    let uniquePhone = '';
                    let back4 = '';
                    let isUnique = false;
                    let retries = 0;
                    while (!isUnique && retries < 5) {
                        const candidate4 = Math.floor(1000 + Math.random() * 9000).toString();
                        const testPhone = `010-0000-${candidate4}`;
                        const existing = await requestSupabaseRest(
                            `users?select=id&phone=eq.${encodeURIComponent(testPhone)}&limit=1`
                        );
                        if (!existing?.length) {
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

                    const newGuests = await requestSupabaseRest('users?select=id', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
                        body: JSON.stringify([{
                        name: `${cleanName}(guest)`,
                        school: cleanSchool,
                        user_group: '게스트',
                        role: 'student',
                        status: 'approved',
                        password: null,
                        gender: 'M',
                        birth: birthInfo.yymmdd,
                        phone: uniquePhone,
                        phone_back4: back4,
                        guardian_name: birthInfo.isUnder14 ? guardianName.trim() : null,
                        guardian_phone: birthInfo.isUnder14 ? guardianPhone.trim() : null,
                        guardian_relation: birthInfo.isUnder14 ? guardianRelation.trim() : null,
                        preferences: privacyPreferences,
                        memo: `[모바일 게스트 체크인: ${new Date().toLocaleDateString()}]`
                        }])
                    });
                    guestUserId = newGuests?.[0]?.id || null;
            }

            if (!guestUserId) throw new Error('게스트 계정을 준비하지 못했습니다. 다시 시도해 주세요.');

            // Check total previous visit count for frequent guest recommendation
            let previousVisits = 0;
            if (guestUserId) {
                try {
                    const { count } = await supabase
                        .from('visit_notes')
                        .select('id', { count: 'exact', head: true })
                        .eq('user_id', guestUserId);
                    previousVisits = count || 0;
                } catch (cErr) {}
            }

            // Save pending guest info
            setGuestPendingInfo({
                guestUserId,
                cleanName,
                cleanSchool,
                finalVisitReason,
                haifnLoc
            });

            // Pre-select first dynamic survey option
            if (dynamicSurveyOptions && dynamicSurveyOptions.length > 0) {
                setSelectedPurposes([dynamicSurveyOptions[0].label]);
            }

            const cameFromProgramApplication = String(existingGuest?.memo || '').includes('프로그램 비회원 신청');

            // Program applicants are often unaware that the shared-link form
            // created a guest profile. Explain that status on their very first
            // center check-in; repeat visitors keep receiving the same upgrade
            // path until they complete regular registration.
            if (cameFromProgramApplication || previousVisits >= 2) {
                setFrequentGuestData({
                    name: cleanName,
                    school: cleanSchool,
                    visitCount: previousVisits + 1,
                    cameFromProgramApplication,
                });
                setShowFrequentGuestModal(true);
            } else {
                setStep('SURVEY');
            }
        } catch (err) {
            console.error('Mobile Guest Checkin Error:', err);
            alert('체크인 처리 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
        } finally {
            setLoading(false);
        }
    };

    // Complete Guest Check-in with Selected Survey Purposes
    const performGuestSurveyComplete = async (surveyPurposes) => {
        if (!guestPendingInfo) return;
        setLoading(true);
        try {
            const { guestUserId, cleanName, cleanSchool, finalVisitReason, haifnLoc } = guestPendingInfo;
            const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            const surveyPurposesStr = (surveyPurposes && surveyPurposes.length > 0)
                ? surveyPurposes.join(', ')
                : '당 충전하며 쉬고 싶어요';

            // 1. Insert CHECKIN log into logs table ONLY for QR checkin route
            if (isQRCheckin) {
                const checkinResult = await recordMobileVisitEvent({
                    userId: guestUserId,
                    locationId: haifnLoc.id,
                    type: 'CHECKIN',
                });
                if (!['CREATED', 'RECONCILED'].includes(checkinResult.outcome)) {
                    throw new Error('이미 오늘의 이용 기록이 있습니다. 같은 QR로 체크아웃을 진행해주세요.');
                }

                try {
                    await markTodayProgramAttendance(guestUserId);
                } catch (attendanceError) {
                    console.error('Guest QR program attendance update failed:', attendanceError);
                }
            }

            // 2. Save visit notes (remarks = referral path, purpose = checkin survey choice)
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
                            remarks: finalVisitReason || '친구 / 지인 추천',
                            purpose: surveyPurposesStr
                        }).eq('id', existingNote.id);
                    } else {
                        await supabase.from('visit_notes').insert([{
                            user_id: guestUserId,
                            visit_date: todayKst,
                            remarks: finalVisitReason || '친구 / 지인 추천',
                            purpose: surveyPurposesStr
                        }]);
                    }

                    // Save to checkin_surveys table
                    await supabase.from('checkin_surveys').insert([{
                        user_id: guestUserId,
                        survey_type: 'CHECKIN',
                        selections: surveyPurposes,
                        ...(activeSurveyId ? {
                            survey_id: activeSurveyId,
                            survey_snapshot: { question: surveyQuestion, description: surveyDescription, options: dynamicSurveyOptions }
                        } : {}),
                        created_at: new Date().toISOString()
                    }]);
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

            // 3. Trigger Realtime LINE / Discord Notification with separate Referral Path & Check-in Purpose
            try {
                sendCheckinNotification({
                    userId: guestUserId,
                    userName: cleanName,
                    schoolName: cleanSchool,
                    locationName: haifnLoc.name,
                    isGuest: true,
                    referralPath: finalVisitReason,
                    purposes: surveyPurposes,
                    surveyQuestion,
                    surveyAnswers: surveyPurposes
                });
            } catch (notifErr) {
                console.error('Notification dispatch error:', notifErr);
            }

            setStep('SUCCESS');
        } catch (err) {
            console.error('Guest Survey Complete Error:', err);
            alert('체크인 완료 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
        } finally {
            setLoading(false);
        }
    };

    // Guest Checkout Submission
    const handleGuestCheckoutSubmit = async ({ notificationAlreadySent = false } = {}) => {
        if (!activeSession) return;
        setLoading(true);
        try {
            // Re-check immediately before writing so a repeated scan cannot create
            // a second CHECKOUT record, and always check out of the actual active location.
            const activeVisit = await getActiveVisitSession(activeSession.userId);
            if (!activeVisit) {
                setCompletedCheckoutLocationName(getLocationDisplayName(activeSession.locationName));
                localStorage.removeItem('guest_active_session');
                setShowCheckoutConfirm(false);
                setActiveSession(null);
                setStep('CHECKOUT_SUCCESS');
                return;
            }

            const checkoutSession = { ...activeSession, ...activeVisit };
            const checkoutResult = await recordMobileVisitEvent({
                userId: checkoutSession.userId,
                locationId: checkoutSession.locationId,
                type: 'CHECKOUT',
            });
            if (!['CREATED', 'RECONCILED'].includes(checkoutResult.outcome)) {
                setCompletedCheckoutLocationName(getLocationDisplayName(checkoutSession.locationName));
                localStorage.removeItem('guest_active_session');
                setShowCheckoutConfirm(false);
                setActiveSession(null);
                setStep('CHECKOUT_SUCCESS');
                return;
            }

            let durationText = '';
            if (checkoutSession.checkInTime) {
                const checkinTime = new Date(checkoutSession.checkInTime).getTime();
                const checkoutTime = new Date().getTime();
                const durationMinutes = Math.max(1, Math.floor((checkoutTime - checkinTime) / (1000 * 60)));
                const hours = Math.floor(durationMinutes / 60);
                const mins = durationMinutes % 60;
                const durationStr = hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`;
                durationText = `\n🕑 ${durationStr} 이용`;
            }

            if (!notificationAlreadySent && !areExternalNotificationsMuted()) {
                const locNameStr = checkoutSession.locationName || '공간';
                const isMemberCheckout = checkoutSession.isMember === true;
                const checkoutTitle = isMemberCheckout ? '[CHECK-OUT]' : '[GUEST CHECK-OUT]';
                const alertMessage = `${checkoutTitle}\n💙 ${checkoutSession.name}님이 ${locNameStr}에서 퇴실했어요${durationText}`;

                const checkoutLocationName = checkoutSession.locationName || '';
                const isHaifnCheckout = (checkoutLocationName.includes('하이픈') || checkoutLocationName.includes('HAIFN') || checkoutLocationName.includes('강동')) &&
                    !(checkoutLocationName.includes('이높') || checkoutLocationName.includes('ENOUGH_PLACE') || checkoutLocationName.includes('강서'));
                if (isHaifnCheckout) {
                    dispatchVisitSlackAlert({
                        message: alertMessage,
                        userId: checkoutSession.userId,
                        eventType: 'CHECKOUT',
                        locationName: checkoutLocationName,
                    }).catch(error => console.error('Slack QR checkout notification error:', error));
                }

                try {
                const settings = await requestSupabaseRest(
                    'global_settings?select=*',
                    {},
                    1,
                    4000
                );
                let lineToken = '', lineGroupId = '', gsWebhookUrl = '', discordWebhookUrl = '';
                let lineNotificationsEnabled = localStorage.getItem('line_notifications_enabled') !== 'false';

                if (settings) {
                    settings.forEach(s => {
                        if (s.key === 'line_channel_access_token') lineToken = s.value;
                        if (s.key === 'line_group_id') lineGroupId = s.value;
                        if (s.key === 'gs_webhook_url') gsWebhookUrl = s.value;
                        if (s.key === 'discord_webhook_url') discordWebhookUrl = s.value;
                        if (s.key === 'line_notifications_enabled') {
                            lineNotificationsEnabled = s.value !== 'false';
                            localStorage.setItem('line_notifications_enabled', String(lineNotificationsEnabled));
                        }
                    });
                }

                const locName = checkoutSession.locationName || '';
                const isHaifnLoc = (locName.includes('하이픈') || locName.includes('HAIFN') || locName.includes('강동')) &&
                    !(locName.includes('이높') || locName.includes('ENOUGH_PLACE') || locName.includes('강서'));

                if (lineNotificationsEnabled && isHaifnLoc && lineToken && lineGroupId && gsWebhookUrl) {
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
            }

            setCompletedCheckoutLocationName(getLocationDisplayName(checkoutSession.locationName));
            localStorage.removeItem('guest_active_session');
            setShowCheckoutConfirm(false);
            setActiveSession(null);
            setStep('CHECKOUT_SUCCESS');
        } catch (err) {
            console.error('Mobile Guest Checkout Error:', err);
            alert('퇴실 처리 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
        } finally {
            setLoading(false);
        }
    };

    const handleCheckoutCancel = () => {
        setShowCheckoutConfirm(false);
        setActiveSession(null);

        if (activeSession?.isMember) {
            navigate('/student', { replace: true });
        } else {
            setStep('HOME');
        }
    };

    const clearMemberCheckoutUi = () => {
        setCompletedCheckoutLocationName(getLocationDisplayName(checkoutSurveySession?.locationName || activeSession?.locationName));
        localStorage.removeItem('guest_active_session');
        setShowCheckoutSurvey(false);
        setShowCheckoutConfirm(false);
        setCheckoutSurveySession(null);
        setActiveSession(null);
        setStep('CHECKOUT_SUCCESS');
    };

    const finishMemberCheckout = async ({ feedbackText = '', surveyQuestion = '', surveyAnswers = [], surveySubmitted = false } = {}) => {
        // Only a checkout event created/reconciled by this flow may produce an
        // alert. UI state alone is not evidence that a checkout happened.
        const session = checkoutSurveySession;
        const userId = session?.userId || session?.id;
        const checkoutEventId = session?.checkoutEventId;

        // React state does not update synchronously, so two very fast taps can
        // otherwise enter this async callback together. Claim the saved checkout
        // event immediately and allow only one completion path per event.
        const completionKey = checkoutEventId ? String(checkoutEventId) : null;
        if (completionKey && checkoutCompletionInFlightRef.current.has(completionKey)) return;
        if (completionKey) checkoutCompletionInFlightRef.current.add(completionKey);

        try {
            if (userId && checkoutEventId) {
                const [checkoutEvents, users] = await Promise.all([
                    requestSupabaseRest(
                        `logs?select=id,type,created_at,location_id&id=eq.${encodeURIComponent(checkoutEventId)}&user_id=eq.${encodeURIComponent(userId)}&type=eq.CHECKOUT&limit=1`
                    ),
                    requestSupabaseRest(
                        `users?select=id,name,school&id=eq.${encodeURIComponent(userId)}&limit=1`
                    ),
                ]);

                const checkoutEvent = checkoutEvents?.[0];
                const canonicalUser = users?.[0];
                if (!checkoutEvent || !canonicalUser?.name) {
                    throw new Error('퇴실 이벤트 또는 이용자 정보를 확인하지 못했습니다.');
                }

                const notificationKey = `checkout_notification_sent:${checkoutEvent.id}`;
                if (sessionStorage.getItem(notificationKey) !== 'true') {
                    // Set before awaiting network delivery. This closes the race
                    // where repeated callbacks all observed the old false value.
                    sessionStorage.setItem(notificationKey, 'true');
                    try {
                        await sendCheckoutNotification({
                            userId: canonicalUser.id,
                            userName: canonicalUser.name.replace('(guest)', '').trim(),
                            schoolName: canonicalUser.school || '',
                            locationName: session.locationName || '하이픈',
                            // A skipped/abandoned survey is an empty response, not
                            // a fabricated "퇴실 완료" answer.
                            feedbackText: surveySubmitted ? feedbackText : '',
                            surveyQuestion: surveySubmitted ? surveyQuestion : '',
                            surveyAnswers: surveySubmitted ? surveyAnswers : [],
                            isGuest: canonicalUser.user_group === '게스트' || canonicalUser.name?.includes('(guest)'),
                            checkInTime: session.checkInTime || null,
                        });
                    } catch (error) {
                        sessionStorage.removeItem(notificationKey);
                        throw error;
                    }
                }
            }
        } catch (notificationError) {
                console.error('Verified member checkout notification failed:', notificationError);
        } finally {
            if (completionKey) checkoutCompletionInFlightRef.current.delete(completionKey);
            clearMemberCheckoutUi();
        }
    };

    const handleMemberCheckoutConfirm = async () => {
        if (!activeSession) return;
        setLoading(true);
        try {
            const activeVisit = await getActiveVisitSession(activeSession.userId);
            if (!activeVisit) {
                // No active visit means there was no checkout transition in
                // this action. Finish the stale UI without sending an alert.
                clearMemberCheckoutUi();
                return;
            }

            const checkoutSession = { ...activeSession, ...activeVisit };
            const checkoutResult = await recordMobileVisitEvent({
                userId: checkoutSession.userId,
                locationId: checkoutSession.locationId,
                type: 'CHECKOUT',
            });
            if (!['CREATED', 'RECONCILED'].includes(checkoutResult.outcome)) {
                clearMemberCheckoutUi();
                return;
            }

            // Checkout is now final even if the optional survey is abandoned.
            const checkoutEvent = checkoutResult.event || checkoutResult.state?.lastEvent;
            if (!checkoutEvent?.id || checkoutEvent.type !== 'CHECKOUT') {
                throw new Error('저장된 퇴실 이벤트를 확인하지 못했습니다.');
            }
            setCheckoutSurveySession({
                ...checkoutSession,
                checkoutEventId: checkoutEvent.id,
                checkoutTime: checkoutEvent.created_at,
            });
            setShowCheckoutConfirm(false);
            setShowCheckoutSurvey(true);
        } catch (error) {
            console.error('Member checkout error:', error);
            alert('퇴실 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckoutConfirm = () => {
        if (activeSession?.isMember) {
            handleMemberCheckoutConfirm();
            return;
        }
        handleGuestCheckoutSubmit();
    };

    if (requiresRotatingQr && qrAccess.status !== 'VALID') {
        const isVerifying = qrAccess.status === 'VERIFYING';
        return (
            <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-8 text-center select-none font-sans">
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${isVerifying ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-500'}`}>
                    {isVerifying
                        ? <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        : <AlertCircle size={40} />}
                </div>
                <h1 className="text-xl font-black text-gray-800 mb-2">
                    {isVerifying ? 'QR을 확인하고 있어요' : '사용할 수 없는 QR이에요'}
                </h1>
                <p className="text-sm text-gray-500 font-bold leading-relaxed max-w-xs">
                    {isVerifying
                        ? '잠시만 기다려 주세요.'
                        : 'QR이 만료되었거나 현재 하이픈 키오스크의 QR이 아닙니다. 키오스크 화면의 새 QR을 다시 스캔해 주세요.'}
                </p>
            </div>
        );
    }

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
        <div className="h-screen h-[100dvh] bg-[#F8F9FA] text-[#191F28] flex flex-col relative overflow-hidden select-none font-sans bg-[radial-gradient(rgba(148,163,184,0.12)_1.5px,transparent_0)] bg-[size:32px_32px]">
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
            <main className={`flex-1 min-h-0 px-6 relative z-10 max-w-md mx-auto w-full overflow-y-auto overscroll-contain ${step === 'SURVEY' ? 'py-4 flex flex-col justify-start' : 'py-0 flex flex-col justify-center'}`}>
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
                                        onClick={() => {
                                            setStep('FORM');
                                        }}
                                        className="w-full h-14 px-6 bg-[#EAECEF] hover:bg-[#DFE2E6] text-[#191F28] font-bold rounded-2xl border-0 outline-none active:scale-[0.98] transition-all flex items-center justify-between group text-[16px] tracking-tight cursor-pointer"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <User size={20} className="text-[#4E5968]" />
                                            <span>게스트</span>
                                        </div>
                                        <ChevronRight size={20} className="text-[#8B95A1] group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                )}

                                {/* 3. 센터 등록 (프로그램 신청 로그인 경로에서는 숨김) */}
                                {!isProgramLoginFlow && (
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
                                )}
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

                                <div>
                                    <label className="block text-[12px] font-bold text-[#4E5968] mb-1 ml-1">생년월일</label>
                                    <div className="relative">
                                        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B95A1]" />
                                        <input
                                            type="date"
                                            required
                                            max={new Date().toLocaleDateString('en-CA')}
                                            value={guestBirthDate}
                                            onChange={(e) => setGuestBirthDate(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2.5 bg-[#F9FAFB] border border-[#E5E8EB] rounded-xl text-[#191F28] outline-none focus:bg-white focus:border-[#E63946] font-bold text-sm"
                                        />
                                    </div>
                                </div>

                                {parseGuestBirthDate(guestBirthDate)?.isUnder14 && (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                                        <p className="text-xs font-bold text-amber-800">만 14세 미만은 법정대리인의 동의 확인이 필요해요.</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="text" required value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="보호자 이름" className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold outline-none" />
                                            <input type="text" required value={guardianRelation} onChange={(e) => setGuardianRelation(e.target.value)} placeholder="관계 (예: 부모)" className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold outline-none" />
                                        </div>
                                        <input type="tel" required value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value.replace(/[^0-9-]/g, '').slice(0, 13))} placeholder="보호자 연락처" className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold outline-none" />
                                        <label className="flex items-start gap-2 text-[11px] font-medium text-amber-900">
                                            <input type="checkbox" checked={guardianConsent} onChange={(e) => setGuardianConsent(e.target.checked)} className="mt-0.5" />
                                            법정대리인이 개인정보 수집·이용 내용을 확인하고 동의합니다.
                                        </label>
                                    </div>
                                )}

                                <label className="flex items-start gap-2 rounded-xl bg-[#F9FAFB] p-3 text-[11px] leading-relaxed text-[#4E5968]">
                                    <input type="checkbox" required checked={guestPrivacyConsent} onChange={(e) => setGuestPrivacyConsent(e.target.checked)} className="mt-0.5" />
                                    <span><strong>필수 개인정보 수집·이용 동의</strong><br />이름·학교·생년월일을 게스트 확인, 방문 기록 및 연령대 분석에 사용하며 게스트 계정 삭제 또는 정식 회원 전환 시까지 보관합니다. 동의를 거부할 수 있으나 게스트 체크인은 제한됩니다.</span>
                                </label>

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
                    {step === 'ACTIVE_CHECKIN' && activeSession && !showCheckoutConfirm && (
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
                                    onClick={handleCheckoutConfirm}
                                    disabled={loading}
                                    className="w-full h-14 bg-[#E63946] hover:bg-[#D62839] text-white font-bold rounded-2xl transition shadow-md shadow-[#E63946]/25 active:scale-[0.98] disabled:opacity-50 text-[16px] tracking-tight flex items-center justify-between px-6"
                                >
                                    <span>{loading ? '퇴실 처리 중...' : '퇴실하기 (Check-Out)'}</span>
                                    <LogOut size={20} />
                                </button>

                                {!isProgramLoginFlow && (
                                    <button
                                        onClick={() => setShowSignupModal(true)}
                                        className="w-full h-14 bg-[#EAECEF] hover:bg-[#DFE2E6] text-[#191F28] font-bold rounded-2xl border-0 outline-none active:scale-[0.98] transition-all flex items-center justify-between px-6 group text-[16px] tracking-tight"
                                    >
                                        <span>센터 등록</span>
                                        <ChevronRight size={20} className="text-[#8B95A1]" />
                                    </button>
                                )}
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
                                {surveyDescription && (
                                    <p className="text-xs font-semibold leading-relaxed text-gray-500 whitespace-pre-line">
                                        {surveyDescription}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2.5">
                                {(Array.isArray(dynamicSurveyOptions) ? dynamicSurveyOptions : []).map(opt => {
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
                                    if (guestPendingInfo) {
                                        performGuestSurveyComplete(finalPurposes);
                                    } else {
                                        performAutoCheckin(activeUserForSurvey, locParam, finalPurposes);
                                    }
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
                                    {getLocationDisplayName(completedCheckoutLocationName)}에서의 경험은 어떠했나요?<br />
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

            {showCheckoutConfirm && activeSession && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-5">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="w-full max-w-sm rounded-3xl border border-[#E5E8EB] bg-white p-6 text-center shadow-2xl"
                    >
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#E63946]/10 text-[#E63946]">
                            <LogOut size={28} />
                        </div>
                        <h2 className="text-xl font-extrabold text-[#191F28]">체크아웃 하시겠습니까?</h2>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-[#4E5968]">
                            현재 <strong className="font-bold text-[#191F28]">{getLocationDisplayName(activeSession.locationName)}</strong>{getObjectParticle(getLocationDisplayName(activeSession.locationName))} 이용 중이에요!
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-[#6B7684]">
                            <span>📍 {activeSession.locationName || '센터'}</span>
                            {activeSession.checkInTime && (
                                <>
                                    <span className="text-[#D1D6DB]">|</span>
                                    <span className="inline-flex items-center gap-1">
                                        <Clock size={14} />
                                        {new Date(activeSession.checkInTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 체크인
                                    </span>
                                </>
                            )}
                        </div>
                        <div className="mt-6 space-y-2.5">
                            <button
                                onClick={handleCheckoutConfirm}
                                disabled={loading}
                                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#E63946] text-[16px] font-bold text-white shadow-md shadow-[#E63946]/25 transition active:scale-[0.98] disabled:opacity-50"
                            >
                                <LogOut size={19} />
                                {loading ? '체크아웃 처리 중...' : '네, 체크아웃할게요'}
                            </button>
                            <button
                                onClick={handleCheckoutCancel}
                                disabled={loading}
                                className="h-12 w-full rounded-2xl bg-[#F2F4F6] text-sm font-bold text-[#4E5968] transition active:scale-[0.98] disabled:opacity-50"
                            >
                                아니요, 계속 이용할게요
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            <StudentCheckoutSurveyModal
                isOpen={showCheckoutSurvey}
                user={checkoutSurveySession || activeSession}
                locationName={(checkoutSurveySession || activeSession)?.locationName}
                onClose={() => setShowCheckoutSurvey(false)}
                onSurveySaved={(surveyResult) => finishMemberCheckout({ ...surveyResult, surveySubmitted: true })}
                onSurveySkipped={() => finishMemberCheckout({ surveySubmitted: false })}
            />

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
                            {resetCandidate && !isAccountAuthEnabled() && (
                                <button
                                    type="button"
                                    onClick={openPasswordReset}
                                    className="mx-auto block pt-1 text-xs font-bold text-[#3182F6] underline underline-offset-4"
                                >
                                    비밀번호를 잊었나요?
                                </button>
                            )}
                        </form>
                    </motion.div>
                </div>
            )}

            {showPasswordResetModal && resetCandidate && !isAdminAccount(resetCandidate) && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
                    <motion.form
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onSubmit={handlePasswordReset}
                        className="w-full max-w-md space-y-4 rounded-3xl border border-[#E5E8EB] bg-white p-6 shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-[#F2F4F6] pb-3">
                            <div>
                                <h2 className="text-lg font-extrabold text-[#191F28]">비밀번호 초기화</h2>
                                <p className="mt-1 text-xs font-medium text-[#6B7684]">가입 정보 확인 후 새 비밀번호를 설정합니다.</p>
                            </div>
                            <button type="button" onClick={() => setShowPasswordResetModal(false)} className="rounded-full bg-[#F2F4F6] p-2 text-[#8B95A1]">
                                <X size={18} />
                            </button>
                        </div>
                        <p className="rounded-xl bg-[#F8F9FA] px-3 py-2 text-sm font-bold text-[#4E5968]">{resetCandidate.name}님의 계정</p>
                        <input
                            type="text"
                            required
                            value={resetBirth}
                            onChange={(event) => setResetBirth(event.target.value)}
                            placeholder="생년월일 8자리 (예: 20100101)"
                            className="w-full rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] px-3 py-3 text-sm font-bold outline-none focus:border-[#3182F6]"
                        />
                        <input
                            type="tel"
                            required
                            inputMode="numeric"
                            maxLength="4"
                            value={resetPhoneBack4}
                            onChange={(event) => setResetPhoneBack4(event.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="휴대폰 번호 뒤 4자리"
                            className="w-full rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] px-3 py-3 text-sm font-bold outline-none focus:border-[#3182F6]"
                        />
                        <input
                            type="password"
                            required
                            minLength="6"
                            value={resetPassword}
                            onChange={(event) => setResetPassword(event.target.value)}
                            placeholder="새 비밀번호 (6자리 이상)"
                            className="w-full rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] px-3 py-3 text-sm font-bold outline-none focus:border-[#3182F6]"
                        />
                        <input
                            type="password"
                            required
                            minLength="6"
                            value={resetPasswordConfirm}
                            onChange={(event) => setResetPasswordConfirm(event.target.value)}
                            placeholder="새 비밀번호 확인"
                            className="w-full rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] px-3 py-3 text-sm font-bold outline-none focus:border-[#3182F6]"
                        />
                        <button
                            type="submit"
                            disabled={resetLoading}
                            className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#3182F6] text-base font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
                        >
                            {resetLoading ? '확인 중...' : '새 비밀번호로 변경'}
                        </button>
                    </motion.form>
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

            {/* Frequent Guest (Park Ruah etc.) Membership Recommendation Modal */}
            {showFrequentGuestModal && frequentGuestData && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-[#E5E8EB] text-center space-y-4"
                    >
                        <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto text-2xl shadow-inner">
                            ⭐
                        </div>
                        <div className="space-y-1.5">
                            <span className="inline-block px-3 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded-full border border-amber-200">
                                {frequentGuestData.cameFromProgramApplication ? '현재 게스트 상태예요' : '단골 게스트 회원 안내'}
                            </span>
                            <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">
                                {frequentGuestData.cameFromProgramApplication
                                    ? `${frequentGuestData.name}님, 프로그램 신청은 게스트로 접수됐어요`
                                    : `${frequentGuestData.name}님, 벌써 ${frequentGuestData.visitCount}번째 방문이시네요! 🎉`}
                            </h3>
                            <p className="text-xs text-gray-600 leading-relaxed font-medium pt-1">
                                {frequentGuestData.cameFromProgramApplication ? (
                                    <>
                                        아직 정식 회원가입이 완료된 상태는 아닙니다.<br />
                                        정식 회원으로 전환하면 프로그램 신청과 방문 기록이 한 계정에 이어지고, 다음부터 바로 로그인해 체크인할 수 있어요.
                                    </>
                                ) : (
                                    <>
                                        SCI 센터를 자주 이용해 주셔서 감사합니다! 💛<br />
                                        정식 회원으로 등록하시면 매번 게스트 정보를 입력할 필요 없이 모바일 자동 체크인과 다양한 회원 전용 혜택을 이용하실 수 있습니다 ✨
                                    </>
                                )}
                            </p>
                        </div>

                        <div className="space-y-2 pt-2">
                            <button
                                onClick={() => {
                                    setShowFrequentGuestModal(false);
                                    setShowSignupModal(true);
                                }}
                                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold rounded-2xl shadow-md shadow-amber-500/20 transition text-sm active:scale-[0.98]"
                            >
                                ✨ 정식 회원 등록하기
                            </button>
                            <button
                                onClick={() => {
                                    setShowFrequentGuestModal(false);
                                    setStep('SURVEY');
                                }}
                                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition text-xs"
                            >
                                오늘은 게스트로 체크인
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* In-Page Direct Signup Modal Overlay */}
            {showSignupModal && !isProgramLoginFlow && (
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
