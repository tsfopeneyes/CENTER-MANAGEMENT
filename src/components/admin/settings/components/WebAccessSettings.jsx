import React, { useState, useMemo } from 'react';
import { Globe, RefreshCw, Clock, UserX, UserCheck } from 'lucide-react';
import { isAdminOrStaff } from '../../../../utils/userUtils';
import { hasExpiredWebAccessTimestamp } from '../../../../utils/webAccessUtils';

const formatKSTDate = (isoString) => {
    if (!isoString) return '-';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '-';

        return new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(date);
    } catch (e) {
        return '-';
    }
};

const getRelativeTime = (isoString) => {
    if (!isoString) return '';
    try {
        const now = new Date();
        const past = new Date(isoString);
        const diffMs = now - past;
        if (diffMs < 0) return '방금 전';

        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 60) return '방금 전';

        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}분 전`;

        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour}시간 전`;

        const diffDay = Math.floor(diffHour / 24);
        if (diffDay < 30) return `${diffDay}일 전`;

        return `${Math.floor(diffDay / 30)}개월 전`;
    } catch (e) {
        return '';
    }
};

const WebAccessSettings = ({ users = [], fetchData }) => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [excludeStaff, setExcludeStaff] = useState(false);

    const handleRefresh = async () => {
        if (fetchData && typeof fetchData === 'function') {
            setIsRefreshing(true);
            try {
                await fetchData();
            } finally {
                setTimeout(() => setIsRefreshing(false), 500);
            }
        }
    };

    // Filter and sort top 20 users by recent web login time
    const recentWebUsers = useMemo(() => {
        if (!Array.isArray(users)) return [];

        return users
            .filter(u => {
                if (!u || !u.preferences?.last_web_login_at || hasExpiredWebAccessTimestamp(u.preferences)) return false;
                if (excludeStaff && isAdminOrStaff(u)) return false;
                return true;
            })
            .sort((a, b) => {
                const timeA = new Date(a.preferences.last_web_login_at).getTime();
                const timeB = new Date(b.preferences.last_web_login_at).getTime();
                return timeB - timeA;
            })
            .slice(0, 20);
    }, [users, excludeStaff]);

    return (
        <div className="w-full bg-white rounded-2xl md:rounded-[24px] border border-[#f2f4f6] p-4 sm:p-6 shadow-sm flex flex-col gap-5 sm:gap-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 border-b border-gray-100 pb-4 sm:pb-5">
                <div>
                    <h3 className="text-base sm:text-lg font-bold text-[#191f28] flex items-center gap-2 tracking-tight">
                        <Globe className="text-[#3182f6] shrink-0" size={20} />
                        최근 웹 접속 현황 {excludeStaff ? '(학생 전용 상위 20명)' : '(상위 20명)'}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#8b95a1] mt-1 font-medium leading-relaxed">
                        {excludeStaff
                            ? '스탭/관리자를 제외하고 학생 이용자의 최근 웹페이지 접속 시각(KST)을 보여줍니다.'
                            : '서비스 웹페이지에 접속한 이용자를 최근 접속 시각(KST) 기준으로 보여줍니다.'}
                    </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Exclude Staff Button */}
                    <button
                        onClick={() => setExcludeStaff(prev => !prev)}
                        className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl font-bold transition-all text-xs border shrink-0 ${
                            excludeStaff
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm hover:bg-blue-700'
                                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        {excludeStaff ? <UserX size={14} /> : <UserCheck size={14} />}
                        <span>스탭 제외</span>
                    </button>
                    {/* Refresh Button */}
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-2.5 bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-xl font-bold transition-all shadow-xs text-xs shrink-0 active:scale-95 disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-[#3182f6]' : ''} />
                        {isRefreshing ? '갱신 중...' : '새로고침'}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {recentWebUsers.length === 0 ? (
                <div className="py-12 sm:py-16 text-center text-gray-400 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 px-4">
                    <Globe size={36} className="mx-auto mb-2.5 text-gray-300 stroke-[1.5]" />
                    <p className="text-sm font-bold text-gray-500">
                        {excludeStaff ? '최근 기록된 학생 접속 이용자가 없습니다.' : '최근 기록된 웹 접속 이용자가 없습니다.'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">이용자가 웹페이지에 접속하면 자동으로 시각이 기록됩니다.</p>
                </div>
            ) : (
                <>
                    {/* 1. Mobile List View (md:hidden) - Optimized for readability */}
                    <div className="flex flex-col gap-2.5 md:hidden">
                        {recentWebUsers.map((user, index) => {
                            const rawTime = user.preferences?.last_web_login_at;
                            const formattedTime = formatKSTDate(rawTime);
                            const relativeTime = getRelativeTime(rawTime);
                            const isRecent5Min = (new Date() - new Date(rawTime)) < 5 * 60 * 1000;
                            const isStaff = isAdminOrStaff(user);

                            return (
                                <div
                                    key={user.id || index}
                                    className="p-3.5 bg-gray-50/60 border border-gray-100 rounded-xl flex flex-col gap-2 transition-colors hover:bg-blue-50/40"
                                >
                                    {/* Top Row: Rank, User Avatar, Name, Badges & Relative Time */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            {/* Rank Badge */}
                                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black shrink-0 ${
                                                index === 0 ? 'bg-amber-100 text-amber-700' :
                                                index === 1 ? 'bg-slate-200 text-slate-700' :
                                                index === 2 ? 'bg-amber-700/10 text-amber-800' :
                                                'text-gray-400 font-medium'
                                            }`}>
                                                {index + 1}
                                            </span>

                                            {/* Avatar */}
                                            <div className="w-7 h-7 rounded-full bg-blue-100 text-[#3182f6] flex items-center justify-center font-bold text-xs shrink-0">
                                                {user.name ? user.name.substring(0, 1) : 'U'}
                                            </div>

                                            {/* User Name & Badges */}
                                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                                <span className="font-bold text-sm text-[#191f28] whitespace-nowrap">
                                                    {user.name || '미등록'}
                                                </span>
                                                {user.is_leader && (
                                                    <span className="px-1.5 py-0.2 bg-purple-50 text-purple-600 rounded text-[9.5px] font-bold border border-purple-100 shrink-0">
                                                        리더
                                                    </span>
                                                )}
                                                {isStaff && (
                                                    <span className="px-1.5 py-0.2 bg-blue-50 text-blue-600 rounded text-[9.5px] font-bold border border-blue-100 shrink-0">
                                                        스탭
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Relative Time Badge */}
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold shrink-0 ${
                                            isRecent5Min
                                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 animate-pulse'
                                                : 'bg-gray-200/70 text-gray-600'
                                        }`}>
                                            {isRecent5Min && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                                            {relativeTime}
                                        </span>
                                    </div>

                                    {/* Bottom Row: School/Group & KST Timestamp */}
                                    <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-100/80 font-medium">
                                        <div className="truncate max-w-[55%]">
                                            <span>{user.school || user.user_group || '소속 미설정'}</span>
                                            {user.school && user.user_group && (
                                                <span className="text-gray-400"> ({user.user_group})</span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1 text-[11px] font-mono text-gray-600 shrink-0">
                                            <Clock size={12} className="text-gray-400 shrink-0" />
                                            <span>{formattedTime}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 2. Desktop Table View (hidden md:block) */}
                    <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-100 shadow-xs">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/80 text-gray-500 text-xs font-bold border-b border-gray-100">
                                    <th className="py-3.5 px-4 w-16 text-center">순위</th>
                                    <th className="py-3.5 px-4">이용자 이름</th>
                                    <th className="py-3.5 px-4">소속 / 학교</th>
                                    <th className="py-3.5 px-4">최근 웹 접속 일시 (KST)</th>
                                    <th className="py-3.5 px-4 text-right">경과 시간</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {recentWebUsers.map((user, index) => {
                                    const rawTime = user.preferences?.last_web_login_at;
                                    const formattedTime = formatKSTDate(rawTime);
                                    const relativeTime = getRelativeTime(rawTime);
                                    const isRecent5Min = (new Date() - new Date(rawTime)) < 5 * 60 * 1000;
                                    const isStaff = isAdminOrStaff(user);

                                    return (
                                        <tr key={user.id || index} className="hover:bg-blue-50/30 transition-colors">
                                            {/* Rank */}
                                            <td className="py-3.5 px-4 text-center font-black">
                                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                                                    index === 0 ? 'bg-amber-100 text-amber-700 font-bold' :
                                                    index === 1 ? 'bg-slate-200 text-slate-700 font-bold' :
                                                    index === 2 ? 'bg-amber-700/10 text-amber-800 font-bold' :
                                                    'text-gray-400 font-medium'
                                                }`}>
                                                    {index + 1}
                                                </span>
                                            </td>

                                            {/* User Name */}
                                            <td className="py-3.5 px-4 font-bold text-[#191f28]">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-7 h-7 rounded-full bg-blue-100 text-[#3182f6] flex items-center justify-center font-bold text-xs shrink-0">
                                                        {user.name ? user.name.substring(0, 1) : 'U'}
                                                    </div>
                                                    <span className="font-bold text-[#191f28] whitespace-nowrap">{user.name || '미등록'}</span>
                                                    {user.is_leader && (
                                                        <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-bold border border-purple-100 shrink-0">
                                                            리더
                                                        </span>
                                                    )}
                                                    {isStaff && (
                                                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold border border-blue-100 shrink-0">
                                                            스탭/관리자
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Group / School */}
                                            <td className="py-3.5 px-4 text-gray-600">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold text-xs text-gray-700">{user.user_group || '소속 미설정'}</span>
                                                    {user.school && (
                                                        <span className="text-gray-400 text-xs">• {user.school}</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* KST Access Time */}
                                            <td className="py-3.5 px-4 font-mono font-medium text-gray-700 text-xs sm:text-sm">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock size={14} className="text-gray-400" />
                                                    <span>{formattedTime}</span>
                                                </div>
                                            </td>

                                            {/* Relative Time Badge */}
                                            <td className="py-3.5 px-4 text-right">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                                    isRecent5Min
                                                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 animate-pulse'
                                                        : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {isRecent5Min && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                                                    {relativeTime}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default WebAccessSettings;
