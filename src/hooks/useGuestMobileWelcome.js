import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { hashPassword } from '../utils/hashUtils';

export const useGuestMobileWelcome = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Query Parameters
    const searchParams = new URLSearchParams(location.search);
    const locParam = searchParams.get('location') || searchParams.get('loc');
    const isQRCheckin = location.pathname.includes('/mobile-welcome') || location.search.includes('qr=true') || Boolean(locParam);

    // States
    const [step, setStep] = useState('FORM');
    const [name, setName] = useState('');
    const [school, setSchool] = useState('');
    const [gender, setGender] = useState('');
    const [phone, setPhone] = useState('');
    const [birth, setBirth] = useState('');
    const [visitReason, setVisitReason] = useState('');
    const [visitReasonDetail, setVisitReasonDetail] = useState('');

    const [surveyQuestion, setSurveyQuestion] = useState('오늘 쉼터에서 어떤 시간을 보내고 싶나요?');
    const [dynamicSurveyOptions, setDynamicSurveyOptions] = useState([]);
    const [selectedPurposes, setSelectedPurposes] = useState([]);
    const [customPurpose, setCustomPurpose] = useState('');

    const [activeSession, setActiveSession] = useState(null);
    const [createdUser, setCreatedUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isRedirecting, setIsRedirecting] = useState(false);

    // Login Modal States
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [loginName, setLoginName] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
    const [loginDuplicates, setLoginDuplicates] = useState([]);
    const [hashedPassword, setHashedPassword] = useState('');

    // Fetch survey configuration
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

    // Check existing login session on mount
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
                        navigate('/student', { replace: true });
                    }
                    return;
                }
            } catch (e) {
                console.error('Failed to parse saved user:', e);
            }
        }
    }, [isQRCheckin, navigate, ensureCheckinLogAndNavigate]);

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

            if (matchedUser.user_group === '관리자' || matchedUser.role === 'admin') {
                localStorage.setItem('admin_user', JSON.stringify(matchedUser));
                localStorage.setItem('user', JSON.stringify(matchedUser));
                navigate('/admin', { replace: true });
                return true;
            }

            localStorage.setItem('user', JSON.stringify(matchedUser));

            if (isQRCheckin) {
                await ensureCheckinLogAndNavigate(matchedUser);
            } else {
                navigate('/student', { replace: true });
            }
            return true;
        } catch (err) {
            console.error('Login auth error:', err);
            alert('로그인 시도 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
            return false;
        }
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        if (!loginName.trim() || !loginPassword.trim()) {
            alert('이름과 비밀번호를 모두 입력해주세요.');
            return;
        }

        setLoginLoading(true);
        try {
            const hashedPw = await hashPassword(loginPassword);
            setHashedPassword(hashedPw);

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
                await attemptLoginAuth(candidates[0], hashedPw, loginPassword);
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

    return {
        step, setStep,
        name, setName,
        school, setSchool,
        gender, setGender,
        phone, setPhone,
        birth, setBirth,
        visitReason, setVisitReason,
        visitReasonDetail, setVisitReasonDetail,
        surveyQuestion, dynamicSurveyOptions,
        selectedPurposes, setSelectedPurposes,
        customPurpose, setCustomPurpose,
        activeSession, createdUser,
        loading, isRedirecting,
        showLoginModal, setShowLoginModal,
        loginName, setLoginName,
        loginPassword, setLoginPassword,
        loginLoading,
        showDuplicatesModal, setShowDuplicatesModal,
        loginDuplicates, hashedPassword,
        handleLoginSubmit, attemptLoginAuth,
        isQRCheckin, locParam
    };
};
