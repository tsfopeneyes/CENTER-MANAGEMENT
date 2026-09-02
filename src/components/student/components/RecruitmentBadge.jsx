import React from 'react';
import { getRecruitment } from '../../../utils/programRecruitment';

export default function RecruitmentBadge({ program, now, showStart = false }) {
    const state = getRecruitment(program, now);
    if (!state.label) return null;
    const color = state.status === 'SCHEDULED' ? 'bg-amber-50 text-amber-700'
        : state.status === 'OPEN' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500';
    return <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className={`rounded-md px-2 py-1 text-[10px] font-bold whitespace-nowrap ${color}`}>{state.label}</span>
        {showStart && state.status === 'SCHEDULED' && <span className="text-xs font-semibold text-amber-700">{state.message}</span>}
    </span>;
}
