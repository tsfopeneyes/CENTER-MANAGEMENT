import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { Calendar, User, ArrowLeft, Share, AlertCircle, MapPin, Users, Smartphone, School, CheckCircle2, X } from 'lucide-react';
import NoticeCarousel from '../components/student/components/NoticeCarousel';
import LinkPreview from '../components/common/LinkPreview';
import { extractUrls, extractProgramInfo } from '../utils/textUtils';
import { formatToLocalISO, formatProgramSchedule } from '../utils/dateUtils';
import { TAB_NAMES } from '../constants/appConstants';
import { trackUserWebActivity } from '../utils/userActivityUtils';

const PublicProgramDetail = () => {
    const { id } = useParams();
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
    const [guestForm, setGuestForm] = useState({
        name: '',
        school: '',
        phone: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [selectedMissionForDetail, setSelectedMissionForDetail] = useState(null);
    const [loggedInUser, setLoggedInUser] = useState(null);
    const [isRegistered, setIsRegistered] = useState(false);

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

    const handleGuestSubmit = async (e) => {
        e.preventDefault();
        const gp = notice.guest_properties || { allow_guest: true, require_school: true, require_phone: true };
        const reqSchool = gp.require_school !== false;
        const reqPhone = gp.require_phone !== false;

        if (reqPhone && guestForm.phone.replace(/[^0-9]/g, '').length < 11) {
            alert('연락처 11자리를 올바르게 입력해주세요.');
            return;
        }

        setSubmitting(true);
        try {
            let userId = null;
            let loggedInUser = null;
            
            // 1. Check for existing user by phone (only if phone is required and provided)
            if (reqPhone && guestForm.phone) {
                const { data: existingUser, error: userCheckErr } = await supabase
                    .from('users')
                    .select('*')
                    .eq('phone', guestForm.phone)
                    .maybeSingle();
 
                if (userCheckErr) throw userCheckErr;
 
                if (existingUser) {
                    userId = existingUser.id;
                    loggedInUser = existingUser;
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
                let phoneVal = '';
                let back4 = '';
                if (reqPhone && guestForm.phone) {
                    phoneVal = guestForm.phone;
                    const phoneParts = guestForm.phone.split('-');
                    back4 = phoneParts.length >= 3 ? phoneParts[2] : '';
                } else {
                    const random4 = String(Math.floor(1000 + Math.random() * 9000));
                    phoneVal = `000-0000-${random4}`;
                    back4 = random4;
                }
                const newUserId = '00000000-0000-0000-0000-' + Math.floor(100000000000 + Math.random() * 900000000000);
                const memoText = `[가입일: ${new Date().toLocaleDateString()}] [공유링크 프로그램 비회원 신청]`;

                const { data: newUser, error: createErr } = await supabase
                    .from('users')
                    .insert([{
                        id: newUserId,
                        name: `${guestForm.name}(guest)`,
                        gender: 'M',
                        school: reqSchool ? guestForm.school : '비회원 소속',
                        phone: phoneVal,
                        phone_back4: back4,
                        user_group: '게스트',
                        password: '0000',
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
            const { error: regErr } = await supabase
                .from('notice_responses')
                .insert({
                    notice_id: parseInt(id),
                    user_id: userId,
                    status: 'JOIN',
                    is_attended: false
                });
 
            if (regErr) throw regErr;
 
            // Save guest user login session to localStorage
            if (loggedInUser) {
                localStorage.setItem('user', JSON.stringify(loggedInUser));
                localStorage.setItem('pendingProgramJoin', id);
            }
 
            setIsGuestModalOpen(false);
            setIsSuccessModalOpen(true);
            setGuestForm({ name: '', school: '', phone: '' });

        } catch (err) {
            console.error('Guest Registration Error:', err);
            alert(`신청 처리 중 오류가 발생했습니다.\n${err.message || '다시 시도해 주세요.'}`);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRegisterLoggedIn = async () => {
        if (!loggedInUser) return;
        setSubmitting(true);
        try {
            const { error: regErr } = await supabase
                .from('notice_responses')
                .insert({
                    notice_id: parseInt(id),
                    user_id: loggedInUser.id,
                    status: 'JOIN',
                    is_attended: false
                });

            if (regErr) throw regErr;

            await trackUserWebActivity(loggedInUser);

            localStorage.setItem('pendingProgramJoin', id);
            setIsRegistered(true);
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
    
    // Check existing login session on mount (do not redirect)
    useEffect(() => {
        const checkExistingLogin = async () => {
            const storedUser = localStorage.getItem('user') || localStorage.getItem('admin_user');
            if (storedUser) {
                try {
                    const user = JSON.parse(storedUser);
                    setLoggedInUser(user);
                    
                    // Check if already registered for this notice
                    const { data } = await supabase
                        .from('notice_responses')
                        .select('id')
                        .eq('notice_id', parseInt(id))
                        .eq('user_id', user.id)
                        .maybeSingle();
                        
                    if (data) {
                        setIsRegistered(true);
                    }
                } catch (e) {
                    console.error('Error parsing stored user:', e);
                }
            }
            fetchNotice();
        };
        checkExistingLogin();
    }, [id]);

    const fetchNotice = async () => {
        try {
            const { data, error } = await supabase
                .from('notices')
                .select('*, host:users(id, name, profile_image_url, school, role)')
                .eq('id', id)
                .single();
                
            if (error) throw error;
            setNotice(data);
        } catch (err) {
            console.error(err);
            setNotice(false); // Indicates not found or error
        } finally {
            setLoading(false);
        }
    };

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
        navigate('/'); // Redirect to Landing for login
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
                    onClick={() => {
                        navigator.clipboard.writeText(window.location.href)
                            .then(() => alert('공유 링크가 클립보드에 복사되었습니다!'));
                    }} 
                    className="p-2 hover:bg-gray-50 rounded-full transition text-gray-500"
                >
                    <Share size={20} />
                </button>
            </div>

            {/* Content */}
            <div className="px-6 py-8">
                <NoticeCarousel allImages={allImages} />

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
                                            handleActionClick();
                                        }}
                                        className="w-full py-4 bg-blue-600 text-white font-black text-center rounded-2xl text-sm transition-all hover:bg-blue-700 active:scale-[0.98]"
                                    >
                                        로그인하고 신청하기
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
                {notice.is_recruiting ? (
                    <div className="flex flex-col">
                        {/* Full-width Dark Deadline Bar */}
                        {notice.recruitment_deadline && (
                            <div className="w-full bg-[#1e293b] text-center py-2.5 px-4 text-xs font-bold text-amber-400 tracking-tight">
                                {timeLeft}
                            </div>
                        )}
                        
                        <div className="p-4 flex flex-col gap-2">
                            {loggedInUser ? (
                                isRegistered ? (
                                    <button 
                                        onClick={() => {
                                            localStorage.setItem('pendingProgramJoin', id);
                                            navigate('/student');
                                        }}
                                        className="w-full bg-slate-900 text-white rounded-2xl py-4 font-black text-base transition active:scale-[0.98]"
                                    >
                                        신청 완료됨 (대시보드 이동)
                                    </button>
                                ) : (
                                    <button 
                                        onClick={handleRegisterLoggedIn}
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
                                            onClick={() => setIsGuestModalOpen(true)}
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

            {/* Guest Form Modal */}
            {isGuestModalOpen && (() => {
                const gp = notice.guest_properties || { allow_guest: true, require_school: true, require_phone: true };
                const reqSchool = gp.require_school !== false;
                const reqPhone = gp.require_phone !== false;
                
                const isSubmitDisabled = submitting || 
                    !guestForm.name || 
                    (reqSchool && !guestForm.school) || 
                    (reqPhone && guestForm.phone.replace(/[^0-9]/g, '').length < 11);

                return (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-[2rem] w-full max-w-md p-6 relative shadow-2xl animate-in fade-in zoom-in-95 duration-200">
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
                            프로그램 일정에 맞춰 늦지 않게 방문해 주세요! ✨
                        </p>
                        <button
                            onClick={() => {
                                setIsSuccessModalOpen(false);
                                navigate('/student');
                            }}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-sm transition-all active:scale-[0.98] shadow-lg shadow-blue-100"
                        >
                            내 신청 내역 확인하기
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PublicProgramDetail;
