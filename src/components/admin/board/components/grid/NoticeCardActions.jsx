import React from 'react';
import {RefreshCw,CheckCircle2,Eye,Edit2,Trash2} from 'lucide-react';
import {CATEGORIES} from '../../utils/constants';
import NoticeEngagementStats from './NoticeEngagementStats';

export default function NoticeCardActions({notice,viewMode,mode,noticeStats,isActive,onViewDetails,onOpenParticipants,onOpenFeedback,onStatusChange,onEdit,onDelete}) {
    const hasFeedback=(noticeStats[notice.id]?.feedbackCount || 0)>0;
    const participantButtonClass = 'text-[9px] md:text-[10px] px-3 py-1.5 rounded-xl font-semibold transition-all bg-[#e8f3ff] text-[#1b64da] hover:bg-[#d0e6ff] hover:scale-[1.02] active:scale-[0.98]';
    return (
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
                                    className={participantButtonClass}
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
                                    className={participantButtonClass}
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

                <div className={`flex flex-wrap items-center justify-between gap-2 pt-2 md:pt-3 border-t border-[#f2f4f6]`}>
                    <NoticeEngagementStats notice={notice} stats={noticeStats[notice.id]} />
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
    );
}
