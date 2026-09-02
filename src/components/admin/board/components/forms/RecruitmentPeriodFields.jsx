import React from 'react';
import DateTimeFields from './DateTimeFields';
import { fromKstInput, getMissingProgramDetails, formatRecruitmentStart } from '../../../../../utils/programRecruitment';
import { useCurrentTime } from '../../../../../hooks/useCurrentTime';

export default function RecruitmentPeriodFields({ formData, updateField }) {
    const now = useCurrentTime();
    const start = fromKstInput(formData.recruitment_start_at);
    const missing = getMissingProgramDetails(formData);
    const scheduled = start && new Date(start).getTime() > now;
    return <div className="lg:col-span-2 min-w-0 space-y-3">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[['recruitment_start_at', '모집 시작'], ['recruitment_deadline', '모집 종료']].map(([field, label]) => <div key={field} className="min-w-0 space-y-1.5">
                <p className="text-xs font-bold text-slate-500 ml-1">{label}</p>
                <DateTimeFields label={label} value={formData[field] || ''} onChange={value => updateField(field, value)} />
            </div>)}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">시작 전에는 제목과 신청 시작 안내만 공개됩니다. 시작부터 종료 전까지 모집 중, 종료 시각부터 종료로 자동 표시됩니다.</p>
        {scheduled && <p className="text-xs font-bold text-amber-700">{formatRecruitmentStart(start)}</p>}
        {start && missing.length > 0 && <p role="status" className="text-xs text-amber-700 leading-relaxed">미작성: {missing.join(', ')}. 모집 시작 전에는 일정부터 저장할 수 있습니다. 시작 시각에도 정보가 없으면 신청은 열리지 않습니다.</p>}
        {formData._legacy_recruitment && !start && <p className="text-xs text-slate-500">기존 프로그램입니다. 시작을 비워 두면 기존 공개 방식을 유지합니다. 자동 모집 예정 표시를 사용하려면 시작·종료를 모두 입력해주세요.</p>}
    </div>;
}
