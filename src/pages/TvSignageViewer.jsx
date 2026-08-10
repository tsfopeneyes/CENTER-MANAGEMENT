import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { MessageSquare, Users, Clock, Radio, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useLiveCenterChat } from '../hooks/useLiveCenterChat';

const TvSignageViewer = () => {
    const { center: paramCenter } = useParams();
    const [searchParams] = useSearchParams();

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
    const [currentTime, setCurrentTime] = useState(new Date());
    const [activeUsers, setActiveUsers] = useState([]);
    const chatContainerRef = useRef(null);

    // Dummy viewer user for hook subscription
    const viewerUser = { id: 'tv_signage_viewer', name: 'TV_Signage_Display', role: 'viewer' };
    const { messages = [], loading = false } = useLiveCenterChat(activeCenter, viewerUser);

    // Update Live Clock every second
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Sync center change from URL params
    useEffect(() => {
        setActiveCenter(getTargetCenter());
    }, [paramCenter, searchParams]);

    // Fetch active users in this center for TV ticker
    useEffect(() => {
        let isMounted = true;
        const fetchActiveUsers = async () => {
            try {
                const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
                const { data, error } = await supabase
                    .from('logs')
                    .select('*, users(name, school, user_group)')
                    .filter('created_at', 'gte', `${todayKst}T00:00:00+09:00`)
                    .order('created_at', { ascending: false });

                if (!error && data && isMounted) {
                    // Group by user to find active users (no checkout log after last checkin)
                    const userMap = new Map();
                    data.forEach(log => {
                        if (!userMap.has(log.user_id)) {
                            userMap.set(log.user_id, log);
                        }
                    });

                    const activeList = [];
                    userMap.forEach(lastLog => {
                        if (lastLog.action_type === 'CHECK_IN' && !lastLog.checkout_time) {
                            const locName = lastLog.location_name || '';
                            const isThisCenter = activeCenter === '이높플레이스'
                                ? (locName.includes('이높') || locName.includes('강서'))
                                : (!locName.includes('이높') && !locName.includes('강서'));

                            if (isThisCenter) {
                                activeList.push({
                                    id: lastLog.user_id,
                                    name: lastLog.users?.name || '게스트',
                                    school: lastLog.users?.school || '',
                                    checkInTime: lastLog.checkin_time || lastLog.created_at
                                });
                            }
                        }
                    });
                    setActiveUsers(activeList);
                }
            } catch (e) {
                console.warn('TV active users fetch exception:', e);
            }
        };

        fetchActiveUsers();
        const interval = setInterval(fetchActiveUsers, 30000);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [activeCenter]);

    // Auto-scroll chat feed to bottom on new messages
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const formattedTime = currentTime.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const formattedDate = currentTime.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
    });

    return (
        <div className="fixed inset-0 bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
            {/* Top Bar: TV Signage Header */}
            <header className="h-20 bg-slate-900/90 border-b border-slate-800 px-8 flex items-center justify-between shrink-0 shadow-lg backdrop-blur-md">
                {/* Left: Center Switcher Badges */}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-indigo-600/30 text-indigo-400 border border-indigo-500/40 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest">
                        <Radio size={14} className="animate-pulse text-indigo-400" />
                        <span>LIVE TV SIGNAGE</span>
                    </div>

                    <div className="flex bg-slate-800/80 p-1 rounded-2xl border border-slate-700">
                        <button
                            onClick={() => setActiveCenter('하이픈')}
                            className={`px-5 py-2 rounded-xl font-black text-sm transition-all duration-300 flex items-center gap-2 ${
                                activeCenter === '하이픈'
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            <span>🛋️ 하이픈</span>
                        </button>
                        <button
                            onClick={() => setActiveCenter('이높플레이스')}
                            className={`px-5 py-2 rounded-xl font-black text-sm transition-all duration-300 flex items-center gap-2 ${
                                activeCenter === '이높플레이스'
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 scale-105'
                                    : 'text-slate-400 hover:text-white'
                            }`}
                        >
                            <span>💻 이높플레이스</span>
                        </button>
                    </div>
                </div>

                {/* Right: Active Users Counter & Live Clock */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 rounded-2xl text-emerald-400">
                        <Users size={18} className="animate-pulse" />
                        <span className="text-xs font-bold text-slate-300">현재 입실</span>
                        <span className="text-lg font-black text-emerald-400 tabular-nums">{activeUsers.length}명</span>
                    </div>

                    <div className="flex flex-col text-right">
                        <span className="text-xl font-black text-white tracking-tight tabular-nums">{formattedTime}</span>
                        <span className="text-[11px] font-bold text-slate-400">{formattedDate}</span>
                    </div>
                </div>
            </header>

            {/* Main Area: Live Chat Feed */}
            <main 
                ref={chatContainerRef} 
                className="flex-1 overflow-y-auto p-8 space-y-4 scroll-smooth"
                style={{ scrollbarWidth: 'none' }}
            >
                {loading && messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-3">
                        <RefreshCw size={36} className="animate-spin text-indigo-500" />
                        <p className="text-sm font-bold">실시간 대화 내용을 불러오는 중입니다...</p>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-3">
                        <MessageSquare size={48} className="text-slate-700" />
                        <p className="text-base font-bold">오늘 {activeCenter} 센터의 대화 메시지가 아직 없습니다.</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const cleanName = (msg.sender_name || '')
                            .replace('(guest)', '')
                            .replace(/@/g, '')
                            .replace(/\(guest\)/gi, '')
                            .replace(/\(게스트\)/gi, '')
                            .trim() || '게스트';

                        const isStaff = msg.sender_role === 'staff' || msg.sender_role === 'admin' || msg.is_staff;
                        const timeStr = msg.created_at
                            ? new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
                            : '';

                        return (
                            <div 
                                key={msg.id} 
                                className={`flex items-start gap-4 p-4 rounded-3xl transition-all border ${
                                    isStaff 
                                        ? 'bg-gradient-to-r from-indigo-900/40 to-purple-900/30 border-indigo-500/30 shadow-lg shadow-indigo-950/50' 
                                        : 'bg-slate-900/70 border-slate-800/80'
                                }`}
                            >
                                {/* User Avatar */}
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-black shrink-0 shadow-md ${
                                    isStaff ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-blue-400 border border-slate-700'
                                }`}>
                                    {cleanName[0] || ''}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-white text-base tracking-tight">
                                            {cleanName}
                                        </span>
                                        {isStaff && (
                                            <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-black px-2 py-0.5 rounded-md border border-indigo-500/30 uppercase">
                                                스태프
                                            </span>
                                        )}
                                        <span className="text-xs text-slate-500 ml-auto font-medium">
                                            {timeStr}
                                        </span>
                                    </div>

                                    {/* Message Text */}
                                    {msg.content && (
                                        <p className="text-slate-200 text-base leading-relaxed break-words font-medium">
                                            {msg.content}
                                        </p>
                                    )}

                                    {/* Attached Image (if any) */}
                                    {msg.image_url && (
                                        <div className="mt-3 max-w-sm rounded-2xl overflow-hidden border border-slate-800 shadow-md">
                                            <img src={msg.image_url} alt="Chat attachment" className="w-full object-cover max-h-64" />
                                        </div>
                                    )}

                                    {/* Reactions */}
                                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {Object.entries(msg.reactions).map(([emoji, users]) => {
                                                const count = Array.isArray(users) ? users.length : 0;
                                                if (count === 0) return null;
                                                return (
                                                    <span key={emoji} className="bg-slate-800/90 text-slate-300 border border-slate-700/80 px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                                                        <span>{emoji}</span>
                                                        <span className="text-[11px] text-slate-400">{count}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </main>

            {/* Bottom Bar: Active Visitors Marquee Ticker */}
            <footer className="h-14 bg-slate-900 border-t border-slate-800 px-8 flex items-center shrink-0 overflow-hidden">
                <div className="flex items-center gap-2 shrink-0 bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-xl text-xs font-black mr-4">
                    <Users size={14} />
                    <span>실시간 {activeCenter} 이용 현황</span>
                </div>

                <div className="flex-1 overflow-hidden whitespace-nowrap">
                    {activeUsers.length === 0 ? (
                        <span className="text-xs text-slate-500 font-bold">현재 입실 중인 사람이 없습니다.</span>
                    ) : (
                        <div className="inline-flex items-center gap-6 animate-pulse">
                            {activeUsers.map((u) => (
                                <span key={u.id} className="text-xs font-bold text-slate-300 flex items-center gap-1.5 bg-slate-800/60 px-3 py-1 rounded-xl border border-slate-700/50">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    <span className="text-white">{u.name}</span>
                                    {u.school && <span className="text-slate-500">({u.school})</span>}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </footer>
        </div>
    );
};

export default TvSignageViewer;
