import React from 'react';
import {Eye} from 'lucide-react';

export default function NoticeEngagementStats({notice,stats={}}) {
    const showInterest=notice.category==='PROGRAM' && notice.is_recruiting!==false;
    const available=Number.isSafeInteger(stats.interestCount) && !stats.interestLoading && !stats.interestError;
    const label=available?`관심 ${stats.interestCount}명`:stats.interestLoading?'관심 …':'관심 —';
    const hint=stats.interestError || (stats.interestLoading?'관심 인원을 불러오는 중입니다.':'현재 관심 등록 인원 (취소 제외, 계정당 1명)');
    return <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        <div className="flex items-center gap-1 text-[11px] font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-md whitespace-nowrap" title="이용자 조회수 (스탭 제외)">
            <Eye size={12} className="text-gray-400" aria-hidden="true" />
            <span>조회 {notice.view_count || 0}회</span>
        </div>
        {showInterest && <div className={`flex items-center text-[11px] font-bold px-2 py-1 rounded-md whitespace-nowrap ${stats.interestError?'text-amber-700 bg-amber-50':'text-gray-500 bg-gray-50'}`}
            title={hint} aria-label={`${label}. ${hint}`}>
            <span>{label}</span>
        </div>}
    </div>;
}
