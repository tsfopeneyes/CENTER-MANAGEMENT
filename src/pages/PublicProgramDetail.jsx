import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Calendar, User, ArrowLeft, Share, AlertCircle, MapPin, Users, Smartphone, School, CheckCircle2, X, Download, Copy, Sparkles } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import NoticeCarousel from '../components/student/components/NoticeCarousel';
import ParticipantModal from '../components/admin/board/components/modals/ParticipantModal';
import ProgramFeedbackModal from '../components/student/modals/ProgramFeedbackModal';
import LinkPreview from '../components/common/LinkPreview';
import { extractUrls, extractProgramInfo } from '../utils/textUtils';
import { formatToLocalISO, formatProgramSchedule } from '../utils/dateUtils';
import { TAB_NAMES } from '../constants/appConstants';
import { trackUserWebActivity } from '../utils/userActivityUtils';
import { sendCategoryNotification } from '../utils/integrationUtils';
import { normalizeSchoolName } from '../utils/userUtils';
import { buildGuestPrivacyPreferences, classifyGuestIdentityMatch, parseGuestBirthDate } from '../utils/guestBirthUtils';
import { getRecruitment, getRegistrationBlockReason } from '../utils/programRecruitment';
import { useCurrentTime } from '../hooks/useCurrentTime';
import ProgramAvailabilityNotice from '../components/student/components/ProgramAvailabilityNotice';
import RecruitmentBadge from '../components/student/components/RecruitmentBadge';
import { readNoticeWithPreview } from '../api/programReadApi';
import SignUpForm from '../components/auth/SignUpForm';
import DatePicker from '../components/common/DatePicker';

const isInternalAccount = (user) => {
    if (!user) return false;
    const role = String(user.role || '').toLowerCase();
    const group = String(user.user_group || '').toLowerCase();
    return Boolean(
        user.is_master ||
        user.name === 'admin' ||
        ['admin', 'master', 'staff', 'rok'].includes(role) ||
        group === 'staff' ||
        user.user_group === '관리자'
    );
};

const isProgramEnded = (program) => {
    if (!program) return false;
    if (program.program_status === 'COMPLETED') return true;
    if ((program.guest_properties?.is_ended ?? program.is_ended) === true) return true;

    const programDate = program.program_date;
    if (!programDate) return false;

    let startDateTime = new Date(programDate);
    if (Number.isNaN(startDateTime.getTime())) {
        startDateTime = new Date(`${programDate}T${program.program_time || '00:00'}`);
    }
    if (Number.isNaN(startDateTime.getTime())) return false;

    let durationMinutes = 60;
    const duration = String(program.program_duration || '').trim();
    if (duration) {
        const hourMatch = duration.match(/([\d.]+)\s*(시간|h)/i);
        const minuteMatch = duration.match(/([\d.]+)\s*(분|m)/i);
        if (hourMatch || minuteMatch) {
            durationMinutes = (hourMatch ? parseFloat(hourMatch[1]) * 60 : 0)
                + (minuteMatch ? parseFloat(minuteMatch[1]) : 0);
        } else {
            const plainNumber = parseFloat(duration);
            if (!Number.isNaN(plainNumber) && plainNumber > 0) {
                durationMinutes = plainNumber <= 12 ? plainNumber * 60 : plainNumber;
            }
        }
    }

    return new Date() >= new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);
};

// The public link is long-lived, so it must not rely on the list page having
// hidden an old program. Keep the same rule for the visible button and the
// write immediately before a response is created.
const getProgramRegistrationBlockReason = getRegistrationBlockReason;

