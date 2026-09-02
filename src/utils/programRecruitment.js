// Recruitment is a derived display state. Never write it to program_status:
// that field controls attendance finalization and rewards.
export const toKstInput = (value) => {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 16);
};

export const fromKstInput = (value) => {
    if (!value) return null;
    const local = value.length === 10 ? `${value}T00:00:00` : value.length === 16 ? `${value}:00` : value;
    const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${local}+09:00`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const formatRecruitmentStart = (value, suffix = '신청 시작') => {
    if (!value || Number.isNaN(new Date(value).getTime())) return '';
    const date = new Date(new Date(value).getTime() + 9 * 3600000);
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${['일', '월', '화', '수', '목', '금', '토'][date.getUTCDay()]}) ${hour >= 12 ? '오후' : '오전'} ${hour % 12 || 12}시${minute ? ` ${minute}분` : ''} ${suffix}`;
};

export const hasProgramDescription = (content) => Boolean(String(content || '')
    .replace(/<[^>]*>/g, '').replace(/&(?:nbsp|#160);/g, ' ').trim());

export const getRecruitmentStart = (program) => program?.recruitment_start_at ?? program?.guest_properties?.recruitment_start_at;

export const getMissingProgramDetails = (program) => {
    const missing = [];
    if (!program.program_location?.trim()) missing.push('장소');
    if ((!program.is_challenge || program.challenge_has_time) && !String(program.program_duration || '').trim()) missing.push('소요 시간');
    if (!hasProgramDescription(program.content)) missing.push('소개');
    if (program.max_capacity === '' || program.max_capacity == null) missing.push('정원 (무제한은 0)');
    return missing;
};

export const validateRecruitmentForm = (form, now = Date.now()) => {
    if (!form.is_recruiting) return null;
    if (form._legacy_recruitment && !form.recruitment_start_at) return null;
    const start = fromKstInput(form.recruitment_start_at);
    const end = fromKstInput(form.recruitment_deadline);
    if (!start || !end) return '모집 시작과 종료 일시를 모두 입력해주세요. (한국 시간)';
    if (new Date(start) >= new Date(end)) return '모집 종료는 시작보다 뒤여야 합니다.';
    const programStart = fromKstInput(form.program_date);
    if (!form.is_challenge && programStart && new Date(end) > new Date(programStart)) return '모집 종료는 프로그램 시작 시각보다 늦을 수 없습니다.';
    if (form.is_challenge && form.program_end_date && new Date(end) > new Date(`${form.program_end_date}T23:59:59.999+09:00`)) return '모집 종료는 챌린지 종료일보다 늦을 수 없습니다.';
    if (!Array.isArray(form.target_regions) || !form.target_regions.length) return '프로그램을 공개할 센터(지역)를 선택해주세요.';
    if (form.max_capacity !== '' && (!Number.isInteger(Number(form.max_capacity)) || Number(form.max_capacity) < 0)) return '정원은 0 이상의 정수로 입력해주세요.';
    if (new Date(start).getTime() <= Number(now)) {
        const missing = getMissingProgramDetails(form);
        if (missing.length) return `모집 시작 후에는 다음 정보를 입력해주세요: ${missing.join(', ')}`;
    }
    return null;
};

export const getRecruitment = (program, now = Date.now()) => {
    if (!program || program.category !== 'PROGRAM' || program.is_recruiting !== true) {
        return { status: 'NONE', label: '', canViewDetails: true, canApply: false, message: '' };
    }
    const startValue = getRecruitmentStart(program);
    const start = startValue ? new Date(startValue).getTime() : null;
    const end = program.recruitment_deadline ? new Date(program.recruitment_deadline).getTime() : null;
    const time = Number(now);
    const cancelled = program.program_status === 'CANCELLED';
    const completed = program.program_status === 'COMPLETED' || (program.guest_properties?.is_ended ?? program.is_ended) === true;
    // Challenges can accept participants during their multi-day run.
    const programCutoff = program.is_challenge
        ? (program.program_end_date ? new Date(`${program.program_end_date.slice(0, 10)}T23:59:59.999+09:00`).getTime() + 1 : null)
        : (program.program_date ? new Date(program.program_date).getTime() : null);
    let status = 'OPEN';
    if (cancelled) status = 'CANCELLED';
    else if (completed || (end != null && time >= end) || (programCutoff != null && time >= programCutoff)) status = 'CLOSED';
    else if ((startValue && (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)) || (end != null && !Number.isFinite(end))) status = 'INVALID';
    else if (start != null && time < start) status = 'SCHEDULED';
    const preparing = Boolean(startValue && (program.recruitment_details_ready ?? program.guest_properties?.recruitment_details_ready) !== true);
    const label = { OPEN: '모집 중', SCHEDULED: '모집 예정', CLOSED: '종료', CANCELLED: '취소', INVALID: '일정 확인 중' }[status];
    const awaitingFullDetails = program.is_program_preview === true;
    const canViewDetails = !['SCHEDULED', 'INVALID'].includes(status) && !preparing
        && !(start != null && time < start) && !awaitingFullDetails;
    const message = status === 'SCHEDULED' ? formatRecruitmentStart(startValue)
        : status === 'INVALID' ? '모집 일정을 확인하고 있습니다.'
        : preparing ? '상세 정보 준비 중입니다. 정보가 준비되면 신청할 수 있어요.'
        : awaitingFullDetails ? '프로그램 정보를 불러오는 중입니다. 잠시 후 다시 확인해주세요.'
        : status === 'CANCELLED' ? '취소된 프로그램입니다.'
        : status === 'CLOSED' ? '신청 기간이 종료되었습니다.' : '';
    return { status, label, canViewDetails, canApply: status === 'OPEN' && canViewDetails, message, preparing, start, end };
};

export const getRegistrationBlockReason = (program, now = Date.now()) => {
    if (!program || program.category !== 'PROGRAM') return '프로그램 정보를 찾을 수 없습니다.';
    const state = getRecruitment(program, now);
    if (state.status === 'NONE') return '신청 프로그램이 아닙니다.';
    return state.canApply ? null : state.message;
};
