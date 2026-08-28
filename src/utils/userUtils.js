export const isAdminOrStaff = (user) => {
    if (!user) return false;
    return user.name === 'admin' ||
        user.user_group === '관리자' ||
        user.user_group === 'STAFF' ||
        user.role === 'admin' ||
        user.role === 'STAFF';
};

export const normalizeSchoolName = (school) => {
    if (!school) return '';
    const trimmed = school.trim();
    if (trimmed.endsWith('고등학교') || trimmed.endsWith('중학교') || trimmed.endsWith('초등학교')) {
        return trimmed;
    }
    if (trimmed.endsWith('외고')) {
        return trimmed.slice(0, -2) + '외국어고등학교';
    }
    if (trimmed.endsWith('여고')) {
        return trimmed.slice(0, -2) + '여자고등학교';
    }
    if (trimmed.endsWith('고')) {
        return trimmed.slice(0, -1) + '고등학교';
    }
    if (trimmed.endsWith('여중')) {
        return trimmed.slice(0, -2) + '여자중학교';
    }
    if (trimmed.endsWith('중')) {
        return trimmed.slice(0, -1) + '중학교';
    }
    if (trimmed.endsWith('초')) {
        return trimmed.slice(0, -1) + '초등학교';
    }
    return trimmed;
};

export const normalizeGuestIdentityName = (name) => String(name || '')
    .replace(/\s*\(guest\)\s*$/i, '')
    .replace(/\s+/g, '')
    .trim();

export const normalizeGuestIdentitySchool = (school) => normalizeSchoolName(school)
    .replace(/\s+/g, '')
    .trim();

// Reuse an existing guest when the stable identity fields (name and school)
// agree, and prefer a program application profile because it can carry the
// student's real contact data. Birth is refreshed with explicit consent when
// the guest checks in, so legacy placeholder values do not create duplicates.
export const findMatchingGuestAccount = (users, name, school) => {
    const normalizedName = normalizeGuestIdentityName(name);
    const normalizedSchool = normalizeGuestIdentitySchool(school);
    const matches = (users || []).filter(user =>
        user?.user_group === '게스트' &&
        normalizeGuestIdentityName(user.name) === normalizedName &&
        normalizeGuestIdentitySchool(user.school) === normalizedSchool
    );

    return matches.sort((left, right) => {
        const score = user => {
            const memo = String(user?.memo || '');
            const phone = String(user?.phone || '');
            const birth = String(user?.birth || '');
            return (memo.includes('프로그램 비회원 신청') ? 4 : 0) +
                (phone && !phone.startsWith('010-0000-') && !phone.startsWith('000-0000-') ? 2 : 0) +
                (birth && birth !== '000000' ? 1 : 0);
        };
        return score(right) - score(left);
    })[0] || null;
};

