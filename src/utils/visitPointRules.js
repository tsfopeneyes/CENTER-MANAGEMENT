export const VISIT_POINT_DESCRIPTIONS = {
    VISIT: '공간 방문 (1일 1회)',
    STAY: '공간 체류 (1시간 이상)',
};

export const getKstDate = (value = new Date()) =>
    new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

export const getKstDayBounds = (date) => ({
    start: new Date(`${date}T00:00:00+09:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999+09:00`).toISOString(),
});

const EVENT_ORDER = { CHECKIN: 0, MOVE: 1, CHECKOUT: 2 };

export const calculateVisitPointEntitlements = (rawLogs = [], date, now = new Date()) => {
    const logs = (rawLogs || [])
        .filter(log => ['CHECKIN', 'MOVE', 'CHECKOUT'].includes(log.type) && getKstDate(log.created_at) === date)
        .sort((a, b) => {
            const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            return timeDiff || (EVENT_ORDER[a.type] ?? 0) - (EVENT_ORDER[b.type] ?? 0);
        });

    let activeCheckin = null;
    let longestCompletedStayMinutes = 0;

    for (const log of logs) {
        if (log.type === 'CHECKIN') {
            // Repeated CHECKIN events do not restart the stay clock.
            if (!activeCheckin) activeCheckin = log;
            continue;
        }

        if (log.type === 'CHECKOUT' && activeCheckin) {
            const duration = Math.max(0, Math.floor(
                (new Date(log.created_at).getTime() - new Date(activeCheckin.created_at).getTime()) / 60000
            ));
            longestCompletedStayMinutes = Math.max(longestCompletedStayMinutes, duration);
            activeCheckin = null;
        }
    }

    // Visits left open are logically closed at 22:00. This matches the visit
    // log/statistics rule and lets every checkout path share the same result.
    const today = getKstDate(now);
    const isPastDate = date < today;
    const automaticCheckoutAt = new Date(`${date}T22:00:00+09:00`);
    if (activeCheckin && (isPastDate || now.getTime() >= automaticCheckoutAt.getTime())) {
        const duration = Math.max(0, Math.floor(
            (automaticCheckoutAt.getTime() - new Date(activeCheckin.created_at).getTime()) / 60000
        ));
        longestCompletedStayMinutes = Math.max(longestCompletedStayMinutes, duration);
    }

    return {
        visit: logs.some(log => log.type === 'CHECKIN') ? 1 : 0,
        stay: longestCompletedStayMinutes >= 60 ? 1 : 0,
        longestCompletedStayMinutes,
    };
};

export const getVisitPointCorrectionDescription = (kind, date) =>
    `[자동 정산] ${kind === 'VISIT' ? '공간 방문' : '공간 체류'} (${date})`;
