export const parseGuestBirthDate = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date > new Date()
    ) return null;

    const today = new Date();
    let age = today.getFullYear() - year;
    if (
        today.getMonth() < month - 1 ||
        (today.getMonth() === month - 1 && today.getDate() < day)
    ) age -= 1;

    if (age < 0 || age > 100) return null;
    return {
        age,
        isUnder14: age < 14,
        yymmdd: `${String(year).slice(-2)}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    };
};

export const GUEST_PRIVACY_VERSION = '2026-08-28';

export const classifyGuestIdentityMatch = (existingUser, inputPhone, inputBirthYymmdd) => {
    if (!existingUser) return 'NEW_PERSON';
    const storedPhone = String(existingUser.phone || '').replace(/[^0-9]/g, '');
    const submittedPhone = String(inputPhone || '').replace(/[^0-9]/g, '');
    if (!storedPhone || storedPhone !== submittedPhone) return 'PHONE_MISMATCH';

    const storedBirth = String(existingUser.birth || '');
    const hasRealBirth = /^\d{6}$/.test(storedBirth) && !['000000', '999999', '990101'].includes(storedBirth);
    if (!hasRealBirth) return 'BIRTH_NEEDS_CONFIRMATION';
    if (storedBirth !== inputBirthYymmdd) return 'BIRTH_MISMATCH';
    return 'VERIFIED';
};

export const buildGuestPrivacyPreferences = (preferences, isUnder14, options = {}) => ({
    ...(preferences || {}),
    guest_birth_consent: {
        version: GUEST_PRIVACY_VERSION,
        agreed_at: new Date().toISOString(),
        purpose: options.purpose || 'guest_visit_age_analysis',
        confirmation_method: options.confirmationMethod || (isUnder14 ? 'guardian_details_checkbox' : 'self_checkbox'),
        guardian_consent: isUnder14,
    },
});
