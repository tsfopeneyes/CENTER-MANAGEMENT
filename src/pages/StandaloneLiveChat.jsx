import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { MessageSquare, ExternalLink, Copy, Check, Sparkles, User, ShieldCheck, LogIn, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LiveCenterChat from '../components/student/components/LiveCenterChat';

const StandaloneLiveChat = () => {
    const { center: paramCenter } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // 1. Determine Initial Center
    const getTargetCenter = () => {
        const queryCenter = searchParams.get('center');
        const candidate = paramCenter || queryCenter || '';
        const lower = candidate.toLowerCase().trim();

        if (lower === 'enough' || lower === '이높' || lower === '이높플레이스' || lower === 'gangseo' || lower === '강서') {
            return '이높플레이스';
        }
        return '하이픈';
    };

    const [activeCenter, setActiveCenter] = useState(getTargetCenter);
    const [copied, setCopied] = useState(false);

    // Helper to generate a valid UUID for guest session
    const getGuestUuid = () => {
        let savedId = sessionStorage.getItem('standalone_chat_guest_uuid');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!savedId || !uuidRegex.test(savedId)) {
            savedId = typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : '00000000-0000-4000-8000-' + Math.random().toString(16).substring(2, 14).padStart(12, '0');
            sessionStorage.setItem('standalone_chat_guest_uuid', savedId);
        }
        return savedId;
    };

    // 2. User State Management (Logged in or Guest)
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            const stored = localStorage.getItem('user') || localStorage.getItem('admin_user');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to parse logged user', e);
        }
        // Fallback guest name from session
        const savedGuestName = sessionStorage.getItem('standalone_chat_guest_name');
        if (savedGuestName) {
            return {
                id: getGuestUuid(),
                name: savedGuestName,
                role: '학생',
                user_group: '게스트'
            };
        }
        return null;
    });

    const [guestNameInput, setGuestNameInput] = useState('');
    const [showGuestModal, setShowGuestModal] = useState(!currentUser);

    useEffect(() => {
        setActiveCenter(getTargetCenter());
    }, [paramCenter, searchParams]);

    const handleSetGuestUser = (e) => {
        e?.preventDefault();
        const trimmed = guestNameInput.trim();
        if (!trimmed) return;

        const formattedName = trimmed.endsWith('(guest)') || trimmed.endsWith('게스트') ? trimmed : `${trimmed}(guest)`;
        const guestUuid = getGuestUuid();
        const guestUser = {
            id: guestUuid,
            name: formattedName,
            role: '학생',
            user_group: '게스트'
        };

        sessionStorage.setItem('standalone_chat_guest_name', formattedName);
        setCurrentUser(guestUser);
        setShowGuestModal(false);
    };

    const handleCopyUrl = () => {
        const currentUrl = window.location.href;
        navigator.clipboard.writeText(currentUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="min-h-screen bg-[#F8F9FA] text-[#191F28] flex flex-col font-sans select-none relative overflow-hidden bg-[radial-gradient(rgba(148,163,184,0.12)_1.5px,transparent_0)] bg-[size:32px_32px]">
            {/* Background Glow Accents */}
            <div className="absolute inset-0 overflow-hidden -z-10 pointer-events-none">
                <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-gradient-to-b from-blue-500/10 to-indigo-500/5 rounded-full blur-[100px]" />
                <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-purple-500/5 rounded-full blur-[90px]" />
            </div>

            {/* Standalone Header */}
            <header className="bg-white/90 backdrop-blur-md border-b border-[#E5E8EB] px-4 sm:px-6 py-3.5 sticky top-0 z-40 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100 transition"
                        title="메인 홈으로"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-black text-base sm:text-lg text-[#191F28] tracking-tight">
                                SCI CENTER
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[11px] font-bold border border-red-100 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                LIVE 대화방
                            </span>
                        </div>
                        <p className="text-[11px] text-[#8B95A1] font-medium hidden sm:block">
                            센터별 실시간 채팅 전용 페이지
                        </p>
                    </div>
                </div>

                {/* Center Switcher & Actions */}
                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Center Tabs */}
                    <div className="flex items-center bg-[#F2F4F6] p-1 rounded-2xl border border-gray-200/60">
                        <button
                            onClick={() => setActiveCenter('하이픈')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                activeCenter === '하이픈'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            하이픈
                        </button>
                        <button
                            onClick={() => setActiveCenter('이높플레이스')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                activeCenter === '이높플레이스'
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            이높플레이스
                        </button>
                    </div>

                    {/* Copy Link Button */}
                    <button
                        onClick={handleCopyUrl}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition border border-gray-200"
                        title="이 대화방 주소 복사하기"
                    >
                        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                        <span className="hidden sm:inline">{copied ? '복사됨!' : '주소 복사'}</span>
                    </button>
                </div>
            </header>

            {/* Main Chat Area */}
            <main className="flex-1 max-w-4xl w-full mx-auto p-3 sm:p-6 flex flex-col">
                {currentUser ? (
                    <div className="flex-1 flex flex-col bg-white rounded-3xl border border-[#E5E8EB] shadow-xl overflow-hidden p-2 sm:p-4">
                        <LiveCenterChat
                            currentUser={currentUser}
                            studentRegion={activeCenter === '이높플레이스' ? '강서' : '강동'}
                            initialCenter={activeCenter}
                            isStandalone={true}
                        />
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center py-12">
                        <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-2xl max-w-md w-full text-center space-y-4">
                            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-100">
                                <MessageSquare size={32} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-gray-900">실시간 대화 참여하기</h3>
                                <p className="text-xs text-gray-500 mt-1 font-medium">
                                    대화방에서 사용할 닉네임을 입력하시면 바로 참여할 수 있습니다.
                                </p>
                            </div>
                            <form onSubmit={handleSetGuestUser} className="space-y-3 pt-2">
                                <input
                                    type="text"
                                    required
                                    value={guestNameInput}
                                    onChange={(e) => setGuestNameInput(e.target.value)}
                                    placeholder="닉네임 입력 (예: 홍길동)"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:bg-white focus:border-blue-600 transition"
                                />
                                <button
                                    type="submit"
                                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-sm transition shadow-lg shadow-blue-500/25"
                                >
                                    채팅 참여하기
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </main>

            {/* Guest Nickname Overlay Modal if not logged in and requested */}
            <AnimatePresence>
                {showGuestModal && !currentUser && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white max-w-sm w-full p-6 rounded-3xl shadow-2xl border border-gray-100 text-center space-y-4"
                        >
                            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-100">
                                <Sparkles size={28} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900">채팅방 접속 닉네임</h3>
                                <p className="text-xs text-gray-500 mt-1">대화방에 표시할 이름을 입력해주세요</p>
                            </div>
                            <form onSubmit={handleSetGuestUser} className="space-y-3">
                                <input
                                    type="text"
                                    required
                                    autoFocus
                                    value={guestNameInput}
                                    onChange={(e) => setGuestNameInput(e.target.value)}
                                    placeholder="이름 (예: 홍길동)"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:border-blue-600 transition"
                                />
                                <button
                                    type="submit"
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition shadow-md shadow-blue-500/20"
                                >
                                    입장하기
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StandaloneLiveChat;
