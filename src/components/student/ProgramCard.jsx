import React from 'react';
import { stripHtml } from '../../utils/textUtils';
import { parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { MapPin, Calendar, Clock, ChevronRight, Users, CheckCircle2 } from 'lucide-react';
import { parseDurationToMinutes, formatKoreanTimeRange } from '../../utils/dateUtils';
import { getRecruitment, getRecruitmentStart, formatRecruitmentStart } from '../../utils/programRecruitment';
import { useCurrentTime } from '../../hooks/useCurrentTime';
import RecruitmentBadge from './components/RecruitmentBadge';
import RecruitmentInterestButton from './components/RecruitmentInterestButton';

const ProgramCard = ({ program, onClick, compact = false, tourTarget, tourLabel }) => {
    const now = useCurrentTime();
    const recruitment = getRecruitment(program, now);
    // Card metadata is public before recruitment; body/form access stays gated.
    const thumb = program.image_url || program.images?.[0] || null;
    const description = program.short_description;
    const isScheduled = recruitment.status === 'SCHEDULED';
    const scheduledLabel = isScheduled ? formatRecruitmentStart(getRecruitmentStart(program), '모집 예정') : '';

    // Check for "Closing Soon" (within 24 hours of recruitment_deadline)
    const isClosingSoon = (() => {
        if (!program.recruitment_deadline || !program.is_recruiting) return false;
        const deadline = parseISO(program.recruitment_deadline);
        const now = new Date();
        const diff = deadline - now;
        const oneDay = 24 * 60 * 60 * 1000;
        return diff > 0 && diff < oneDay;
    })();

    const formatDate = (dateString) => {
        if (!dateString) return '일정 미정';
        const date = new Date(dateString);
        
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const dayOfWeek = days[date.getDay()];
        
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? '오후' : '오전';
        
        hours = hours % 12;
        hours = hours ? hours : 12;
        
        const minuteStr = minutes > 0 ? ` ${minutes}분` : '';
        return `${month}/${day}(${dayOfWeek}) ${ampm} ${hours}시${minuteStr}`;
    };

    const formatProgramDays = (daysArray) => {
        if (!daysArray || daysArray.length === 0) return '요일 미지정';
        const labels = ['일', '월', '화', '수', '목', '금', '토'];
        const sortedDays = [...daysArray].sort((a, b) => a - b);
        return sortedDays.map(d => labels[d]).join(', ');
    };



    const isPast = program.program_date && new Date(program.program_date) < startOfDay(new Date());

    return (
        <div
            data-tour={tourTarget}
            data-tour-label={tourLabel}
            onClick={isScheduled ? undefined : () => onClick(program)}
            className={`group bg-white overflow-hidden shadow-toss-standard transition-all duration-300 flex flex-col border-none ${isScheduled ? 'cursor-default' : 'hover:shadow-toss-elevated active:scale-[0.98] cursor-pointer'} ${thumb ? 'h-full' : 'self-start'} ${compact ? 'rounded-toss-lg' : 'rounded-toss-xl'}`}
        >
            {/* Thumbnail Section */}
            <div className={thumb ? `relative aspect-square overflow-hidden bg-tossGrey50 border-b border-tossGrey100/50 ${compact ? 'rounded-t-toss-lg' : 'rounded-t-toss-xl'}` : `${compact ? 'px-4 pt-4' : 'px-6 pt-6'}`}>
                {thumb ? (
                    <img
                        src={thumb}
                        alt={program.title}
                        className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ${isScheduled ? '' : 'group-hover:scale-110'}`}
                    />
                ) : null}

                {/* Status Badges Overlaid */}
                <div className={`flex flex-wrap items-start gap-2 ${thumb ? `absolute flex-col ${compact ? 'top-2.5 left-2.5' : 'top-4 left-4'}` : ''}`}>
                    <RecruitmentBadge program={program} now={now} />

                    {recruitment.canApply && isClosingSoon && !isPast && (
                        <div className={`flex items-center bg-tossError text-white font-bold shadow-toss-subtle ${compact ? 'gap-1 px-2 py-0.5 rounded-toss-md text-[10px]' : 'gap-1.5 px-2.5 py-1 rounded-toss-md text-[11px]'}`}>
                            <CheckCircle2 size={compact ? 10 : 12} strokeWidth={2.5} /> 마감임박
                        </div>
                    )}
                    {recruitment.canViewDetails && program.is_leader_only && (
                        <div className={`flex items-center bg-tossCaution text-tossGrey800 font-bold shadow-toss-subtle border border-tossCaution/20 w-fit ${compact ? 'gap-1 px-2 py-0.5 rounded-toss-md text-[10px]' : 'gap-1.5 px-2.5 py-1 rounded-toss-md text-[11px]'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" width={compact ? "10" : "12"} height={compact ? "10" : "12"} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-star"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                            리더전용
                        </div>
                    )}
                </div>
            </div>

            {/* Content Section */}
            <div className={compact ? "p-4 flex flex-col flex-1" : "p-6 pb-4"}>
                <h3 className={`font-bold text-tossGrey900 line-clamp-2 ${compact ? 'text-sm leading-snug ' + (description ? 'mb-1' : 'mb-3') : 'text-xl leading-tight ' + (description ? 'mb-2' : 'mb-4')}`}>
                    {program.title}
                </h3>
                
                {description && (
                    <p className={`text-tossGrey600 font-medium break-keep whitespace-normal ${compact ? 'text-[11px] mb-3 leading-snug' : 'text-[15px] mb-6 leading-relaxed'}`}>
                        {description}
                    </p>
                )}

                <div className={compact ? "space-y-1.5 mb-3 flex-1" : "space-y-3 mb-6"}>
                    {program.is_recruiting === false ? (
                        <>
                            <div className={`flex items-center text-tossGrey400 ${compact ? 'gap-2' : 'gap-3'}`}>
                                <Calendar size={compact ? 14 : 18} className="shrink-0 text-tossGrey400" />
                                <span className={`font-bold text-tossBlue ${compact ? 'text-[11px]' : 'text-sm'}`}>
                                    {(() => {
                                        const start = program.program_start_date || program.program_date;
                                        const end = program.program_end_date;
                                        
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
                                        return `매주 ${formatProgramDays(program.program_days)}`;
                                    })()}
                                </span>
                            </div>
                            <div className={`flex items-center text-tossGrey400 ${compact ? 'gap-2 mt-1' : 'gap-3'}`}>
                                <Clock size={compact ? 14 : 18} className="shrink-0 text-tossGrey400" />
                                <span className={`font-medium text-tossGrey700 ${compact ? 'text-[11px] line-clamp-1' : 'text-sm'}`}>
                                    {formatKoreanTimeRange(program.program_date || program.program_start_date, program.program_duration)}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={`flex items-center text-tossGrey400 ${compact ? 'gap-2' : 'gap-3'}`}>
                                <Calendar size={compact ? 14 : 18} className="shrink-0 text-tossGrey400" />
                                <span className={`font-medium text-tossGrey700 ${compact ? 'text-[11px] line-clamp-1' : 'text-sm'}`}>{formatDate(program.program_date)}</span>
                            </div>
                            {recruitment.canViewDetails && program.program_duration && !compact && (
                                <div className={`flex items-center text-tossGrey400 ${compact ? 'gap-2 mt-1' : 'gap-3'}`}>
                                    <Clock size={compact ? 14 : 18} className="shrink-0 text-tossGrey400" />
                                    <span className={`font-medium text-tossGrey700 ${compact ? 'text-[11px] line-clamp-1' : 'text-sm'}`}>소요시간: {program.program_duration}</span>
                                </div>
                            )}
                        </>
                    )}
                    {program.program_location && (
                        <div className={`flex items-center text-tossGrey400 ${compact ? 'gap-2 mt-1' : 'gap-3'}`}>
                            <MapPin size={compact ? 14 : 18} className="shrink-0 text-tossGrey400" />
                            <span className={`font-medium text-tossGrey700 ${compact ? 'text-[11px] line-clamp-1' : 'text-sm'}`}>{program.program_location}</span>
                        </div>
                    )}
                    {program.is_recruiting && (recruitment.canViewDetails || program.max_capacity != null) && (
                        <div className={`flex items-center text-tossGrey400 ${compact ? 'gap-2 mt-1' : 'gap-3'}`}>
                            <Users size={compact ? 14 : 18} className="shrink-0 text-tossGrey400" />
                            <span className={`font-medium text-tossGrey700 ${compact ? 'text-[11px] line-clamp-1' : 'text-sm'}`}>
                                정원: <span className="text-tossBlue font-bold">{program.max_capacity > 0 ? `${program.max_capacity}명` : '제한 없음'}</span>
                            </span>
                        </div>
                    )}
                </div>

                {!program.is_recruiting ? (
                    <button className={`w-full font-bold transition-colors border border-transparent ${compact ? 'py-2 rounded-toss-md text-xs mt-auto' : 'py-3.5 rounded-toss-xl text-sm mt-auto'} bg-tossSuccess/10 text-tossSuccess pointer-events-none`}>
                        신청 없이 참여할 수 있어요!
                    </button>
                ) : (
                    <div className="flex items-stretch gap-2 mt-auto">
                    <button type="button" disabled={isScheduled} className={`w-full min-w-0 px-2 font-bold leading-relaxed transition-colors active:scale-95 shadow-toss-subtle border border-transparent ${compact ? 'py-2 rounded-toss-md text-xs' : 'py-3.5 rounded-toss-xl text-sm'} ${isScheduled ? 'bg-tossBlue text-white cursor-default' : program.responseStatus === 'JOIN' ? 'bg-tossGrey100 text-tossGrey500 pointer-events-none shadow-none' : (program.responseStatus === 'WAITLIST' ? 'bg-tossWarning/10 text-[#fe9800] pointer-events-none shadow-none' : 'bg-tossBlue text-white hover:bg-tossBlueHover')}`}>
                        {isScheduled ? scheduledLabel : !recruitment.canViewDetails ? recruitment.message : !recruitment.canApply ? '상세 보기' : program.responseStatus === 'JOIN' ? '신청 완료' : (program.responseStatus === 'WAITLIST' ? '대기명단' : '신청하기')}
                    </button>
                    {isScheduled && <RecruitmentInterestButton noticeId={program.id}/>}
                    </div>
                )}
            </div>
        </div>
    );
};

// Recruitment dates, readiness and details may change while this card is open.
export default React.memo(ProgramCard);
