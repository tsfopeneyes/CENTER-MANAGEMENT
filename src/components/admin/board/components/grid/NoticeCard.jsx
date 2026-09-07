import React from 'react';
import PropTypes from 'prop-types';
import { parseISO } from 'date-fns';
import { Calendar, Clock, Bell } from 'lucide-react';
import NoticeCardActions from './NoticeCardActions';
import { CATEGORIES } from '../../utils/constants';
import { formatKoreanTimeRange } from '../../../../../utils/dateUtils';
import { useCurrentTime } from '../../../../../hooks/useCurrentTime';
import { formatRecruitmentStart, getRecruitment, getRecruitmentStart } from '../../../../../utils/programRecruitment';

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
    const recruitmentNow = useCurrentTime();
    const recruitment = getRecruitment(notice, recruitmentNow);
    const formatProgramDays = (daysArray) => {
        if (!daysArray || daysArray.length === 0) return '요일 미지정';
        const labels = ['일', '월', '화', '수', '목', '금', '토'];
        const sortedDays = [...daysArray].sort((a, b) => a - b);
        return sortedDays.map(d => labels[d]).join(', ');
    };



    // Card styles
    let cardClass = "bg-white flex group rounded-[24px] border border-[#f2f4f6] shadow-[0_8px_24px_rgba(0,0,0,0.02)] hover:border-[#dbe7f5] hover:shadow-[0_12px_32px_rgba(0,0,0,0.055)] transition-[border-color,box-shadow] duration-200 ";
    let contentClass = "flex ";
    let thumbClass = "bg-[#f9fafb] overflow-hidden flex-shrink-0 cursor-pointer transition-colors ";
    let titleClass = "font-bold text-[#191f28] cursor-pointer group-hover:text-[#1b64da] transition-colors duration-200 line-clamp-2 leading-snug tracking-tight ";

    if (viewMode === 'large') {
        cardClass += "p-4 md:p-6 rounded-[1.5rem] flex-col";
        contentClass += "gap-4 mb-4 md:mb-6";
        thumbClass += "w-16 h-16 md:w-20 md:h-20 rounded-2xl shrink-0";
        titleClass += "text-base md:text-lg mb-1 min-h-[2.75rem] md:min-h-[3rem]";
    } else if (viewMode === 'small') {
        cardClass += "p-4 rounded-2xl flex-col";
        contentClass += "gap-3 mb-3";
        thumbClass += "w-12 h-12 md:w-16 md:h-16 rounded-xl";
        titleClass += "text-sm md:text-base mb-0.5 min-h-[2.5rem]";
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
    const isUpcoming = isActive && recruitment.status === 'SCHEDULED';

    const recruitmentStartText = notice.is_recruiting
        ? formatRecruitmentStart(getRecruitmentStart(notice), '시작')
        : '';
    const recruitmentEndText = notice.is_recruiting
        ? formatRecruitmentStart(notice.recruitment_deadline, '마감')
        : '';
    const showRecruitmentSchedule = isActive && Boolean(recruitmentStartText || recruitmentEndText);

    const getProgramDateText = () => {
        const start = notice.is_recruiting ? notice.program_date : (notice.program_start_date || notice.program_date);
        const end = notice.is_recruiting ? null : notice.program_end_date;
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        if (start && end && start !== end) {
            const startDate = new Date(start);
            const endDate = new Date(end);
            if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
                return `${startDate.getMonth() + 1}/${startDate.getDate()}(${days[startDate.getDay()]}) ~ ${endDate.getMonth() + 1}/${endDate.getDate()}(${days[endDate.getDay()]})`;
            }
        }
        if (start) {
            const date = new Date(start);
            if (!Number.isNaN(date.getTime())) return `${date.getMonth() + 1}/${date.getDate()}(${days[date.getDay()]})`;
        }
        return notice.is_recruiting ? '미정' : `매주 ${formatProgramDays(notice.program_days)}`;
    };

    const programDateText = getProgramDateText();
    const programTimeText = formatKoreanTimeRange(notice.program_date || notice.program_start_date, notice.program_duration);

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

    const getPushBadge = () => {
        if (mode !== CATEGORIES.PROGRAM) return null;
        const properties = notice.guest_properties || {};
        const result = properties.recruitment_push_result;
        if (result) {
            const failed = Number(result.failure_count || 0);
            return <span className={`px-2 py-0.5 rounded-md text-[9px] font-semibold ${failed ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <Bell size={9} className="mr-1 inline"/>{failed ? `일부 실패 ${failed}기기` : `${result.target_count || 0}명 발송 완료`}
            </span>;
        }
        const plans = Array.isArray(properties.recruitment_push_plans) ? properties.recruitment_push_plans : [];
        const hasPush = plans.length > 0 || (properties.recruitment_push_enabled === true && properties.recruitment_push_timing !== 'OFF');
        if (!hasPush) {
            return null;
        }
        if (plans.length > 1) {
            return <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[9px] font-semibold text-blue-700"><Bell size={9} className="mr-1 inline"/>푸시 {plans.length}개 예약</span>;
        }
        const timing = properties.recruitment_push_timing || 'AT_START';
        const value = timing === 'CUSTOM' ? properties.recruitment_push_scheduled_at : notice.recruitment_start_at;
        const date = value ? new Date(value) : null;
        const label = timing === 'NOW' ? '즉시 발송 예정' : date && !Number.isNaN(date.getTime())
            ? `${date.toLocaleDateString('ko-KR',{month:'numeric',day:'numeric'})} ${date.toLocaleTimeString('ko-KR',{hour:'numeric',minute:'2-digit'})} 예약`
            : '푸시 예약';
        return <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[9px] font-semibold text-blue-700"><Bell size={9} className="mr-1 inline"/>{label}</span>;
    };

    return (
        <div className={cardClass}>
            <div className={contentClass}>
                {viewMode !== 'list' && (
                    <div onClick={() => onViewDetails(notice)} className={thumbClass}>
                        {hasThumbnail ? (
                            <img src={thumbnailSrc} alt="thumb" className="w-full h-full object-cover" />
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
                            {getPushBadge()}
                            {notice.is_sticky && <span className="px-2 py-0.5 bg-[#fff0e6] text-[#ff6b00] rounded-md text-[9px] font-semibold tracking-tight">📌 공지</span>}
                            {isUpcoming ? (
                                <span className="px-2 py-0.5 bg-[#fff7e6] text-[#b45f06] rounded-md text-[9px] font-semibold tracking-tight uppercase">Upcoming</span>
                            ) : isActive && (
                                <>
                                    <span className="px-2 py-0.5 bg-[#e8f3ff] text-[#1b64da] rounded-md text-[9px] font-semibold tracking-tight uppercase">Active</span>
                                    {recruitment.status === 'OPEN' && getDeadlineWarning()}
                                </>
                            )}
                            {isCompleted && <span className="px-2 py-0.5 bg-[#f2f4f6] text-[#4e5968] rounded-md text-[9px] font-semibold tracking-tight uppercase">Completed</span>}
                            {isCancelled && <span className="px-2 py-0.5 bg-[#fdf0f0] text-[#e63c3c] rounded-md text-[9px] font-semibold tracking-tight uppercase">Cancelled</span>}
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
                    
                </div>
            </div>

            {mode === CATEGORIES.PROGRAM && viewMode !== 'list' && (
                <div className="mb-4 space-y-2.5 border-t border-[#f2f4f6] pt-3 md:mb-5 md:pt-4">
                    <div className="flex items-start gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8f3ff] text-[#3182f6]">
                            <Calendar size={13} />
                        </span>
                        <div className="min-w-0 pt-0.5">
                            <p className="text-[9px] font-bold text-[#8b95a1]">프로그램 일정</p>
                            <p className="mt-0.5 break-keep text-[11px] font-bold leading-5 text-[#333d4b] sm:text-xs">
                                {programDateText}{programTimeText ? ` ${programTimeText}` : ''}
                            </p>
                        </div>
                    </div>

                    {showRecruitmentSchedule && (
                        <div className="flex items-start gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff4e6] text-[#f08c00]">
                                <Clock size={13} />
                            </span>
                            <div className="min-w-0 pt-0.5">
                                <p className="text-[9px] font-bold text-[#8b95a1]">모집 일정</p>
                                <p className="mt-0.5 break-keep text-[11px] font-semibold leading-5 text-[#4e5968] sm:text-xs">
                                    {recruitmentStartText}{recruitmentStartText && recruitmentEndText ? ' ~ ' : ''}{recruitmentEndText}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <NoticeCardActions notice={notice} viewMode={viewMode} mode={mode} noticeStats={noticeStats} isActive={isActive}
                onViewDetails={onViewDetails} onOpenParticipants={onOpenParticipants} onOpenFeedback={onOpenFeedback}
                onStatusChange={onStatusChange} onEdit={onEdit} onDelete={onDelete} />
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
