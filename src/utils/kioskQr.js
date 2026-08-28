export const ENOUGH_PLACE_LOCATION_ALIAS = 'ENOUGH_PLACE';

export const isHaifnRotatingQrEnabled = () =>
    import.meta.env?.VITE_HAIFN_ROTATING_QR_ENABLED === 'true';

export const requiresRotatingQrAccess = ({ enabled = true, isQRCheckin, locationParam }) =>
    Boolean(enabled && isQRCheckin && locationParam !== ENOUGH_PLACE_LOCATION_ALIAS);

export const isKioskQrAccessError = (message = '') =>
    /^(QR_|KIOSK_)/.test(String(message));

export const getQrSecondsRemaining = (expiresAt, now = Date.now()) => {
    const expiry = expiresAt ? new Date(expiresAt).getTime() : 0;
    if (!Number.isFinite(expiry)) return 0;
    return Math.max(0, Math.ceil((expiry - now) / 1000));
};
