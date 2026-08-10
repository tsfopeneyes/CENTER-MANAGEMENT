import React, { useState, useEffect } from 'react';
import UserAvatar from '../../../common/UserAvatar';

const RealtimeActiveUsers = ({
    activeUsersList = [],
    handleForceCheckout,
    checkinSurveys = [],
    surveyConfig,
    onUserClick
}) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const formatStayDuration = (checkInTime) => {
        if (!checkInTime) return '-';
        const checkInDate = new Date(checkInTime);
        const formattedTime = checkInDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        const diffMs = currentTime - checkInDate;
        const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
        const diffHours = Math.floor(diffMinutes / 60);
        
        const durationStr = diffHours > 0 ? `(${diffHours}시간 ${diffMinutes % 60}분)` : `(${diffMinutes}분)`;
        
        return `${formattedTime} ${durationStr}`;
    };

    const DEFAULT_SURVEY_OPTIONS = [
        { id: '1', emoji: '🍽️', label: '당 충전하며 쉬고 싶어요' },
        { id: '2', emoji: '🎲', label: '아무 생각 없이 놀고 싶어요' },
        { id: '3', emoji: '☕', label: '누군가와 이야기하고 싶어요' },
        { id: '4', emoji: '🙏', label: '기도하거나 예배하고 싶어요' },
        { id: '5', emoji: '📚', label: '조용히 집중하고 싶어요' },
        { id: '6', emoji: '🤷', label: '아직 잘 모르겠어요' }
    ];

    const getUserSurveySelections = (user) => {
        if (!user) return [];

        const allOptions = [
            ...(surveyConfig?.options || []),
            ...DEFAULT_SURVEY_OPTIONS
        ];

        const formatSelection = (val) => {
            if (!val) return '';
            const trimmed = String(val).trim();
            const opt = allOptions.find(o => String(o.id) === trimmed || o.label === trimmed || trimmed.includes(o.label));
            if (opt) return `${opt.emoji} ${opt.label}`;
            return trimmed;
        };

        const todayKst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
        const userCheckinTime = user.checkInTime ? new Date(user.checkInTime).getTime() : 0;

        const userSurvey = checkinSurveys
            ?.filter(s => {
                const matchesUser = s.user_id === user.id || (user.name && (s.user_id === user.name || s.user_name === user.name));
                if (!matchesUser) return false;
                const surveyDateKst = new Date(s.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
                if (surveyDateKst !== todayKst) return false;
                const surveyTime = new Date(s.created_at).getTime();
                return userCheckinTime > 0 && surveyTime >= (userCheckinTime - 5000);
            })
            ?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

        if (userSurvey?.selections && userSurvey.selections.length > 0) {
            return userSurvey.selections.map(formatSelection).filter(Boolean);
        }

        return [];
    };

    return (
        <section className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/20">
                <h3 className="font-black text-xl text-gray-800 tracking-tight">실시간 입실 현황</h3>
                <span className="text-[11px] font-black text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full shadow-sm uppercase tracking-widest border border-blue-100">Total {activeUsersList.length}</span>
            </div>

            {activeUsersList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-28 text-gray-300 font-bold">
                    <p>현재 입실 중인 이용자가 없습니다.</p>
                </div>
            ) : (
                <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50/50 text-gray-400 text-[11px] uppercase tracking-widest font-black border-b border-gray-50">
                                <tr>
                                    <th className="p-6 pl-10">이름</th>
                                    <th className="p-6">현재 위치</th>
                                    <th className="p-6">입실 시간</th>
                                    <th className="p-6">방문 목적</th>
                                    <th className="p-6">학교</th>
                                    <th className="p-6">그룹</th>
                                    <th className="p-6 pr-10 text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 text-sm">
                                {activeUsersList.map(user => {
                                    const selectionsList = getUserSurveySelections(user);
                                    const cleanNameStr = (user.name || '')
                                        .replace('(guest)', '')
                                        .replace(/@/g, '')
                                        .replace(/\(guest\)/gi, '')
                                        .replace(/\(게스트\)/gi, '')
                                        .trim() || '게스트';

                                    return (
                                        <tr key={user.id} className="hover:bg-blue-50/20 transition-all duration-300 group">
                                            <td className="p-6 pl-10 font-bold text-gray-700 align-middle">
                                                <div 
                                                    onClick={() => onUserClick?.(user)}
                                                    className="flex items-center gap-3 cursor-pointer group-hover:text-blue-600 w-fit"
                                                    title="회원 정보 카드 보기"
                                                >
                                                    <UserAvatar user={{ ...user, name: cleanNameStr }} size="w-10 h-10" textSize="text-sm" />
                                                    <span className="hover:underline">{cleanNameStr}</span>
                                                    {user.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                                </div>
                                            </td>
                                            <td className="p-6 text-blue-600 font-black align-middle">{user.currentLocationName}</td>
                                            <td className="p-6 text-gray-700 font-bold whitespace-nowrap align-middle">{formatStayDuration(user.checkInTime)}</td>
                                            <td className="p-6 text-gray-500 font-bold whitespace-nowrap align-middle">
                                                {selectionsList.length > 0 ? (
                                                    <div className="flex flex-col gap-1.5 align-start justify-center">
                                                        {selectionsList.map((sel, idx) => (
                                                            <div key={idx} className="text-xs text-gray-600 bg-slate-100/70 border border-slate-200/50 px-2 py-0.5 rounded-lg w-fit whitespace-nowrap">
                                                                {sel}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    '-'
                                                )}
                                            </td>
                                            <td className="p-6 text-gray-500 font-medium align-middle">{user.school || '-'}</td>
                                            <td className="p-6 align-middle">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap border ${
                                                    user.user_group === '게스트' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                    user.user_group === '졸업생' ? 'bg-gray-100 text-gray-600 border-gray-200' :
                                                    user.user_group === '일반인' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                                                    'bg-blue-50 text-blue-600 border-blue-200'
                                                }`}>
                                                    {user.user_group || '청소년'}
                                                </span>
                                            </td>
                                            <td className="p-6 pr-10 text-right align-middle">
                                                <button
                                                    onClick={() => handleForceCheckout(user.id)}
                                                    className="px-4 py-2 bg-white border border-red-100 text-red-500 text-[11px] font-black rounded-xl hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-300 shadow-sm"
                                                >
                                                    강제 퇴실
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden divide-y divide-gray-100">
                        {activeUsersList.map(user => {
                            const selectionsList = getUserSurveySelections(user);
                            const cleanNameStr = (user.name || '')
                                .replace('(guest)', '')
                                .replace(/@/g, '')
                                .replace(/\(guest\)/gi, '')
                                .replace(/\(게스트\)/gi, '')
                                .trim() || '게스트';

                            return (
                                <div key={user.id} className="p-4 active:bg-gray-50 transition flex items-center justify-between gap-4">
                                    <div 
                                        onClick={() => onUserClick?.(user)}
                                        className="cursor-pointer"
                                        title="회원 정보 카드 보기"
                                    >
                                        <UserAvatar user={{ ...user, name: cleanNameStr }} size="w-10 h-10" textSize="text-xs" />
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        {/* 1행: 이름 + 그룹 뱃지 + 학교명 */}
                                        <div className="flex items-center gap-1.5 mb-1.5 min-w-0 flex-wrap">
                                            <span 
                                                onClick={() => onUserClick?.(user)}
                                                className="font-bold text-gray-800 text-base flex-shrink-0 flex items-center gap-1 cursor-pointer hover:text-blue-600 hover:underline"
                                            >
                                                {cleanNameStr}
                                                {user.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                            </span>
                                            {user.user_group === '게스트' && (
                                                <span className="px-1.5 py-[1px] leading-none inline-flex items-center rounded-full text-[9.5px] font-bold bg-purple-100 text-purple-700 border border-purple-200/80 shrink-0">
                                                    게스트
                                                </span>
                                            )}
                                            {user.school && (
                                                <span className="text-xs text-gray-400 font-medium truncate flex-1 min-w-0">
                                                    ({user.school})
                                                </span>
                                            )}
                                        </div>
                                        {/* 2행: 입실 위치 + 체류 시간 */}
                                        <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                                            <span className="bg-blue-50 text-blue-600 font-semibold px-2 py-0.5 rounded-lg flex-shrink-0 text-[11px]">{user.currentLocationName}</span>
                                            <span className="font-semibold text-gray-600 whitespace-nowrap flex-shrink-0">{formatStayDuration(user.checkInTime)}</span>
                                            {selectionsList.length > 0 && (
                                                <div className="flex flex-col gap-1 w-full mt-1.5">
                                                    {selectionsList.map((sel, idx) => (
                                                        <span key={idx} className="bg-emerald-50 text-emerald-600 font-semibold px-2 py-0.5 rounded-lg text-[10px] w-fit">
                                                            {sel}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleForceCheckout(user.id)}
                                        className="bg-red-50 text-red-500 border border-red-100 px-3 py-2 rounded-xl transition font-bold text-xs flex-shrink-0 active:bg-red-500 active:text-white active:border-red-500 shadow-sm"
                                    >
                                        강제 퇴실
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </section>
    );
};

export default RealtimeActiveUsers;
