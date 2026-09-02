export function parseClockTime(value) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return null;
    const [hour, minute] = value.split(':').map(Number);
    return { period: hour >= 12 ? '오후' : '오전', hour: hour % 12 || 12, minute };
}

export function toClockTime({ period, hour, minute }) {
    if (!['오전', '오후'].includes(period) || !Number.isInteger(hour) || hour < 1 || hour > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) return '';
    return `${String(hour % 12 + (period === '오후' ? 12 : 0)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatClockTime(value) {
    const time = parseClockTime(value);
    return time ? `${time.period} ${time.hour}:${String(time.minute).padStart(2, '0')}` : '';
}
