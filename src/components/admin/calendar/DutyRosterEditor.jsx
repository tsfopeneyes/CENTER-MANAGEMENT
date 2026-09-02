import React, { useEffect, useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import { useDutyRoster, notifyDutyRosterChanged } from '../../../hooks/useDutyRoster';
import { getMonthGrid, dateHeading } from '../../../utils/calendarUtils';
import { fetchAllPages } from '../../../utils/fetchAllPages';
import { dutyStaffOptions, sameDutyAssignment, saveDutyAssignment } from '../../../utils/dutyRoster';
import StaffSearchPicker from './StaffSearchPicker';

function DutyAssignmentForm({ date, existing, options, disabled, refresh }) {
    const [selected, setSelected] = useState(null);
    const [off, setOff] = useState(false);
    const [expected, setExpected] = useState(existing);
    const [dirty, setDirty] = useState(false);
    const [pickerVersion, setPickerVersion] = useState(0);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    // Preserve the original row while editing so background refreshes cannot
    // silently replace the user's draft or bypass the save conflict check.
    useEffect(() => {
        if (dirty || disabled || saving) return;
        setExpected(existing);
        setSelected(options.find(staff => staff.id === existing?.staff_id) || null);
        setOff(existing?.duty_status === 'OFF');
        setPickerVersion(value => value + 1);
    }, [existing, options, dirty, disabled, saving]);
    const conflict = dirty && !disabled && !sameDutyAssignment(expected, existing);
    const save = async () => {
        if (saving || disabled || conflict) return;
        if (!off && !selected) { setMessage('검색 결과에서 당직 스태프를 선택해주세요.'); return; }
        setSaving(true); setMessage('');
        try {
            await saveDutyAssignment(supabase, { date, staff: selected, off, expected });
            setDirty(false);
            setMessage('저장했습니다. 일정 관리와 학생 화면에 반영됩니다.');
            notifyDutyRosterChanged();
        } catch (err) {
            if (['23505', 'DUTY_CONFLICT'].includes(err.code)) setDirty(false);
            setMessage(err.code === '42501' ? '관리자 인증이 필요합니다. 다시 로그인한 뒤 저장해주세요.'
                : err.code === '23505' ? '다른 화면에서 이 날짜의 당직을 등록했습니다. 새로 불러온 내용을 확인해주세요.'
                : err.message || '저장하지 못했습니다.');
        } finally { setSaving(false); refresh(); }
    };
    return <div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-start">
            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-500">당직 스태프</p>
                <StaffSearchPicker key={pickerVersion} options={options} selected={selected}
                    onSelect={staff => { setSelected(staff); setDirty(true); setMessage(''); }} disabled={off || disabled || saving} />
                {!dirty && existing?.duty_status === 'ASSIGNED' && !selected && !disabled && <p className="mt-1 text-xs text-amber-700">기존 이름: {existing.staff_name} · 계정을 검색해 선택해주세요.</p>}
            </div>
            <div className="flex items-center gap-3 sm:pt-5">
                <label className="flex gap-2 items-center text-xs py-3 whitespace-nowrap"><input type="checkbox" checked={off} disabled={disabled || saving}
                    onChange={event => { setOff(event.target.checked); setDirty(true); setMessage(''); }} />당직 없음</label>
                <button type="button" onClick={save} disabled={saving || disabled || conflict || (!off && !selected)} className="rounded-xl bg-blue-600 text-white text-xs font-bold px-5 py-3 disabled:opacity-40 whitespace-nowrap">{saving ? '저장 중…' : '저장'}</button>
            </div>
        </div>
        {conflict && <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            다른 화면에서 이 날짜의 당직이 변경되었습니다. 최신 내용을 확인한 뒤 다시 선택해주세요.
            <button type="button" className="ml-2 font-bold underline" onClick={() => { setDirty(false); setMessage(''); refresh(); }}>최신 내용 불러오기</button>
        </div>}
        {message && <p role="status" className="text-xs mt-3 text-slate-600">{message}</p>}
    </div>;
}

export default function DutyRosterEditor({ month: calendarMonth, fixedDate, staffOptions }) {
    const month = fixedDate?.slice(0, 7) || calendarMonth;
    const { roster, loading, error, needsMigration, refresh } = useDutyRoster(month);
    const [selectedDate, setSelectedDate] = useState(`${month}-01`);
    const [staffState, setStaffState] = useState({ data: [], loading: !staffOptions, error: '' });
    const date = fixedDate || (selectedDate.startsWith(month) ? selectedDate : `${month}-01`);
    const options = useMemo(() => dutyStaffOptions(staffOptions || staffState.data), [staffOptions, staffState.data]);
    useEffect(() => { setSelectedDate(`${month}-01`); }, [month]);
    useEffect(() => {
        if (staffOptions) return;
        let active = true;
        fetchAllPages(() => supabase.from('users')
            .select('id,name,role,user_group,status,profile_image_url')
            .or('role.in.(admin,staff,STAFF),user_group.in.(STAFF,관리자)')
            .order('name').order('id'))
            .then(data => { if (active) setStaffState({ data, loading: false, error: '' }); })
            .catch(() => { if (active) setStaffState({ data: [], loading: false, error: '스태프 목록을 불러오지 못했습니다. 화면을 새로고침해주세요.' }); });
        return () => { active = false; };
    }, [staffOptions]);
    const staffError = !staffOptions ? staffState.error : '';
    const disabled = loading || needsMigration || Boolean(error) || Boolean(staffError) || (!staffOptions && staffState.loading);
    return <section aria-label={fixedDate ? '하이픈 오늘의 당직' : '하이픈 날짜별 당직'} className={fixedDate ? 'w-full rounded-xl bg-slate-50/60 p-3' : 'rounded-2xl bg-white border border-slate-100 p-5 my-4'}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><UserRound size={17} />{fixedDate ? `오늘의 당직 · ${dateHeading(date)}` : '하이픈 날짜별 당직'}</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">하이픈 당직은 일정 관리에서 날짜별로 지정합니다. 하루 한 명 · 학생에게는 아이콘과 이름만 공개됩니다.</p>
        {needsMigration && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">9월 이미지 자료를 미리 보고 있습니다. 날짜별 저장 기능은 DB 변경안 적용 후 사용할 수 있습니다.</p>}
        {(error || staffError) && <p role="alert" className="text-xs text-red-600 mb-3">{error || staffError}</p>}
        <div className={fixedDate ? '' : 'grid sm:grid-cols-3 gap-3'}>
            {!fixedDate && <label className="text-xs font-semibold text-slate-500">날짜<select aria-label="당직 날짜" className="block w-full rounded-lg border p-2.5 mt-1 text-sm text-slate-800" value={date} onChange={event => setSelectedDate(event.target.value)}>
                {getMonthGrid(month).filter(day => day.startsWith(month)).map(day => <option key={day} value={day}>{dateHeading(day)}{roster[day]?.staff_name ? ` · ${roster[day].staff_name}` : roster[day]?.duty_status === 'OFF' ? ' · 당직 없음' : ''}</option>)}
            </select></label>}
            <div className="sm:col-span-2"><DutyAssignmentForm key={date} date={date} existing={roster[date]} options={options} disabled={disabled} refresh={refresh} /></div>
        </div>
    </section>;
}
