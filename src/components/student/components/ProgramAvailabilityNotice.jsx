import React from 'react';
import { CalendarClock } from 'lucide-react';
import RecruitmentBadge from './RecruitmentBadge';
import { getRecruitment } from '../../../utils/programRecruitment';

export default function ProgramAvailabilityNotice({ program, now }) {
    const state = getRecruitment(program, now);
    return <div className="p-6 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><CalendarClock size={26} /></div>
        <RecruitmentBadge program={program} now={now} />
        <h2 className="text-xl font-bold text-slate-900 break-words">{program.title}</h2>
        <p className="text-sm font-semibold leading-relaxed text-slate-600">{state.message}</p>
        {state.status === 'SCHEDULED' && <p className="text-xs text-slate-400">모집이 시작되면 세부 내용을 확인할 수 있어요.</p>}
    </div>;
}
