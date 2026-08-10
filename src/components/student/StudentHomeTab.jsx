import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, Bell, ShieldCheck, Settings, LogOut, AlertCircle, ChevronRight, User, Image as ImageIcon, Pin, QrCode, Home, Trophy, Calendar as LucideCalendar, Users, Sparkles, Coffee, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import UserAvatar from '../common/UserAvatar';
import ProgramCard from './ProgramCard';
import { startOfDay } from 'date-fns';
import { TAB_NAMES, CATEGORIES } from '../../constants/appConstants';
import { stripHtml, getFirstParagraph } from '../../utils/textUtils';
import TodayOperatingWidget from './components/TodayOperatingWidget';
import LiveCenterChat from './components/LiveCenterChat';
import CoffeeChatModal from './modals/CoffeeChatModal';
import { supabase } from '../../supabaseClient';

const StudentHomeTab = ({
    user,
    unreadNotificationCount,
    setShowProfileSettings,
    setShowNotificationsModal,
    handleShare,
    setShowEnlargedQr,
    navigate,
    adminSchedules,
    calendarCategories,
    dashboardConfig,
    totalHours,
    visitCount,
    programCount,
    setShowProgramHistory,
    handleTabChange,
    homePrograms,
    responses,
    openNoticeDetail,
    homeNotices,
    locationGroups,
    activeUserCountByGroup,
    handleLogout,
    dynamicChallenges,
    specialStats,
    studentRegion,
    selectedRegion,
    setSelectedRegion,
    onStaffClick,
    onCheckPendingRequest,
    pendingCount,
    studentChatStatus,
    activeChat,
    onEndChat,
    onExtendChat,
    dismissedRejectedChatId,
    onDismissRejection,
    onRegisterRegularUser
}) => {
    // 뱃지 관련 로직 제거됨
    const isGuest = user?.user_group === '게스트';
    const today = startOfDay(new Date());
    const matchesSelectedRegion = (cardRegion) => {
        if (!selectedRegion || selectedRegion === 'ALL') return true;
        return (cardRegion || '').toUpperCase() === selectedRegion.toUpperCase();
    };
    const todayClosure = adminSchedules.find(sch => {
        const cat = calendarCategories.find(c => c.id === sch.category_id);
        if (cat?.name !== '휴관') return false;
        const start = startOfDay(new Date(sch.start_date));
        const end = startOfDay(new Date(sch.end_date));
        return today >= start && today <= end;
    });

    let isTodayClosed = false;
    let closureMessage = "";

    if (todayClosure) {
        let closedSpaces = todayClosure.closed_spaces || [];
        try {
            const parsed = JSON.parse(todayClosure.content);
            if (parsed && typeof parsed === 'object' && parsed.closed_spaces) {
                closedSpaces = parsed.closed_spaces;
            }
        } catch (e) { }

        const isHaifnClosed = closedSpaces.includes('HAIFN') || closedSpaces.length === 0;
        const isEnoughPlaceClosed = closedSpaces.includes('ENOUGH_PLACE') || closedSpaces.length === 0;

        if (studentRegion === '강동') {
            isTodayClosed = isHaifnClosed;
        } else if (studentRegion === '강서') {
            isTodayClosed = isEnoughPlaceClosed;
        } else {
            isTodayClosed = isHaifnClosed || isEnoughPlaceClosed;
        }

        if (isHaifnClosed && isEnoughPlaceClosed) {
            closureMessage = "오늘은 센터가 쉬는 날이에요!";
        } else if (isHaifnClosed) {
            closureMessage = "오늘은 하이픈이 쉬는 날이에요!";
        } else if (isEnoughPlaceClosed) {
            closureMessage = "오늘은 이높플레이스가 쉬는 날이에요!";
        }
    }

    return (
        <>
            {/* Premium Integrated Profile Card */}
            <header className="bg-tossBlue px-4 py-5 text-white rounded-b-toss-xl shadow-toss-standard mb-0 gpu-accelerated">
                <div className="max-w-sm sm:max-w-md mx-auto">
                    {/* Top Section: Avatar + Profile Info + 2x2 Stats Grid (가로 1열 고정 구조) */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3 mb-2">
                            {/* Profile Left: Avatar & Info */}
                            <div className="flex items-center gap-3">
                                <div className="relative shrink-0">
                                    <motion.div
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => setShowProfileSettings(true)}
                                        className="cursor-pointer p-0.5 bg-white/20 rounded-full ring-2 ring-white/10"
                                    >
                                        <UserAvatar user={user} size="w-14 h-14 sm:w-16 sm:h-16" textSize="text-lg sm:text-xl" />
                                    </motion.div>
                                </div>
                                <div className="flex flex-col min-w-0 justify-center">
                                    <p className="text-white/80 text-[10px] sm:text-[11px] font-bold tracking-wider uppercase mb-0.5 select-none leading-none">{user?.school || '더작은재단'}</p>
                                    <h1 className="text-[17px] sm:text-[20px] font-bold tracking-tight leading-tight text-white whitespace-nowrap flex items-center gap-1">
                                        {user?.name?.replace('(guest)', '')} 님
                                        {user?.is_leader && <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#FACC15" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                    </h1>
                                </div>
                            </div>

                            {/* Profile Right: Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                {user?.role === 'admin' ? (
                                    <button 
                                        onClick={() => navigate('/admin')}
                                        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition-all px-3 py-1.5 rounded-full border border-white/25 shadow-sm text-white font-bold text-[12px] group"
                                    >
                                        <ShieldCheck size={14} className="text-white shrink-0 group-hover:scale-110 transition-transform" />
                                        <span>관리자 모드</span>
                                    </button>
                                ) : !isGuest ? (
                                    <button 
                                        onClick={() => handleTabChange(TAB_NAMES.HAIFN)}
                                        className="flex items-center gap-1 bg-white/20 hover:bg-white/30 transition-colors px-2.5 py-1 rounded-full border border-white/25 shadow-sm"
                                    >
                                        <div className="w-4 h-4 rounded-full bg-tossCaution text-tossGrey800 flex items-center justify-center text-[9px] font-bold shadow-sm leading-none shrink-0 border border-tossCaution/50">H</div>
                                        <span className="font-bold text-[13px] sm:text-[14px] text-white tracking-tight">{user?.current_haifn || 0}</span>
                                    </button>
                                ) : null}

                                {isGuest && (
                                    <button 
                                        onClick={() => onRegisterRegularUser && onRegisterRegularUser()}
                                        className="gradient-border-button hover:bg-slate-50 text-slate-900 px-3.5 py-1.5 shadow-sm text-xs font-black transition-all active:scale-95 shrink-0"
                                    >
                                        <Sparkles size={11} className="text-indigo-500 shrink-0 mr-1.5" />
                                        <span>하이픈 등록</span>
                                    </button>
                                )}
                                
                                {/* Settings Icon */}
                                <button 
                                    onClick={() => setShowProfileSettings(true)}
                                    className="p-1.5 bg-white/10 hover:bg-white/20 transition-colors rounded-full border border-white/10 text-white/90 shadow-sm"
                                >
                                    <Settings size={16} />
                                </button>

                                {/* Logout Icon */}
                                <button 
                                    onClick={handleLogout}
                                    className="p-1.5 bg-white/10 hover:bg-tossError/80 transition-colors rounded-full border border-white/10 text-white/90 hover:text-white shadow-sm"
                                >
                                    <LogOut size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Bottom Section: Text Summary (Compact) */}
                        <div className="flex flex-col items-center justify-center text-center -mt-2 mb-1.5 gap-2.5">
                            <span className="text-white/90 text-[13.5px] sm:text-[14.5px] font-bold tracking-tight">
                                {isGuest ? (
                                    <>
                                        {user?.school && (
                                            <span className="block text-white/70 text-[13.5px] sm:text-[14.5px] font-bold tracking-tight mb-1">
                                                {user.school.replace('(guest)', '')} 친구 만나서 반가워요 :)
                                            </span>
                                        )}
                                        <span className="block text-white/95">
                                            오늘은 잠깐 들렀지만, 하이픈에서 계속 만나요!
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        그동안 센터에서 <span className="text-tossCaution font-bold">{visitCount}번</span> 만났고, <span className="text-emerald-300 font-bold">{programCount}개</span>의 활동을 함께했어요!
                                    </>
                                )}
                            </span>

                            {/* Admin Testing Region Filter Tabs */}
                            {user?.role === 'admin' && (
                                <div className="flex bg-white/10 p-0.5 rounded-xl w-full border border-white/10 mt-1 select-none">
                                    <button
                                        onClick={() => setSelectedRegion('ALL')}
                                        className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                                            selectedRegion === 'ALL'
                                                ? 'bg-white text-tossBlue shadow-sm'
                                                : 'text-white/70 hover:text-white'
                                        }`}
                                    >
                                        전체
                                    </button>
                                    <button
                                        onClick={() => setSelectedRegion('GANGDONG')}
                                        className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                                            selectedRegion === 'GANGDONG'
                                                ? 'bg-white text-tossBlue shadow-sm'
                                                : 'text-white/70 hover:text-white'
                                        }`}
                                    >
                                        하이픈
                                    </button>
                                    <button
                                        onClick={() => setSelectedRegion('GANGSEO')}
                                        className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                                            selectedRegion === 'GANGSEO'
                                                ? 'bg-white text-tossBlue shadow-sm'
                                                : 'text-white/70 hover:text-white'
                                        }`}
                                    >
                                        이높플레이스
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content Area: Aligned Stack */}
            <div className="px-4 py-4 pb-28 space-y-4 relative z-0">
                {/* Today's Closure Notification */}
                {isTodayClosed && closureMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-toss-xl bg-tossError/10 border border-tossError/20 shadow-toss-subtle flex items-center justify-center relative overflow-hidden"
                    >
                        <div className="flex items-center gap-2">
                            <AlertCircle size={18} strokeWidth={2.5} className="text-tossError" />
                            <p className="text-tossError font-bold text-[14px] tracking-wide">{closureMessage}</p>
                        </div>
                    </motion.div>
                )}

                {/* Coffee Chat Status Bar Widget */}
                {pendingCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-5 rounded-toss-xl bg-white border border-tossGrey100 shadow-toss-standard flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-tossBlue/10 text-tossBlue flex items-center justify-center shrink-0">
                                <Coffee size={20} />
                            </div>
                            <div className="text-left">
                                <h5 className="text-[14px] font-black text-tossGrey900 leading-tight">대기 중인 커피챗 신청</h5>
                                <p className="text-[11px] font-bold text-tossGrey500 mt-1">대기 상태의 대화 신청이 {pendingCount}건 있습니다.</p>
                            </div>
                        </div>
                        <button
                            onClick={onCheckPendingRequest}
                            className="bg-tossBlue text-white text-xs font-black px-3.5 py-2.5 rounded-xl active:scale-95 transition-transform shrink-0"
                        >
                            신청 확인
                        </button>
                    </motion.div>
                )}

                {studentChatStatus && (() => {
                    const isPending = studentChatStatus.status === 'PENDING';
                    const isAccepted = studentChatStatus.status === 'ACCEPTED' && new Date(studentChatStatus.accepted_at) > new Date(Date.now() - 30 * 60 * 1000);
                    const isRejected = studentChatStatus.status === 'REJECTED' && 
                                       studentChatStatus.id !== dismissedRejectedChatId &&
                                       new Date(studentChatStatus.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);
                    
                    if (!isPending && !isAccepted && !isRejected) return null;

                    const staffName = studentChatStatus.users?.name || '선생님';

                    return (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-5 rounded-toss-xl bg-white border border-tossGrey100 shadow-toss-standard flex items-center gap-3"
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                isPending ? 'bg-tossGrey100 text-tossGrey500' :
                                isAccepted ? 'bg-green-50 text-green-500' :
                                'bg-red-50 text-red-500'
                            }`}>
                                <Coffee size={20} />
                            </div>
                            <div className="text-left flex-1 min-w-0">
                                <h5 className="text-[14px] font-black text-tossGrey900 leading-tight">
                                    {isPending ? '커피챗 신청 대기 중' : isAccepted ? '커피챗 신청 수락됨!' : '커피챗 신청 거절 안내'}
                                </h5>
                                <p className="text-[11px] font-semibold text-tossGrey500 mt-1 truncate">
                                    {isPending ? (
                                        `${staffName} 쌤의 대화 수락을 기다리고 있어요.`
                                    ) : isAccepted ? (
                                        `${staffName} 쌤이 수락하셨습니다. 지금 대화하러 가보세요!`
                                    ) : (
                                        `${staffName} 쌤: "${studentChatStatus.rejection_reason || '지금은 바빠서 다음에 나눠요'}"`
                                    )}
                                </p>
                            </div>
                            {isRejected && (
                                <button
                                    onClick={() => onDismissRejection(studentChatStatus.id)}
                                    className="p-1 hover:bg-tossGrey100 rounded-full text-tossGrey400 hover:text-tossGrey600 transition-colors shrink-0 self-start"
                                >
                                    <X size={16} className="stroke-[2.5]" />
                                </button>
                            )}
                        </motion.div>
                    );
                })()}

                {activeChat && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-5 rounded-toss-xl bg-white border border-tossGrey100 shadow-toss-standard flex flex-col gap-4"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 animate-pulse">
                                <Coffee size={20} />
                            </div>
                            <div className="text-left flex-1 min-w-0">
                                <h5 className="text-[14px] font-black text-tossGrey900 leading-tight">진행 중인 커피챗</h5>
                                <p className="text-[11px] font-bold text-tossGrey500 mt-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                    <strong className="text-tossGrey900 font-extrabold">{activeChat.users?.name || '학생'}</strong> 학생과 커피챗 진행 중입니다.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onEndChat(activeChat.id)}
                                className="flex-1 bg-tossGrey100 hover:bg-tossGrey200 text-tossGrey600 text-xs font-black py-2.5 rounded-xl transition-colors active:scale-98"
                            >
                                대화 종료
                            </button>
                            <button
                                onClick={() => onExtendChat(activeChat.id)}
                                className="flex-1 bg-tossBlue text-white text-xs font-black py-2.5 rounded-xl hover:bg-tossBlue/90 transition-colors active:scale-98"
                            >
                                30분 연장
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* Dynamic Section Renderer based on dashboardConfig order */}
                {dashboardConfig.map((item) => {
                    if (!item || !item.isVisible) return null;

                    if (item.id === 'operating_status') {
                        if (isGuest) return null;
                        return (
                            <TodayOperatingWidget 
                                key="operating_status"
                                studentRegion={studentRegion} 
                                adminSchedules={adminSchedules} 
                                calendarCategories={calendarCategories} 
                                onStaffClick={onStaffClick}
                            />
                        );
                    }

                    if (item.id === 'live_chat') {
                        if (isGuest) return null;
                        return (
                            <LiveCenterChat 
                                key="live_chat"
                                currentUser={user} 
                                studentRegion={studentRegion} 
                            />
                        );
                    }

                    if (item.id === 'notices') {
                        return (
                            <div key="notices" className="bg-white p-5 rounded-toss-xl shadow-toss-standard">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-tossWarning/10 text-tossWarning flex items-center justify-center shrink-0">
                                            <Bell size={18} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-tossGrey900 text-[15px] tracking-tight leading-tight">공지사항</h3>
                                            <p className="text-[11px] text-tossGrey500 font-semibold mt-0.5">새로운 소식</p>
                                        </div>
                                    </div>
                                    <button onClick={() => handleTabChange(TAB_NAMES.NOTICES)} className="text-[11px] text-tossGrey600 font-bold px-2.5 py-1.5 bg-tossGrey100 rounded-toss-md hover:bg-tossGrey200 transition-colors">더보기</button>
                                </div>
                                <div className="divide-y divide-tossGrey100">
                                    {homeNotices.slice(0, item.count || 3).map(n => (
                                        <motion.div
                                            key={n.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            onClick={() => openNoticeDetail(n)}
                                            className="py-3.5 first:pt-0 last:pb-0 cursor-pointer group flex justify-between items-start gap-4 hover:bg-tossGrey50/50 px-2 -mx-2 rounded-toss-md transition-all duration-200"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                    {n.is_sticky && (
                                                        <span className="flex items-center gap-0.5 px-2 py-0.5 bg-tossWarning/10 text-tossWarning rounded-full text-[9px] font-bold whitespace-nowrap shrink-0">
                                                            공지
                                                        </span>
                                                    )}
                                                    {n.is_recruiting && (
                                                        <span className="px-2 py-0.5 bg-tossBlueLight text-tossBlue rounded-full text-[9px] font-bold shrink-0">
                                                            모집중
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-tossGrey400 font-bold">{new Date(n.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <h4 className="font-bold text-sm text-tossGrey800 group-hover:text-tossBlue transition-colors line-clamp-1 mb-1 leading-snug">{n.title}</h4>
                                                <p className="text-xs text-tossGrey600 font-medium line-clamp-1 leading-relaxed">{getFirstParagraph(n.content)}</p>
                                            </div>
                                            
                                            {(n.images?.length > 0 || n.image_url) && (
                                                <div className="w-16 h-16 rounded-toss-lg overflow-hidden bg-tossGrey50 shrink-0 border border-tossGrey100 relative shadow-inner">
                                                    <img src={n.images?.length > 0 ? n.images[0] : n.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}
                                    {homeNotices.length === 0 && <p className="text-center py-6 text-tossGrey400 text-xs">등록된 공지사항이 없습니다</p>}
                                </div>
                            </div>
                        );
                    }

                    if (item.id === 'programs') {
                        return (
                            <div key="programs" className="bg-white p-5 rounded-toss-xl shadow-toss-standard">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-tossBlueLight text-tossBlue flex items-center justify-center shrink-0">
                                            <Sparkles size={18} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-tossGrey900 text-[15px] tracking-tight leading-tight">프로그램</h3>
                                            <p className="text-[11px] text-tossGrey500 font-semibold mt-0.5">기독 청소년 라이프스타일을 누려봅시다!</p>
                                        </div>
                                    </div>
                                    <button onClick={() => handleTabChange(TAB_NAMES.PROGRAMS)} className="text-[11px] text-tossGrey600 font-bold px-2.5 py-1.5 bg-tossGrey100 rounded-toss-md hover:bg-tossGrey200 transition-colors">더보기</button>
                                </div>
                                <div className="space-y-5">
                                    {(() => {
                                        const myJoinedPrograms = homePrograms.filter(p => responses[p.id] === 'JOIN');
                                        if (myJoinedPrograms.length === 0) return null;
                                        return (
                                            <div className="mb-4">
                                                <div className="mb-3 flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="w-1 h-3 rounded-full bg-tossBlue shrink-0"></span>
                                                        <h4 className="font-extrabold text-tossGrey900 text-[13.5px] sm:text-[14.5px] leading-none">내가 신청한 프로그램</h4>
                                                    </div>
                                                    <p className="text-[10.5px] sm:text-[11.5px] text-tossGrey500 font-semibold pl-2.5">
                                                        현재 {user?.name?.replace('(guest)', '') || '학생'}님이 참여 신청했어요
                                                    </p>
                                                </div>
                                                <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x no-swipe" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                                    {myJoinedPrograms.map(p => (
                                                        <div key={p.id} className={myJoinedPrograms.length === 1 ? "w-full snap-start shrink-0" : "min-w-[160px] w-[160px] shrink-0 snap-start"}>
                                                            <ProgramCard
                                                                program={{ ...p, responseStatus: responses[p.id] }}
                                                                onClick={openNoticeDetail}
                                                                compact={true}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {(() => {
                                        const openPrograms = homePrograms.filter(p => !p.is_recruiting && responses[p.id] !== 'JOIN');
                                        if (openPrograms.length === 0) return null;
                                        return (
                                            <div>
                                                <div className="mb-3 flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="w-1 h-3 rounded-full bg-tossBlue shrink-0"></span>
                                                        <h4 className="font-extrabold text-tossGrey800 text-[13.5px] sm:text-[14.5px] leading-none">오픈 프로그램</h4>
                                                    </div>
                                                    <p className="text-[10.5px] sm:text-[11.5px] text-tossGrey500 font-semibold pl-2.5">누구나 신청 없이 함께할 수 있어요</p>
                                                </div>
                                                <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x no-swipe" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                                    {openPrograms.slice(0, item.count || 10).map(p => (
                                                        <div key={p.id} className={openPrograms.length === 1 ? "w-full snap-start shrink-0" : "min-w-[160px] w-[160px] shrink-0 snap-start"}>
                                                            <ProgramCard
                                                                program={{ ...p, responseStatus: responses[p.id] }}
                                                                onClick={openNoticeDetail}
                                                                compact={true}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {(() => {
                                        const openPrograms = homePrograms.filter(p => !p.is_recruiting && responses[p.id] !== 'JOIN');
                                        const applyPrograms = homePrograms.filter(p => p.is_recruiting && responses[p.id] !== 'JOIN');
                                        if (applyPrograms.length === 0) return null;
                                        return (
                                            <div className={openPrograms.length > 0 ? "pt-4 border-t border-tossGrey100" : ""}>
                                                <div className="mb-3 flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="w-1 h-3 rounded-full bg-tossBlue shrink-0"></span>
                                                        <h4 className="font-extrabold text-tossGrey800 text-[13.5px] sm:text-[14.5px] leading-none">신청 프로그램</h4>
                                                    </div>
                                                    <p className="text-[10.5px] sm:text-[11.5px] text-tossGrey500 font-semibold pl-2.5">미리 신청하고 약속된 시간에 만나요!</p>
                                                </div>
                                                <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x no-swipe" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                                    {applyPrograms.slice(0, item.count || 10).map(p => (
                                                        <div key={p.id} className={applyPrograms.length === 1 ? "w-full snap-start shrink-0" : "min-w-[160px] w-[160px] shrink-0 snap-start"}>
                                                            <ProgramCard
                                                                program={{ ...p, responseStatus: responses[p.id] }}
                                                                onClick={openNoticeDetail}
                                                                compact={true}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {homePrograms.length === 0 && (
                                        <p className="text-center py-6 text-tossGrey400 text-xs w-full">신청 가능한 프로그램이 없습니다</p>
                                    )}
                                </div>
                            </div>
                        );
                    }

                    return null;
                })}
            </div>

        </>
    );
};

export default React.memo(StudentHomeTab);
