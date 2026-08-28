export const WEB_ACCESS_RETENTION_MONTHS = 3;

export const getWebAccessRetentionCutoff = (referenceDate = new Date()) => {
    const cutoff = new Date(referenceDate);
    cutoff.setMonth(cutoff.getMonth() - WEB_ACCESS_RETENTION_MONTHS);
    return cutoff;
};

export const hasExpiredWebAccessTimestamp = (preferences, referenceDate = new Date()) => {
    const value = preferences?.last_web_login_at;
    if (!value) return false;

    const timestamp = new Date(value);
    return !Number.isNaN(timestamp.getTime()) && timestamp < getWebAccessRetentionCutoff(referenceDate);
};

export const removeWebAccessTimestamp = (preferences = {}) => {
    const nextPreferences = { ...preferences };
    delete nextPreferences.last_web_login_at;
    return nextPreferences;
};
