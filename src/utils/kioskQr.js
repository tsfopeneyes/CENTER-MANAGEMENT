export const ENOUGH_PLACE_LOCATION_ALIAS = 'ENOUGH_PLACE';

// Haifn check-in is permanently token-gated. Do not add a feature flag or
// kiosk-status fallback here: either would revive copied legacy QR URLs.
export const requiresRotatingQrAccess = ({ isQRCheckin, locationParam }) =>
    Boolean(isQRCheckin && locationParam !== ENOUGH_PLACE_LOCATION_ALIAS);

export const isKioskQrAccessError = (message = '') =>
    /^(QR_|KIOSK_)/.test(String(message));

export const getQrSecondsRemaining = (expiresAt, now = Date.now()) => {
    const expiry = expiresAt ? new Date(expiresAt).getTime() : 0;
    if (!Number.isFinite(expiry)) return 0;
    return Math.max(0, Math.ceil((expiry - now) / 1000));
};