const PublicProgramDetail = () => {
    const { id } = useParams();
    const recruitmentNow = useCurrentTime();
    const navigate = useNavigate();
    const [notice, setNotice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [timeLeft, setTimeLeft] = useState('');
    const [pollTimeLeft, setPollTimeLeft] = useState('');
    const [isPollExpired, setIsPollExpired] = useState(false);
    const [hostUsers, setHostUsers] = useState([]);
    const introRef = React.useRef(null);
    const hostRef = React.useRef(null);
    const [activeTab, setActiveTab] = useState('intro');
    const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
    const [shouldSuggestGuestConversion, setShouldSuggestGuestConversion] = useState(false);
    const [conversionGuest, setConversionGuest] = useState(null);
    const [showGuestConversionForm, setShowGuestConversionForm] = useState(false);
    const [guestForm, setGuestForm] = useState({
        name: '',
        school: '',
        phone: '',
        birth: '',
        privacyConsent: false,
        guardianName: '',
        guardianPhone: '',
        guardianRelation: '',
        guardianConsent: false,
        customAnswers: {},
    });
    const [submitting, setSubmitting] = useState(false);
    const [selectedMissionForDetail, setSelectedMissionForDetail] = useState(null);
    const [loggedInUser, setLoggedInUser] = useState(null);
    const [isRegistered, setIsRegistered] = useState(false);
    const [showParticipantModal, setShowParticipantModal] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [hasReviewed, setHasReviewed] = useState(false);
    const qrCanvasRef = useRef(null);
    const isInternalViewer = isInternalAccount(loggedInUser);
    const programRegistrationBlockReason = getProgramRegistrationBlockReason(notice);
    const isProgramRegistrationOpen = !programRegistrationBlockReason;

    const loadOpenProgramForRegistration = async () => {
        const data = await readNoticeWithPreview(id);

        const reason = getProgramRegistrationBlockReason(data);
        if (reason) throw new Error(reason);
        return data;
    };

    const handleGuestFormChange = (e) => {
        const { name, value } = e.target;
        setGuestForm(prev => ({ ...prev, [name]: value }));
    };

    const handleGuestPhoneChange = (e) => {
        let val = e.target.value.replace(/[^0-9]/g, '');
        if (val.length > 11) val = val.slice(0, 11);
        let formatted = val;
        if (val.length > 3 && val.length <= 7) {
            formatted = `${val.slice(0, 3)}-${val.slice(3)}`;
        } else if (val.length > 7) {
            formatted = `${val.slice(0, 3)}-${val.slice(3, 7)}-${val.slice(7)}`;
        }
        setGuestForm(prev => ({ ...prev, phone: formatted }));
    };

    const countPriorProgramApplications = async (userId) => {
        const { count, error } = await supabase
            .from('notice_responses')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'JOIN');
        if (error) throw error;
        return count || 0;
    };

    const getCustomGuestFields = () => (Array.isArray(notice?.guest_properties?.custom_fields)
        ? notice.guest_properties.custom_fields
        : []).filter(field => field?.id && String(field?.label || '').trim());

    const guestBirthToInputDate = (birth) => {
        const value = String(birth || '');
        if (!/^\d{6}$/.test(value) || ['000000', '999999', '990101'].includes(value)) return '';
        const yy = Number(value.slice(0, 2));
        const currentYY = new Date().getFullYear() % 100;
        const year = yy <= currentYY ? 2000 + yy : 1900 + yy;
        return `${year}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
    };

    const openGuestApplicationForm = (guest = null) => {
        setGuestForm({
            name: guest?.name?.replace(/\(guest\)/gi, '').trim() || '',
            school: guest?.school || '',
            phone: guest?.phone?.startsWith('000-0000-') ? '' : (guest?.phone || ''),
            birth: guestBirthToInputDate(guest?.birth),
            privacyConsent: false,
            guardianName: guest?.guardian_name || '',
            guardianPhone: guest?.guardian_phone || '',
            guardianRelation: guest?.guardian_relation || '',
            guardianConsent: false,
            customAnswers: {},
        });
        setIsGuestModalOpen(true);
    };

    const handleGuestSubmit = async (e) => {
        e.preventDefault();
        const reqSchool = true;
        const reqPhone = true;
        const birthInfo = parseGuestBirthDate(guestForm.birth);

        if (!birthInfo) {
            alert('생년월일을 정확히 입력해주세요.');
            return;
        }
        if (!guestForm.privacyConsent) {
            alert('프로그램 신청을 위한 개인정보 수집·이용에 동의해주세요.');
            return;
        }
        if (birthInfo.isUnder14 && (!guestForm.guardianName.trim() || !guestForm.guardianPhone.trim() || !guestForm.guardianRelation.trim() || !guestForm.guardianConsent)) {
            alert('만 14세 미만은 법정대리인 정보와 동의가 필요합니다.');
            return;
        }
        if (birthInfo.isUnder14 && guestForm.guardianPhone.replace(/[^0-9]/g, '').length < 10) {
            alert('법정대리인 연락처를 정확히 입력해주세요.');
            return;
        }

        if (reqPhone && guestForm.phone.replace(/[^0-9]/g, '').length < 11) {
            alert('연락처 11자리를 올바르게 입력해주세요.');
            return;
        }

        const missingRequiredCustomField = getCustomGuestFields().find(field =>
            field.required === true && !String(guestForm.customAnswers?.[field.id] || '').trim()
        );
        if (missingRequiredCustomField) {
            alert(`필수 항목을 입력해주세요: ${missingRequiredCustomField.label}`);
            return;
        }

        setSubmitting(true);
        try {
            // Re-read just before writing: shared links can stay open while an
            // administrator finishes or closes the program in another tab.
            const registrationNotice = await loadOpenProgramForRegistration();
            let userId = null;
            let loggedInUser = null;
            let hadPriorGuestProgramApplications = false;
            
            // 1. Check for existing user by phone (only if phone is required and provided)
            if (guestForm.phone) {
                const { data: existingUser, error: userCheckErr } = await supabase
                    .from('users')
                    .select('*')
                    .eq('phone', guestForm.phone)
                    .maybeSingle();
 
                if (userCheckErr) throw userCheckErr;
 
                if (existingUser) {
                    if (isInternalAccount(existingUser)) {
                        alert('관리자 및 스태프 계정은 프로그램을 신청할 수 없습니다.');
                        setSubmitting(false);
                        return;
                    }
                    userId = existingUser.id;
                    const identityMatch = classifyGuestIdentityMatch(existingUser, guestForm.phone, birthInfo.yymmdd);
                    if (identityMatch === 'BIRTH_MISMATCH') {
                        alert('같은 연락처의 기록과 생년월일이 일치하지 않아 기존 계정에 연결하지 않았습니다. 입력 정보를 확인하거나 센터에 문의해주세요.');
                        setSubmitting(false);
                        return;
                    }
                    if (existingUser.user_group === '게스트') {
                        // A legacy guest with no real birth can be completed now,
                        // but only a later application with both phone and birth
                        // matching is strong enough to trigger conversion guidance.
                        hadPriorGuestProgramApplications = identityMatch === 'VERIFIED'
                            && (await countPriorProgramApplications(existingUser.id)) > 0;
                        const guestUpdates = {
                            birth: birthInfo.yymmdd,
                            guardian_name: birthInfo.isUnder14 ? guestForm.guardianName.trim() : null,
                            guardian_phone: birthInfo.isUnder14 ? guestForm.guardianPhone.trim() : null,
                            guardian_relation: birthInfo.isUnder14 ? guestForm.guardianRelation.trim() : null,
                            preferences: buildGuestPrivacyPreferences(existingUser.preferences, birthInfo.isUnder14, {
                                purpose: 'guest_program_application_and_age_analysis',
                            }),
                        };
                        const { data: updatedGuest, error: updateGuestError } = await supabase
                            .from('users').update(guestUpdates).eq('id', existingUser.id).select().single();
                        if (updateGuestError) throw updateGuestError;
                        loggedInUser = updatedGuest;
                    } else {
                        localStorage.setItem('pendingProgramJoin', id);
                        setIsGuestModalOpen(false);
                        setSubmitting(false);
                        alert('입력한 연락처와 생년월일로 가입된 정식 회원 계정이 있습니다. 기존 계정으로 로그인한 뒤 신청해주세요.');
                        navigate(`/?programLogin=${encodeURIComponent(id)}`, {
                            state: { fromProgram: true, programId: id }
                        });
                        return;
                    }
                    // 2. Check if already signed up for this program
                    const { data: existingResponse, error: respCheckErr } = await supabase
                        .from('notice_responses')
                        .select('id')
                        .eq('notice_id', id)
                        .eq('user_id', userId)
                        .maybeSingle();
 
                    if (respCheckErr) throw respCheckErr;
 
                    if (existingResponse) {
                        alert('이미 이 연락처로 해당 프로그램 신청이 완료되어 있습니다!');
                        setIsGuestModalOpen(false);
                        setSubmitting(false);
                        return;
                    }
                }
            }
 
            if (!userId) {
                // Create a new guest user
                const phoneVal = guestForm.phone;
                const phoneParts = guestForm.phone.split('-');
                const back4 = phoneParts.length >= 3 ? phoneParts[2] : '';
                const newUserId = '00000000-0000-0000-0000-' + Math.floor(100000000000 + Math.random() * 900000000000);
                const memoText = `[가입일: ${new Date().toLocaleDateString()}] [공유링크 프로그램 비회원 신청]`;

                const { data: newUser, error: createErr } = await supabase
                    .from('users')
                    .insert([{
                        id: newUserId,
                        name: guestForm.name.trim(),
                        gender: 'M',
                        school: normalizeSchoolName(guestForm.school),
                        birth: birthInfo.yymmdd,
                        phone: phoneVal,
                        phone_back4: back4,
                        guardian_name: birthInfo.isUnder14 ? guestForm.guardianName.trim() : null,
                        guardian_phone: birthInfo.isUnder14 ? guestForm.guardianPhone.trim() : null,
                        guardian_relation: birthInfo.isUnder14 ? guestForm.guardianRelation.trim() : null,
                        preferences: buildGuestPrivacyPreferences(null, birthInfo.isUnder14, {
                            purpose: 'guest_program_application_and_age_analysis',
                        }),
                        user_group: '게스트',
                        password: null,
                        role: 'student',
                        status: 'approved',
                        memo: memoText
                    }])
                    .select()
                    .single();

                if (createErr) throw createErr;
                userId = newUser.id;
                loggedInUser = newUser;
            }
 
            // 3. Register to notice_responses
            await loadOpenProgramForRegistration();
            const { error: regErr } = await supabase
                .from('notice_responses')
                .insert({
                    notice_id: parseInt(id),
                    user_id: userId,
                    status: 'JOIN',
                    is_attended: false,
                    application_answers: guestForm.customAnswers || {}
                });
 
            if (regErr) throw regErr;

            try {
                await sendCategoryNotification({
                    category: 'program',
                    message: `[PROGRAM]\n📝 ${loggedInUser?.name?.replace('(guest)', '') || guestForm.name}님이 <${registrationNotice.title || '프로그램'}> 프로그램을 신청했어요!`
                });
            } catch (notificationError) {
                // Registration has already succeeded. Do not misreport it as a
                // failed application or invite a duplicate retry.
                console.error('Program application Slack notification failed after retries:', notificationError);
            }
 
            // Save guest user login session to localStorage
            if (loggedInUser) {
                localStorage.setItem('user', JSON.stringify(loggedInUser));
                localStorage.setItem('pendingProgramJoin', id);
                setLoggedInUser(loggedInUser);
            }
 
            setIsGuestModalOpen(false);
            setShouldSuggestGuestConversion(hadPriorGuestProgramApplications && loggedInUser?.user_group === '게스트');
            setConversionGuest(hadPriorGuestProgramApplications && loggedInUser?.user_group === '게스트' ? loggedInUser : null);
            setIsSuccessModalOpen(true);
            setGuestForm({ name: '', school: '', phone: '', birth: '', privacyConsent: false, guardianName: '', guardianPhone: '', guardianRelation: '', guardianConsent: false, customAnswers: {} });

        } catch (err) {
            console.error('Guest Registration Error:', err);
            alert(`신청 처리 중 오류가 발생했습니다.\n${err.message || '다시 시도해 주세요.'}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRegisterLoggedIn = async () => {
        if (!loggedInUser) return;
        if (isInternalViewer) {
            alert('관리자 및 스태프 계정은 프로그램을 신청할 수 없습니다.');
            return;
        }
        setSubmitting(true);
        try {
            const registrationNotice = await loadOpenProgramForRegistration();
            // Re-read the canonical public.users row immediately before inserting.
            // This prevents a deleted/expired local session from violating the FK.
            const { data: dbUser, error: userErr } = await supabase
                .from('users')
                .select('*')
                .eq('id', loggedInUser.id)
                .maybeSingle();

            if (userErr) throw userErr;
            if (!dbUser) {
                localStorage.removeItem('user');
                localStorage.removeItem('admin_user');
                setLoggedInUser(null);
                setIsRegistered(false);
                alert('회원 세션이 만료되었습니다. 다시 로그인한 후 신청해 주세요.');
                return;
            }

            const hadPriorGuestProgramApplications = dbUser.user_group === '게스트'
                ? (await countPriorProgramApplications(dbUser.id)) > 0
                : false;

            await loadOpenProgramForRegistration();
            const { error: regErr } = await supabase
                .from('notice_responses')
                .insert({
                    notice_id: parseInt(id),
                    user_id: dbUser.id,
                    status: 'JOIN',
                    is_attended: false
                });

            if (regErr) throw regErr;

            try {
                await sendCategoryNotification({
                    category: 'program',
                    message: `[PROGRAM]\n📝 ${dbUser.name?.replace('(guest)', '') || '학생'}님이 <${registrationNotice.title || '프로그램'}> 프로그램을 신청했어요!`
                });
            } catch (notificationError) {
                // Registration has already succeeded. Do not misreport it as a
                // failed application or invite a duplicate retry.
                console.error('Program application Slack notification failed after retries:', notificationError);
            }

            await trackUserWebActivity(loggedInUser, { force: true });

            localStorage.setItem('pendingProgramJoin', id);
            setIsRegistered(true);
            setShouldSuggestGuestConversion(hadPriorGuestProgramApplications);
            setConversionGuest(hadPriorGuestProgramApplications ? dbUser : null);
            setIsSuccessModalOpen(true);
        } catch (err) {
            console.error('Registration Error:', err);
            alert(`신청 처리 중 오류가 발생했습니다.\n${err.message || '다시 시도해 주세요.'}`);
        } finally {
            setSubmitting(false);
        }
    };

    const scrollToSection = (section) => {
        setActiveTab(section);
        const target = section === 'intro' ? introRef.current : hostRef.current;
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    useEffect(() => {
        if (notice) {
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
        }
    }, [notice]);

    useEffect(() => {
        const checkFeedbackStatus = async () => {
            if (!notice?.id || !loggedInUser?.id || !isRegistered) {
                setHasReviewed(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('program_feedback')
                    .select('id')
                    .eq('notice_id', notice.id)
                    .eq('user_id', loggedInUser.id)
                    .maybeSingle();
                if (error) throw error;
                setHasReviewed(Boolean(data));
            } catch (err) {
                console.error('Failed to check program feedback status:', err);
            }
        };

        checkFeedbackStatus();
    }, [notice?.id, loggedInUser?.id, isRegistered, showFeedbackModal]);
    
    // Check existing login session on mount (do not redirect)
    useEffect(() => {
        const checkExistingLogin = async () => {
            // Prefer an active admin session, but verify every stored session against
            // public.users before using its id as notice_responses.user_id. A stale
            // localStorage record otherwise causes a foreign-key error on submit.
            const storedKeys = ['admin_user', 'user'];
            let user = null;

            for (const key of storedKeys) {
                const storedUser = localStorage.getItem(key);
                if (!storedUser) continue;

                try {
                    const parsedUser = JSON.parse(storedUser);
                    if (!parsedUser?.id) {
                        localStorage.removeItem(key);
                        continue;
                    }

                    const { data: dbUser, error: userErr } = await supabase
                        .from('users')
                        .select('*')
                        .eq('id', parsedUser.id)
                        .maybeSingle();

                    if (userErr) throw userErr;
                    if (!dbUser) {
                        localStorage.removeItem(key);
                        continue;
                    }

                    user = { ...parsedUser, ...dbUser };
                    break;
                } catch (e) {
                    console.error(`Error validating stored ${key} session:`, e);
                }
            }

            if (user) {
                setLoggedInUser(user);

                // Check if already registered for this notice
                const { data, error: responseErr } = await supabase
                    .from('notice_responses')
                    .select('id')
                    .eq('notice_id', parseInt(id))
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (responseErr) {
                    console.error('Error checking program registration:', responseErr);
                } else if (data) {
                    setIsRegistered(true);
                }
            }
            fetchNotice();
        };
        checkExistingLogin();
    }, [id]);

    const fetchNotice = async () => {
        try {
            const data = await readNoticeWithPreview(id, '*, host:users(id, name, profile_image_url, school, role)');
            setNotice(data || false);
        } catch (err) {
            console.error(err);
            setNotice(false); // Indicates not found or error
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const refresh = () => fetchNotice();
        const channel = supabase.channel(`public-program-${id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notices', filter: `id=eq.${id}` }, refresh)
            .subscribe();
        window.addEventListener('focus', refresh);
        return () => { window.removeEventListener('focus', refresh); supabase.removeChannel(channel); };
    }, [id]);

    useEffect(() => {
        if (!notice?.is_program_preview) return;
        const start = new Date(notice.recruitment_start_at).getTime();
        const delay = notice.recruitment_details_ready && Number.isFinite(start)
            ? Math.min(60000, Math.max(1500, start - Date.now() + 150)) : 60000;
        const timer = window.setTimeout(fetchNotice, delay);
        return () => window.clearTimeout(timer);
    }, [id, notice]);

    // Timers
    useEffect(() => {
        if (!notice || (!notice.recruitment_deadline && !notice.poll_deadline)) return;
        
        const updateTimer = () => {
            const now = new Date();
            
            // Recruitment Timer
            if (notice.recruitment_deadline) {
                const deadline = new Date(notice.recruitment_deadline);
                if (deadline < now) {
                    setTimeLeft('마감됨');
                } else {
                    const diff = deadline - now;
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                    let timeStr = '신청 마감까지 ';
                    if (days > 0) timeStr += `${days}일 `;
                    timeStr += `${hours}시간 ${minutes}분 ${seconds}초 남았어요!`;
                    setTimeLeft(timeStr);
                }
            }

            // Poll Timer
            if (notice.is_poll && notice.poll_deadline) {
                const deadline = new Date(notice.poll_deadline);
                if (deadline < now) {
                    setPollTimeLeft('마감됨');
                    setIsPollExpired(true);
                } else {
                    const diff = deadline - now;
                    setIsPollExpired(false);
                    let text = '';
                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                    if (days > 0) text += `${days}일 `;
                    text += `${Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))}시간 ${Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))}분 남음`;
                    setPollTimeLeft(text);
                }
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000); // Check every second
        return () => clearInterval(interval);
    }, [notice]);

    const handleActionClick = () => {
        // Save intent for after login
        localStorage.setItem('pendingProgramJoin', id);
        alert('신청(참여) 하려면 로그인이 필요합니다.');
        navigate(`/?programLogin=${encodeURIComponent(id)}`, {
            state: { fromProgram: true, programId: id }
        }); // Redirect to the login landing without exposing center registration
    };

    const getProgramUrl = () => window.location.href;

    const copyProgramUrl = async () => {
        const programUrl = getProgramUrl();
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(programUrl);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = programUrl;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            alert('공유 링크가 클립보드에 복사되었습니다!');
        } catch (err) {
            console.error('Failed to copy program link:', err);
            alert('링크 복사에 실패했습니다. 주소창의 링크를 복사해 주세요.');
        }
    };

    const shareProgramUrl = async () => {
        const programUrl = getProgramUrl();
        if (!navigator.share) {
            await copyProgramUrl();
            return;
        }

        try {
            const shareText = [
                notice?.title || 'SCI CENTER 프로그램',
                formattedSchedule ? `일정: ${formattedSchedule}` : null,
                `장소: ${notice?.program_location || location || '미정'}`,
                '프로그램 내용을 확인하고 신청해 보세요!'
            ].filter(Boolean).join('\n');
            await navigator.share({
                title: notice?.title || 'SCI CENTER 프로그램',
                text: shareText,
                url: programUrl
            });
        } catch (err) {
            if (err?.name !== 'AbortError') {
                console.error('Failed to share program link:', err);
            }
        }
    };

    const downloadProgramQr = () => {
        const canvas = qrCanvasRef.current;
        if (!canvas) return;

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `SCI-CENTER-program-${id}-QR.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (notice === false) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
                <AlertCircle size={48} className="text-gray-400 mb-4" />
                <h1 className="text-2xl font-bold text-gray-800 mb-2">프로그램을 찾을 수 없습니다.</h1>
                <p className="text-gray-500 mb-6">삭제되었거나 주소가 잘못되었습니다.</p>
                <button onClick={() => navigate('/')} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">
                    메인홈으로 가기
                </button>
            </div>
        );
    }

    if (!notice) return null;
    if (!getRecruitment(notice, recruitmentNow).canViewDetails) return (
        <main className="min-h-screen bg-slate-50 px-5 py-12">
            <div className="mx-auto max-w-md rounded-3xl bg-white shadow-sm">
                <button onClick={() => navigate('/')} className="p-4 text-sm font-bold text-blue-600">← 돌아가기</button>
                <ProgramAvailabilityNotice program={notice} now={recruitmentNow} />
            </div>
        </main>
    );

    let allImages = notice.images ? [...notice.images] : [];
    if (allImages.length === 0 && notice.image_url) {
        allImages.push(notice.image_url);
    }

    const { cleanContent, duration, location } = extractProgramInfo(notice.content);
    const formattedSchedule = formatProgramSchedule(
        notice.program_date,
        notice.program_duration || duration,
        notice.is_recruiting,
        notice.program_days,
        notice.program_start_date,
        notice.program_end_date
    );
    const isFeedbackEnabled = notice.enable_feedback === true || notice.guest_properties?.enable_feedback === true;
    const canLeaveFeedback = Boolean(loggedInUser && isRegistered && isProgramEnded(notice) && isFeedbackEnabled);

    return (
        <div className="w-full md:max-w-lg mx-auto min-h-screen bg-white relative pb-64 shadow-2xl">
            {/* Header */}
            <div className="h-14 px-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-50">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/')} className="-ml-2 p-2 hover:bg-gray-50 rounded-full transition">
                        <ArrowLeft size={24} className="text-gray-900" />
                    </button>
                    <div className="font-bold text-sm text-gray-900">프로그램 정보</div>
                </div>
                <button 
                    onClick={() => setIsShareModalOpen(true)}
                    className="p-2 hover:bg-gray-50 rounded-full transition text-gray-500"
                    aria-label="프로그램 공유"
                >
                    <Share size={20} />
                </button>
            </div>

            {/* Content */}
            <div className="px-6 py-8">
                <NoticeCarousel allImages={allImages} />

                <div className="mb-3"><RecruitmentBadge program={notice} now={recruitmentNow} /></div>
                <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-4">{notice.title}</h1>
                
                {notice.category === 'PROGRAM' && (
                    <div className="bg-[#f8fafc] rounded-2xl p-5 space-y-4 mb-6">
                        <div className="flex text-sm leading-relaxed">
                            <span className="w-16 text-gray-500 font-semibold shrink-0">일정</span>
                            <span className="text-blue-600 font-extrabold">{formattedSchedule}</span>
                        </div>
                        <div className="flex text-sm leading-relaxed">
                            <span className="w-16 text-gray-500 font-semibold shrink-0">장소</span>
                            <span className="text-gray-900 font-extrabold">{notice.program_location || location || '미정'}</span>
                        </div>
                        <div className="flex text-sm leading-relaxed">
                            <span className="w-16 text-gray-500 font-semibold shrink-0">인원</span>
                            <span className="text-gray-900 font-extrabold">{notice.max_capacity > 0 ? `${notice.max_capacity}명` : '제한 없음'}</span>
                        </div>
                    </div>
                )}

                {/* Sticky Section Tabs: Only show when both Introduction and Host sections are active */}
                {notice.category === 'PROGRAM' && notice.program_type === 'CENTER' && hostUsers.length > 0 && (
                    <div className="flex border-b border-gray-100 sticky top-14 bg-white/95 backdrop-blur z-20 mb-6">
                        <button
                            onClick={() => scrollToSection('intro')}
                            className={`flex-1 py-3 text-center text-sm font-extrabold border-b-2 transition-all ${
                                activeTab === 'intro' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            소개
                        </button>
                        <button
                            onClick={() => scrollToSection('host')}
                            className={`flex-1 py-3 text-center text-sm font-extrabold border-b-2 transition-all ${
                                activeTab === 'host' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            호스트
                        </button>
                    </div>
                )}

                {/* Information Tags */}
                {notice.category !== 'PROGRAM' && (notice.program_date || notice.max_capacity > 0) && (
                    <div className="flex flex-wrap gap-2 mb-6">
                        {notice.program_date && (
                            <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg">
                                <Calendar size={14} />
                                {new Date(notice.program_date).toLocaleDateString()} 진행
                            </div>
                        )}
                        {notice.max_capacity > 0 && (
                            <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                <User size={14} />
                                선착순 {notice.max_capacity}명
                            </div>
                        )}
                    </div>
                )}

                {/* Body Content */}
                {notice.category === 'PROGRAM' && (
                    <div 
                        ref={notice.program_type === 'CENTER' && hostUsers.length > 0 ? introRef : null} 
                        className={`flex items-center gap-2 scroll-mt-28 ${
                            notice.program_type === 'CENTER' && hostUsers.length > 0 ? 'mt-4 mb-4' : 'mt-8 mb-4'
                        }`}
                    >
                        <div className="w-[3px] h-[14px] bg-blue-500 rounded-full"></div>
                        <h3 className="font-extrabold text-[15px] leading-none text-gray-900">
                            프로그램 소개
                        </h3>
                    </div>
                )}
                <div className="prose max-w-none text-gray-800 leading-snug mb-8">
                    <div dangerouslySetInnerHTML={{ __html: notice.category === 'PROGRAM' ? cleanContent : notice.content }} />
                    {extractUrls(notice.content).map((url, i) => <LinkPreview key={i} url={url} />)}
                </div>

                {/* Challenge Sections: render below intro */}
                {notice.is_challenge && (
                    <div className="mt-8 border-t border-gray-100 pt-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-[3px] h-[14px] bg-blue-500 rounded-full"></div>
                            <h3 className="font-extrabold text-[15px] leading-none text-gray-900">
                                미션 목록
                            </h3>
                        </div>
                        
                        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.015)]">
                            <div className="flex items-center justify-around gap-2">
                                {notice.challenge_missions?.map((mission, index) => (
                                    <div 
                                        key={mission.id}
                                        onClick={() => setSelectedMissionForDetail(mission)}
                                        className="flex flex-col items-center cursor-pointer select-none group flex-1"
                                    >
                                        {/* Icon Circle */}
                                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-xs mb-2 bg-blue-50 text-blue-600 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                            {index + 1}
                                        </div>

                                        {/* Mission Info */}
                                        <span className="text-[11px] font-bold text-gray-900 leading-snug text-center break-all">
                                            {mission.title}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Mission Detail Modal (Overlay) - Read-only for Public View */}
                {selectedMissionForDetail && (() => {
                    const mission = selectedMissionForDetail;
                    return (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.15)] animate-in fade-in zoom-in-95 duration-200">
                                {/* Card Header Banner */}
                                <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-blue-600 tracking-wider uppercase">Mission Card</span>
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></div>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedMissionForDetail(null)}
                                        className="p-1 hover:bg-gray-100 rounded-full transition text-gray-500"
                                    >
                                        <X size={18} className="stroke-[2.5]" />
                                    </button>
                                </div>

                                {/* Card Content */}
                                <div className="p-6">
                                    <h3 className="text-2xl font-black text-gray-900 mb-6">{mission.title}</h3>

                                    <div className="space-y-5 mb-8">
                                        {mission.location && (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">지정 장소</span>
                                                <span className="font-black text-gray-800 text-[15px]">{mission.location}</span>
                                            </div>
                                        )}

                                        {mission.description && (
                                            <div className="flex flex-col gap-1.5">
                                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">미션 가이드</span>
                                                <span className="font-semibold text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{mission.description}</span>
                                            </div>
                                        )}
                                    </div>

                                     <button
                                         onClick={() => {
                                             setSelectedMissionForDetail(null);
                                             if (isInternalViewer) {
                                                 setShowParticipantModal(true);
                                             } else if (loggedInUser) {
                                                 if (isRegistered) navigate('/student');
                                                 else if (loggedInUser.user_group === '게스트') openGuestApplicationForm(loggedInUser);
                                                 else handleRegisterLoggedIn();
                                             } else {
                                                 handleActionClick();
                                             }
                                         }}
                                        className="w-full py-4 bg-blue-600 text-white font-black text-center rounded-2xl text-sm transition-all hover:bg-blue-700 active:scale-[0.98]"
                                    >
                                         {isInternalViewer
                                             ? '신청자 명단'
                                             : (loggedInUser ? (isRegistered ? '신청 현황 보기' : '신청하기') : '로그인하고 신청하기')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {notice.category === 'PROGRAM' && notice.program_type === 'CENTER' && hostUsers.length > 0 && (
                    <div ref={hostRef} className="mb-8 scroll-mt-28 flex flex-col gap-3">
                        {/* Hosts with one-liners: rendered individually */}
                        {hostUsers.filter(h => h.one_liner && h.one_liner.trim() !== '').map(host => (
                            <div key={host.id} className="flex items-center gap-3.5 bg-slate-50/85 border border-gray-100 rounded-2xl p-4 shadow-[0px_1px_3px_rgba(0,0,0,0.03)]">
                                <div className="w-12 h-12 rounded-full overflow-hidden bg-blue-50 border border-gray-100 flex items-center justify-center shrink-0">
                                    {host.profile_image_url ? (
                                        <img src={host.profile_image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <User size={20} className="text-blue-500" />
                                    )}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="font-extrabold text-gray-900 text-sm leading-snug">{host.name}</span>
                                    <span className="text-xs text-gray-600 font-semibold mt-1 break-keep leading-relaxed">{host.one_liner}</span>
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
                            let iconSize = 16;

                            if (count >= 7) {
                                avatarSize = "w-7 h-7";
                                nameSize = "text-[10px]";
                                iconSize = 12;
                            } else if (count === 6) {
                                avatarSize = "w-8 h-8";
                                nameSize = "text-[11px]";
                                iconSize = 14;
                            } else if (count <= 3) {
                                avatarSize = "w-12 h-12";
                                nameSize = "text-sm";
                                iconSize = 20;
                            }

                            return (
                                <div className="flex flex-row items-center justify-center gap-2 sm:gap-4 bg-slate-50/85 border border-gray-100 rounded-2xl p-5 shadow-[0px_1px_3px_rgba(0,0,0,0.03)] w-full">
                                    {noOneLinerHosts.map(host => (
                                        <div key={host.id} className="flex flex-col items-center gap-1 text-center min-w-0 flex-1">
                                            <div className={`${avatarSize} rounded-full overflow-hidden bg-blue-50 border border-gray-100 flex items-center justify-center shrink-0`}>
                                                {host.profile_image_url ? (
                                                    <img src={host.profile_image_url} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <User size={iconSize} className="text-blue-500" />
                                                )}
                                            </div>
                                            <span className={`font-extrabold text-gray-900 ${nameSize} truncate w-full`}>{host.name}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Read-only Poll */}
                {notice.is_poll && notice.poll_options?.length > 0 && (
                    <div className="mb-8 bg-gray-50 p-6 rounded-[2rem] border border-gray-100">
                        <div className="flex flex-col gap-1 mb-5">
                            <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
                                <span className="w-1.5 h-5 bg-blue-500 rounded-full inline-block"></span>
                                프로그램 투표 진행 중
                            </h3>
                            {notice.poll_deadline && <span className={`text-[11px] font-bold ${isPollExpired ? 'text-gray-400' : 'text-red-500'}`}>{pollTimeLeft}</span>}
                        </div>
                        <div className="space-y-3 relative">
                            {/* Overlay to block clicking */}
                            <div className="absolute inset-0 z-10 cursor-pointer" onClick={handleActionClick}></div>
                            {notice.poll_options.map(opt => (
                                <div key={opt.id} className="bg-white border text-gray-800 border-gray-200 rounded-2xl p-4 flex items-center gap-4">
                                    {opt.image_url && (
                                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                                            <img src={opt.image_url} alt={opt.title} className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                    <h4 className="text-sm font-bold flex-1">{opt.title}</h4>
                                </div>
                            ))}
                        </div>
                        <button onClick={handleActionClick} className="w-full mt-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-sm text-gray-600">
                            로그인하고 투표하기
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom Floating Action Bar */}
            <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-lg bg-white/95 backdrop-blur-xl border-t border-gray-100 z-50 safe-area-bottom">
                {(isProgramRegistrationOpen || canLeaveFeedback || isInternalViewer) ? (
                    <div className="flex flex-col">
                        {/* Full-width Dark Deadline Bar */}
                        {isProgramRegistrationOpen && notice.recruitment_deadline && !isProgramEnded(notice) && (
                            <div className="w-full bg-[#1e293b] text-center py-2.5 px-4 text-xs font-bold text-amber-400 tracking-tight">
                                {timeLeft}
                            </div>
                        )}
                        
                        <div className="p-4 flex flex-col gap-2">
                            {isInternalViewer ? (
                                <button
                                    type="button"
                                    onClick={() => setShowParticipantModal(true)}
                                    className="w-full h-11 rounded-toss-xl font-bold text-tossBlue text-xs bg-tossBlueLight hover:bg-blue-100 transition transform active:scale-[0.98] flex items-center justify-center cursor-pointer px-2"
                                >
                                    신청자 명단
                                </button>
                            ) : loggedInUser ? (
                                isRegistered ? (
                                    canLeaveFeedback ? (
                                        <button
                                            onClick={() => setShowFeedbackModal(true)}
                                            className={`w-full rounded-2xl py-4 font-black text-base transition active:scale-[0.98] flex items-center justify-center gap-2 ${
                                                hasReviewed
                                                    ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                                    : 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                            }`}
                                        >
                                            <Sparkles size={19} />
                                            {hasReviewed ? '피드백 작성 완료' : '피드백 작성'}
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => {
                                                localStorage.setItem('pendingProgramJoin', id);
                                                navigate('/student');
                                            }}
                                            className="w-full bg-slate-900 text-white rounded-2xl py-4 font-black text-base transition active:scale-[0.98]"
                                        >
                                            신청 완료됨 (대시보드 이동)
                                        </button>
                                    )
                                ) : (
                                    <button 
                                        onClick={() => loggedInUser.user_group === '게스트' ? openGuestApplicationForm(loggedInUser) : handleRegisterLoggedIn()}
                                        disabled={submitting}
                                        className="w-full bg-blue-600 text-white rounded-2xl py-4 font-black shadow-lg shadow-blue-200 text-base transition active:scale-[0.98] disabled:bg-gray-200 disabled:shadow-none"
                                    >
                                        {submitting ? '신청 처리 중...' : '신청하기'}
                                    </button>
                                )
                            ) : (
                                <>
                                    {/* Primary Button: Log in and apply */}
                                    <button 
                                        onClick={handleActionClick}
                                        className="w-full bg-blue-600 text-white rounded-2xl py-4 font-black shadow-lg shadow-blue-200 text-base transition active:scale-[0.98]"
                                    >
                                        로그인하고 신청하기
                                    </button>
                                    
                                    {/* Secondary Button: Subtle guest application */}
                                    {(notice.guest_properties?.allow_guest !== false) && (
                                        <button 
                                            onClick={() => openGuestApplicationForm()}
                                            className="w-full bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-2xl py-3 font-bold text-xs border border-slate-100 transition active:scale-[0.98]"
                                        >
                                            로그인 없이 비회원으로 신청하기
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="p-4">
                        <button 
                            onClick={() => navigate('/')}
                            className="w-full bg-gray-900 text-white rounded-2xl py-4 font-black"
                        >
                            SCI CENTER 메인홈 가기
                        </button>
                    </div>
                )}
            </div>

            {showParticipantModal && isInternalViewer && (
                <ParticipantModal
                    notice={notice}
                    initialView="attendance"
                    onClose={() => setShowParticipantModal(false)}
                    onRefresh={fetchNotice}
                />
            )}

            {isShareModalOpen && (
                <div
                    className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-5"
                    onClick={() => setIsShareModalOpen(false)}
                >
                    <div
                        className="w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 mb-5">
                            <div>
                                <h2 className="text-lg font-black text-gray-900">프로그램 공유</h2>
                                <p className="mt-1 text-xs font-semibold text-gray-400">QR을 스캔하면 이 프로그램 페이지로 바로 연결됩니다.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsShareModalOpen(false)}
                                className="-mr-2 -mt-2 rounded-full p-2 text-gray-400 hover:bg-gray-100"
                                aria-label="공유 창 닫기"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex justify-center rounded-3xl bg-slate-50 p-5 border border-slate-100">
                            <div className="rounded-2xl bg-white p-3 shadow-sm">
                                <QRCodeCanvas
                                    ref={qrCanvasRef}
                                    value={getProgramUrl()}
                                    size={220}
                                    level="H"
                                    includeMargin
                                />
                            </div>
                        </div>

                        <p className="mt-4 truncate rounded-xl bg-gray-50 px-3 py-2 text-center text-[11px] font-medium text-gray-500">
                            {getProgramUrl()}
                        </p>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={copyProgramUrl}
                                className="flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-200"
                            >
                                <Copy size={16} /> 링크 복사
                            </button>
                            <button
                                type="button"
                                onClick={downloadProgramQr}
                                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
                            >
                                <Download size={16} /> QR 다운로드
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={shareProgramUrl}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-100 px-3 py-3 text-sm font-bold text-blue-600 transition hover:bg-blue-50"
                        >
                            <Share size={16} /> 공유하기
                        </button>
                    </div>
                </div>
            )}

            {showFeedbackModal && (
                <ProgramFeedbackModal
                    program={notice}
                    onClose={() => setShowFeedbackModal(false)}
                    onSuccess={() => {
                        setHasReviewed(true);
                        setShowFeedbackModal(false);
                    }}
                />
            )}

            {/* Guest Form Modal */}
            {isGuestModalOpen && (() => {
                const reqSchool = true;
                const reqPhone = true;
                const guestBirthInfo = parseGuestBirthDate(guestForm.birth);
                const customGuestFields = getCustomGuestFields();
                const hasMissingRequiredCustomAnswer = customGuestFields.some(field =>
                    field.required === true && !String(guestForm.customAnswers?.[field.id] || '').trim()
                );
                
                const isSubmitDisabled = submitting || 
                    !guestForm.name || 
                    !guestBirthInfo ||
                    !guestForm.privacyConsent ||
                    (guestBirthInfo?.isUnder14 && (
                        !guestForm.guardianName.trim() ||
                        guestForm.guardianPhone.replace(/[^0-9]/g, '').length < 10 ||
                        !guestForm.guardianRelation.trim() ||
                        !guestForm.guardianConsent
                    )) ||
                    hasMissingRequiredCustomAnswer ||
                    (reqSchool && !guestForm.school) || 
                    (reqPhone && guestForm.phone.replace(/[^0-9]/g, '').length < 11);

                return (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[2rem] w-full max-w-md max-h-[90vh] overflow-y-auto p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                            <button 
                                onClick={() => setIsGuestModalOpen(false)}
                                className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition text-gray-400"
                            >
                                <X size={20} />
                            </button>
                            
                            <div className="mb-6">
                                <h2 className="text-xl font-black text-gray-900 mb-1">프로그램 신청</h2>
                                <p className="text-xs font-bold text-gray-400">로그인 없이 간단히 정보를 입력해 신청할 수 있습니다.</p>
                            </div>

                            <form onSubmit={handleGuestSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-[11px] font-black text-gray-400 mb-1.5 ml-1 uppercase">이름</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                        <input
                                            type="text"
                                            name="name"
                                            required
                                            value={guestForm.name}
                                            onChange={handleGuestFormChange}
                                            placeholder="이름을 입력하세요"
                                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white outline-none font-bold text-sm"
                                        />
                                    </div>
                                </div>

                                {reqSchool && (
                                    <div>
                                        <label className="block text-[11px] font-black text-gray-400 mb-1.5 ml-1 uppercase">학교 / 소속</label>
                                        <div className="relative">
                                            <School className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                            <input
                                                type="text"
                                                name="school"
                                                required
                                                value={guestForm.school}
                                                onChange={handleGuestFormChange}
                                                placeholder="학교 또는 소속 단체 입력 (예: OO고등학교)"
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white outline-none font-bold text-sm"
                                            />
                                        </div>
                                    </div>
                                )}

                                {reqPhone && (
                                    <div>
                                        <label className="block text-[11px] font-black text-gray-400 mb-1.5 ml-1 uppercase">연락처</label>
                                        <div className="relative">
                                            <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                            <input
                                                type="text"
                                                name="phone"
                                                required
                                                inputMode="tel"
                                                value={guestForm.phone}
                                                onChange={handleGuestPhoneChange}
                                                placeholder="010-0000-0000"
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white outline-none font-bold text-sm tracking-widest"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-[11px] font-black text-gray-400 mb-1.5 ml-1 uppercase">생년월일</label>
                                    <DatePicker label="생년월일" required max={new Date().toLocaleDateString('en-CA')} value={guestForm.birth} onChange={(birth) => setGuestForm(prev => ({ ...prev, birth }))} />
                                </div>

                                {parseGuestBirthDate(guestForm.birth)?.isUnder14 && (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                                        <p className="text-xs font-bold text-amber-800">만 14세 미만은 법정대리인의 동의가 필요합니다.</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input name="guardianName" required value={guestForm.guardianName} onChange={handleGuestFormChange} placeholder="보호자 이름" className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold outline-none" />
                                            <input name="guardianRelation" required value={guestForm.guardianRelation} onChange={handleGuestFormChange} placeholder="관계 (예: 부모)" className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold outline-none" />
                                        </div>
                                        <input name="guardianPhone" type="tel" required value={guestForm.guardianPhone} onChange={(e) => setGuestForm(prev => ({ ...prev, guardianPhone: e.target.value.replace(/[^0-9-]/g, '').slice(0, 13) }))} placeholder="보호자 연락처" className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold outline-none" />
                                        <label className="flex items-start gap-2 text-[11px] font-medium text-amber-900">
                                            <input name="guardianConsent" type="checkbox" checked={guestForm.guardianConsent} onChange={(e) => setGuestForm(prev => ({ ...prev, guardianConsent: e.target.checked }))} className="mt-0.5" />
                                            법정대리인이 개인정보 수집·이용 내용을 확인하고 동의합니다.
                                        </label>
                                    </div>
                                )}

                                {customGuestFields.map(field => (
                                    <div key={field.id}>
                                        <label className="block text-[11px] font-black text-gray-400 mb-1.5 ml-1">
                                            {field.label} {field.required ? '(필수)' : '(선택)'}
                                        </label>
                                        {field.type === 'textarea' ? (
                                            <textarea
                                                required={field.required}
                                                value={guestForm.customAnswers?.[field.id] || ''}
                                                onChange={(e) => setGuestForm(prev => ({
                                                    ...prev,
                                                    customAnswers: { ...prev.customAnswers, [field.id]: e.target.value }
                                                }))}
                                                rows={3}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white outline-none font-bold text-sm resize-none"
                                            />
                                        ) : field.type === 'select' ? (
                                            <select
                                                required={field.required}
                                                value={guestForm.customAnswers?.[field.id] || ''}
                                                onChange={(e) => setGuestForm(prev => ({
                                                    ...prev,
                                                    customAnswers: { ...prev.customAnswers, [field.id]: e.target.value }
                                                }))}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white outline-none font-bold text-sm"
                                            >
                                                <option value="">선택해주세요</option>
                                                {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                required={field.required}
                                                value={guestForm.customAnswers?.[field.id] || ''}
                                                onChange={(e) => setGuestForm(prev => ({
                                                    ...prev,
                                                    customAnswers: { ...prev.customAnswers, [field.id]: e.target.value }
                                                }))}
                                                className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-blue-500/10 focus:bg-white outline-none font-bold text-sm"
                                            />
                                        )}
                                    </div>
                                ))}

                                <label className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-600">
                                    <input name="privacyConsent" type="checkbox" required checked={guestForm.privacyConsent} onChange={(e) => setGuestForm(prev => ({ ...prev, privacyConsent: e.target.checked }))} className="mt-0.5" />
                                    <span><strong>필수 개인정보 수집·이용 동의</strong><br />이름·학교·연락처·생년월일과 위에서 입력한 프로그램별 추가 신청 정보를 신청자 확인, 프로그램 운영 및 연령대 분석에 사용하며 게스트 계정 삭제 또는 정식 회원 전환 시까지 보관합니다.</span>
                                </label>

                                <button
                                    type="submit"
                                    disabled={isSubmitDisabled}
                                    className="w-full mt-6 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-100 disabled:bg-gray-200 disabled:shadow-none transition-all active:scale-[0.98] text-sm"
                                >
                                    {submitting ? '신청 처리 중...' : '신청 완료하기'}
                                </button>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* Success Modal */}
            {isSuccessModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] w-full max-w-sm p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
                            <CheckCircle2 size={32} />
                        </div>
                        <h3 className="text-lg font-black text-gray-900 mb-2">신청이 완료되었습니다!</h3>
                        <p className="text-xs font-semibold text-gray-500 mb-6 leading-relaxed">
                            프로그램 참여 정보가 안전하게 전달되었습니다.<br />
                            {shouldSuggestGuestConversion
                                ? '이전에도 게스트로 신청한 기록이 있어요. 정식 회원으로 전환하면 신청과 방문 기록을 한 계정에서 계속 확인할 수 있습니다.'
                                : '프로그램 일정에 맞춰 늦지 않게 방문해 주세요! ✨'}
                        </p>
                        {shouldSuggestGuestConversion && conversionGuest && (
                            <button
                                onClick={() => {
                                    setIsSuccessModalOpen(false);
                                    setShowGuestConversionForm(true);
                                }}
                                className="w-full py-4 mb-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-black text-sm transition-all active:scale-[0.98] shadow-lg shadow-amber-100"
                            >
                                ✨ 정식 회원으로 전환하기
                            </button>
                        )}
                        <button
                            onClick={() => {
                                setIsSuccessModalOpen(false);
                                navigate('/student');
                            }}
                            className={`w-full py-4 rounded-2xl font-black text-sm transition-all active:scale-[0.98] ${shouldSuggestGuestConversion ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-100'}`}
                        >
                            {shouldSuggestGuestConversion ? '다음에 전환하고 신청 내역 보기' : '내 신청 내역 확인하기'}
                        </button>
                    </div>
                </div>
            )}

            {showGuestConversionForm && conversionGuest && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] w-full max-w-md max-h-[90vh] overflow-y-auto p-6 relative shadow-2xl">
                        <button onClick={() => setShowGuestConversionForm(false)} className="absolute right-5 top-5 p-2 text-gray-400 hover:bg-gray-100 rounded-full">
                            <X size={20} />
                        </button>
                        <div className="mb-5 pr-10">
                            <h2 className="text-xl font-black text-gray-900">하이픈 정식 회원 전환</h2>
                            <p className="text-xs font-semibold text-gray-500 mt-1">기존 프로그램 신청 기록을 유지하면서 정식 회원으로 전환합니다.</p>
                        </div>
                        <SignUpForm
                            guestUserId={conversionGuest.id}
                            prefilledData={{
                                name: conversionGuest.name?.replace(/\(guest\)/gi, '').trim() || '',
                                school: conversionGuest.school || '',
                                birth: conversionGuest.birth || '',
                                phone: conversionGuest.phone?.startsWith('000-0000-') ? '' : (conversionGuest.phone || ''),
                                guardianName: conversionGuest.guardian_name || '',
                                guardianPhone: conversionGuest.guardian_phone || '',
                                guardianRelation: conversionGuest.guardian_relation || '',
                            }}
                            onSuccess={() => {
                                setShowGuestConversionForm(false);
                                localStorage.removeItem('user');
                                alert('정식 회원 전환이 완료되었습니다. 새 비밀번호로 로그인해주세요.');
                                navigate('/');
                            }}
                            onCancel={() => setShowGuestConversionForm(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default PublicProgramDetail;
