export const isDutyStaffCandidate = (user) => {
    if (!user?.id || !String(user.name || '').trim()) return false;
    const role = String(user.role || '').toLowerCase();
    const group = String(user.user_group || '').toLowerCase();
    const status = String(user.status || '').toLowerCase();
    if (['withdrawn', 'deleted', 'pending', 'rejected'].includes(status)) return false;
    return role === 'admin' || role === 'staff' || group === 'staff' || user.user_group === '관리자';
};

export const dutyStaffOptions = (users) => {
    const candidates = (users || []).filter(isDutyStaffCandidate);
    const counts = candidates.reduce((map, user) => {
        const key = String(user.name).trim().toLocaleLowerCase('ko');
        map.set(key, (map.get(key) || 0) + 1);
        return map;
    }, new Map());
    return candidates
        .map(user => ({
            ...user,
            name: String(user.name).trim(),
            accountHint: counts.get(String(user.name).trim().toLocaleLowerCase('ko')) > 1
                ? String(user.id).slice(-4)
                : '',
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'ko'));
};

export const sameDutyAssignment = (left, right) => {
    if (!left || !right) return !left && !right;
    return ['duty_status', 'staff_id', 'staff_name', 'label']
        .every(field => (left[field] ?? null) === (right[field] ?? null));
};

const matchNullable = (query, field, value) => value == null
    ? query.is(field, null)
    : query.eq(field, value);

export async function saveDutyAssignment(client, { date, staff, off, expected }) {
    if (!date) throw new Error('당직 날짜를 확인해주세요.');
    if (!off && (!staff?.id || !String(staff.name || '').trim())) {
        throw new Error('검색 결과에서 당직 스태프를 선택해주세요.');
    }
    const payload = {
        center_code: 'HAIFN',
        duty_date: date,
        duty_status: off ? 'OFF' : 'ASSIGNED',
        staff_name: off ? null : String(staff.name).trim(),
        staff_id: off ? null : staff.id,
        label: off ? '당직 없음' : null,
    };
    if (!expected) {
        const { error } = await client.from('center_duty_assignments').insert(payload);
        if (error) throw error;
        return payload;
    }
    let query = client.from('center_duty_assignments').update(payload)
        .eq('center_code', 'HAIFN')
        .eq('duty_date', date)
        .eq('duty_status', expected.duty_status);
    for (const field of ['staff_id', 'staff_name', 'label']) {
        query = matchNullable(query, field, expected[field] ?? null);
    }
    const { data, error } = await query.select('duty_date');
    if (error) throw error;
    if (!data?.length) {
        const conflict = new Error('다른 화면에서 이 날짜의 당직을 수정했습니다. 새로 불러온 내용을 확인해주세요.');
        conflict.code = 'DUTY_CONFLICT';
        throw conflict;
    }
    return payload;
}

export const seoulDateString = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

export const isDutyDisplayTime = (date = new Date()) => {
    const hour = Number(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false,
    }).format(date));
    return hour >= 14 && hour < 22;
};
