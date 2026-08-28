import React from 'react';
import PropTypes from 'prop-types';
import { parseISO } from 'date-fns';
import { RefreshCw, CheckCircle2, Eye, Edit2, Trash2, ImageIcon, Calendar, Clock } from 'lucide-react';
import { CATEGORIES } from '../../utils/constants';
import { parseDurationToMinutes, formatKoreanTimeRange } from '../../../../../utils/dateUtils';

const NoticeCard = ({ 
    notice, 
    viewMode, 
    mode, 
    noticeStats, 
    onViewDetails, 
    onOpenParticipants, 
    onOpenFeedback,
    onStatusChange, 
    onEdit, 
    onDelete 
}) => {
    const formatProgramDays = (daysArray) => {
        if (!daysArray || daysArray.length === 0) return '요일 미지정';
        const labels = ['일', '월', '화', '수', '목', '금', '토'];
        const sortedDays = [...daysArray].sort((a, b) => a - b);
        return sortedDays.map(d => labels[d]).join(', ');
    };



    // Card styles
    let cardClass = "bg-white flex group rounded-[24px] border border-[#f2f4f6] shadow-[0_8px_24px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transform transition-all duration-300 ";
    let contentClass = "flex ";
    let thumbClass = "bg-[#f9fafb] overflow-hidden flex-shrink-0 cursor-pointer transition-colors ";
    let titleClass = "font-bold text-[#191f28] cursor-pointer group-hover:text-[#1b64da] transition-colors line-clamp-2 leading-snug tracking-tight ";

    if (viewMode === 'large') {
        cardClass += "p-4 md:p-6 rounded-[1.5rem] flex-col";
        contentClass += "gap-4 mb-4 md:mb-6";
        thumbClass += "w-16 h-16 md:w-20 md:h-20 rounded-2xl shrink-0";
        titleClass += "text-base md:text-lg mb-1";
    } else if (viewMode === 'small') {
        cardClass += "p-4 rounded-2xl flex-col";
        contentClass += "gap-3 mb-3";
        thumbClass += "w-12 h-12 md:w-16 md:h-16 rounded-xl";
        titleClass += "text-sm md:text-base mb-0.5";
    } else if (viewMode === 'smaller') {
        cardClass += "p-3 rounded-xl flex-col";
        contentClass += "gap-2 mb-2 flex-col"; // Stack image and text
        thumbClass += "w-full aspect-video rounded-lg";
        titleClass += "text-xs md:text-sm mb-0.5";
    } else if (viewMode === 'list') {
        cardClass += "p-3 rounded-xl flex-row items-center justify-between";
        contentClass += "gap-4 items-center flex-1 min-w-0";
        thumbClass += "w-10 h-10 rounded-lg";
        titleClass += "text-sm md:text-base mb-0.5 truncate";
    }

    const hasThumbnail = (notice.images?.length > 0 || notice.image_url);
    const thumbnailSrc = notice.images?.length > 0 ? notice.images[0] : notice.image_url;

    const isEnded = (notice.guest_properties?.is_ended ?? notice.is_ended) === true;
    const isCompleted = notice.program_status === 'COMPLETED' || isEnded;
    const isCancelled = notice.program_status === 'CANCELLED';
    const isActive = (notice.program_status === 'ACTIVE' || !notice.program_status) && !isCompleted && !isCancelled;
    const hasFeedback = (noticeStats[notice.id]?.feedbackCount || 0) > 0;

    const getDeadlineWarning = () => {
        if (!notice.recruitment_deadline) return null;
        const diff = parseISO(notice.recruitment_deadline) - new Date();
        if (diff > 0 && diff < 86400000) {
            return <span className="px-2 py-0.5 bg-[#fdf0f0] text-[#e63c3c] rounded-md text-[9px] font-semibold uppercase tracking-tight">마감직전</span>;
        }
        return null;
    };

    const getTargetBadge = () => {
        if (mode !== CATEGORIES.PROGRAM) return null;
        const targets = notice.target_regions || [];
        if (targets.length === 0 || (targets.includes('강동') && targets.includes('강서'))) {
            return <span className="px-2 py-0.5 bg-[#e8f3ff] text-[#1b64da] rounded-md text-[9px] font-semibold tracking-tight uppercase">All</span>;
        } else if (targets.includes('강동')) {
            return <span className="px-2 py-0.5 bg-[#f3e8ff] text-[#7c3aed] rounded-md text-[9px] font-semibold tracking-tight uppercase">강동</span>;
        } else if (targets.includes('강서')) {
            return <span className="px-2 py-0.5 bg-[#ffe8f3] text-[#db2777] rounded-md text-[9px] font-semibold tracking-tight uppercase">강서</span>;
        }
        return null;
    };

    return (
        <div className={cardClass}>
            <div className={contentClass}>
                {viewMode !== 'list' && (
                    <div onClick={() => onViewDetails(notice)} className={thumbClass}>
                        {hasThumbnail ? (
                            <img src={thumbnailSrc} alt="thumb" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                        ) : (
                            <div className="w-full h-full bg-[#f2f4f6] flex flex-col items-center justify-center text-[#8b95a1] gap-1 select-none">
                                <Calendar size={18} className="text-[#8b95a1] opacity-70" />
                                {notice.is_recruiting === false ? (
                                    <span className="text-[9px] font-semibold tracking-wider text-[#1b64da] bg-[#e8f3ff] px-1.5 py-0.5 rounded-md uppercase">오픈</span>
                                ) : (
                                    <span className="text-[9px] font-semibold tracking-wider text-[#7c3aed] bg-[#f3e8ff] px-1.5 py-0.5 rounded-md uppercase">신청</span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                    {viewMode !== 'list' && (
                        <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                            {getTargetBadge()}
                            {notice.is_sticky && <span className="px-2 py-0.5 bg-[#fff0e6] text-[#ff6b00] rounded-md text-[9px] font-semibold tracking-tight">📌 공지</span>}
                            {notice.is_recruiting && isActive && (
                                <>
                                    <span className="px-2 py-0.5 bg-[#e8f3ff] text-[#1b64da] rounded-md text-[9px] font-semibold tracking-tight uppercase">Active</span>
                                    {getDeadlineWarning()}
                                </>
                            )}
                            {isCompleted && <span className="px-2 py-0.5 bg-[#f2f4f6] text-[#4e5968] rounded-md text-[9px] font-semibold tracking-tight uppercase">Completed</span>}
                            {isCancelled && <span className="px-2 py-0.5 bg-[#fdf0f0] text-[#e63c3c] rounded-md text-[9px] font-semibold tracking-tight uppercase">Cancelled</span>}
                            {hasThumbnail && (
                                <div className="flex items-center gap-1 text-[9px] font-semibold text-[#8b95a1] bg-[#f2f4f6] px-1.5 py-0.5 rounded-md">
                                    <ImageIcon size={10} className="opacity-60" /> {notice.images?.length || 1}
                                </div>
                            )}
                        </div>
                    )}

                    <h3 onClick={() => onViewDetails(notice)} className={`${titleClass} ${!isActive ? 'text-gray-400' : 'text-gray-800'}`}>
                        {viewMode === 'list' && notice.is_sticky && <span className="mr-2 text-orange-500 shrink-0">📌</span>}
                        {viewMode === 'list' && (() => {
                            if (mode === CATEGORIES.PROGRAM) {
                                const targets = notice.target_regions || [];
                                if (targets.length === 0 || (targets.includes('강동') && targets.includes('강서'))) {
                                    return <span className="text-blue-600 mr-1 font-bold">[All]</span>;
                                } else if (targets.includes('강동')) {
                                    return <span className="text-purple-600 mr-1 font-bold">[강동]</span>;
                                } else if (targets.includes('강서')) {
                                    return <span className="text-pink-600 mr-1 font-bold">[강서]</span>;
                                }
                            }
                            return null;
                        })()}
                        {notice.title}
                    </h3>
                    
                    {mode === CATEGORIES.PROGRAM ? (
                        <div className="mt-1.5 space-y-0.5 flex flex-col text-[#4e5968] text-[10px] sm:text-xs md:text-sm font-medium">
                            {notice.is_recruiting === false ? (
                                <>
                                    <div className="flex items-center gap-1.5 text-[#4e5968]">
                                        <Calendar size={13} className="text-[#8b95a1] shrink-0" />
                                        <span>
                                            {(() => {
                                                const start = notice.program_start_date || notice.program_date;
                                                const end = notice.program_end_date;
                                                
                                                if (start && end && start !== end) {
                                                    const s = new Date(start);
                                                    const e = new Date(end);
                                                    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
                                                        const days = ['일', '월', '화', '수', '목', '금', '토'];
                                                        return `${s.getMonth() + 1}/${s.getDate()}(${days[s.getDay()]}) ~ ${e.getMonth() + 1}/${e.getDate()}(${days[e.getDay()]})`;
                                                    }
                                                }
                                                
                                                if (start) {
                                                    const d = new Date(start);
                                                    if (!isNaN(d.getTime())) {
                                                        const days = ['일', '월', '화', '수', '목', '금', '토'];
                                                        return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
                                                    }
                                                }
                                                return `매주 ${formatProgramDays(notice.program_days)}`;
                                            })()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[#4e5968]">
                                        <Clock size={13} className="text-[#8b95a1] shrink-0" />
                                        <span>{formatKoreanTimeRange(notice.program_date || notice.program_start_date, notice.program_duration)}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-1.5 text-[#4e5968]">
                                    <Calendar size={13} className="text-[#8b95a1] shrink-0" />
                                    <span>
                                        {(() => {
                                            if (!notice.program_date) return '미정';
                                            const d = new Date(notice.program_date);
                                            if (isNaN(d.getTime())) return '미정';
                                            const days = ['일', '월', '화', '수', '목', '금', '토'];
                                            const datePart = `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
                                            const timePart = formatKoreanTimeRange(notice.program_date, notice.program_duration);
                                            return `${datePart} ${timePart}`;
                                        })()}
                                    </span>
                                </div>
                            )}
                            <span className="text-[10px] text-[#8b95a1] mt-1">작성일: {new Date(notice.created_at).toLocaleDateString()}</span>
                        </div>
                    ) : (
                        <p className="text-[10px] text-[#8b95a1] mt-1.5">작성일: {new Date(notice.created_at).toLocaleDateString()}</p>
                    )}
                </div>
            </div>

            {/* Actions & Stats */}
            <div className="mt-auto space-y-2 md:space-y-3">
                {(mode === CATEGORIES.PROGRAM || notice.is_poll) && (
                    <div className={`p-2.5 rounded-[16px] flex justify-between items-center transition-all border ${
                        isActive 
                            ? 'bg-[#f9fafb] border-[#f2f4f6]' 
                            : 'bg-[#f9fafb]/60 border-[#f2f4f6]/60 opacity-70'
                    } `}>
                        <div className={`flex gap-3 font-semibold items-center text-[#4e5968] ${viewMode === 'smaller' ? 'text-[9px]' : 'text-[10px] md:text-[11px]'}`}>
                            {notice.is_poll && notice.is_recruiting ? (
                                <>
                                    <span>신청 <span className={isActive ? "text-[#1b64da] font-bold" : "text-[#8b95a1] font-bold"}>{noticeStats[notice.id]?.JOIN || 0}</span></span>
                                    <span>투표 <span className={isActive ? "text-[#7c3aed] font-bold" : "text-[#8b95a1] font-bold"}>{noticeStats[notice.id]?.pollTotal || 0}</span></span>
                                </>
                            ) : notice.is_poll ? (
                                <span>
                                    투표 <span className={isActive ? "text-[#7c3aed] font-bold" : "text-[#8b95a1] font-bold"}>{noticeStats[notice.id]?.pollTotal || 0}</span>
                                </span>
                            ) : notice.is_recruiting ? (
                                <>
                                    <span>신청 <span className={isActive ? "text-[#1b64da] font-bold" : "text-[#8b95a1] font-bold"}>{noticeStats[notice.id]?.JOIN || 0}</span></span>
                                    {viewMode !== 'smaller' && <span className="text-[#8b95a1] font-medium">대기 <span className="text-[#ff6b00] font-bold">{noticeStats[notice.id]?.WAITLIST || 0}</span></span>}
                                </>
                            ) : (
                                <span className={isActive ? "text-[#333d4b] font-semibold" : "text-[#8b95a1] font-semibold"}>오픈 프로그램</span>
                            )}
                        </div>

                        {notice.is_poll && (notice.category === 'PROGRAM' || notice.is_recruiting || mode === CATEGORIES.PROGRAM) ? (
                            <div className="flex items-center gap-1.5">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onOpenParticipants(notice, 'attendance'); }} 
                                    className="text-[9px] md:text-[10px] px-2.5 py-1 rounded-xl font-semibold transition-all bg-[#e8f3ff] text-[#1b64da] hover:bg-[#d0e6ff] active:scale-95"
                                >
                                    명단
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onOpenParticipants(notice, 'poll'); }} 
                                    className="text-[9px] md:text-[10px] px-2.5 py-1 rounded-xl font-semibold transition-all bg-purple-100 text-purple-700 hover:bg-purple-200 active:scale-95"
                                >
                                    투표결과
                                </button>
                                {hasFeedback && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onOpenFeedback(notice); }}
                                        className="text-[9px] md:text-[10px] px-2.5 py-1 rounded-xl font-semibold transition-all bg-amber-100 text-amber-700 hover:bg-amber-200 active:scale-95"
                                    >
                                        피드백
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onOpenParticipants(notice, notice.is_poll ? 'poll' : 'attendance'); }} 
                                    className={`text-[9px] md:text-[10px] px-3 py-1.5 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                        isActive 
                                            ? 'bg-[#e8f3ff] text-[#1b64da] hover:bg-[#d0e6ff]' 
                                            : 'bg-[#f2f4f6] text-[#4e5968] hover:bg-[#e4e8eb]'
                                    }`}
                                >
                                    {notice.is_poll ? '투표결과' : '명단'}
                                </button>
                                {hasFeedback && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onOpenFeedback(notice); }}
                                        className="text-[9px] md:text-[10px] px-2.5 py-1.5 rounded-xl font-semibold transition-all bg-amber-100 text-amber-700 hover:bg-amber-200 active:scale-[0.98]"
                                    >
                                        피드백
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className={`flex items-center justify-between lg:gap-2 pt-2 md:pt-3 border-t border-[#f2f4f6]`}>
                    <div className="flex items-center gap-1 text-[11px] font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-md" title="이용자 조회수 (스탭 제외)">
                        <Eye size={12} className="text-gray-400" />
                        <span>조회 {notice.view_count || 0}회</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {mode === CATEGORIES.PROGRAM && (
                            <>
                                {isActive ? (
                                    <button onClick={() => onStatusChange(notice.id, 'COMPLETED')} className="p-1 sm:p-1.5 md:p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all" title="완료 처리">
                                        <CheckCircle2 size={viewMode === 'large' ? 16 : 14} />
                                    </button>
                                ) : (
                                    <button onClick={() => onStatusChange(notice.id, 'ACTIVE')} className="p-1 sm:p-1.5 md:p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-all" title="되돌리기">
                                        <RefreshCw size={viewMode === 'large' ? 16 : 14} />
                                    </button>
                                )}
                            </>
                        )}
                        <button onClick={() => onViewDetails(notice)} className="p-1 sm:p-1.5 md:p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="미리보기">
                            <Eye size={viewMode === 'large' ? 16 : 14} />
                        </button>
                        <button onClick={() => onEdit(notice)} className="p-1 sm:p-1.5 md:p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="수정">
                            <Edit2 size={viewMode === 'list' ? 18 : viewMode === 'smaller' ? 14 : 14} />
                        </button>
                        <button onClick={() => onDelete(notice.id)} className="p-1.5 md:p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="삭제">
                            <Trash2 size={viewMode === 'list' ? 18 : viewMode === 'smaller' ? 14 : 14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

NoticeCard.propTypes = {
    notice: PropTypes.object.isRequired,
    viewMode: PropTypes.string.isRequired,
    mode: PropTypes.string.isRequired,
    noticeStats: PropTypes.object.isRequired,
    onViewDetails: PropTypes.func.isRequired,
    onOpenParticipants: PropTypes.func.isRequired,
    onOpenFeedback: PropTypes.func.isRequired,
    onStatusChange: PropTypes.func.isRequired,
    onEdit: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired
};

export default React.memo(NoticeCard);
