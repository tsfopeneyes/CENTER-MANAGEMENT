import { requestSupabaseRest } from './supabaseRest';
import { settleVisitEventPoints } from './visitPointSettlement';

const VISIT_TYPES = new Set(['CHECKIN', 'MOVE', 'CHECKOUT']);
const EVENT_ORDER = { CHECKIN: 0, MOVE: 1, CHECKOUT: 2 };

const getKstDate = (value = new Date()) =>
    new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });

const isAfterAutomaticCheckout = (now = new Date()) => Number.parseInt(
    now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit'
    }),
    10
) >= 22;

const sortChronologically = (logs = []) => [...logs].sort((a, b) => {
    const difference = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (difference !== 0) return difference;
    return (EVENT_ORDER[a.type] ?? 0) - (EVENT_ORDER[b.type] ?? 0);
});

/**
 * One source of truth for a visitor's current-day visit state.
 * 22:00 is an automatic logical checkout; a later QR checkout replaces that
 * automatic end with a real CHECKOUT event without creating a new visit.
 */
export const deriveTodayVisitState = (rawLogs = [], now = new Date()) => {
    const today = getKstDate(now);
    const logs = sortChronologically((rawLogs || []).filter((log) =>
        VISIT_TYPES.has(log.type) && getKstDate(log.created_at) === today
    ));

    let sessionStart = null;
    let lastEvent = null;
    logs.forEach((log) => {
        if (log.type === 'CHECKIN') sessionStart = log;
        if (log.type === 'CHECKIN' || log.type === 'MOVE' || log.type === 'CHECKOUT') lastEvent = log;
        if (log.type === 'CHECKOUT') sessionStart = null;
    });

    if (!lastEvent || lastEvent.type === 'CHECKOUT') {
        return {
            status: lastEvent ? 'CHECKED_OUT' : 'NOT_CHECKED_IN',
            logs,
            lastEvent,
            // Keep the original visit location visible after checkout as well.
            // Checkout events are written with that location by recordVisitEvent.
            locationId: lastEvent?.location_id || null,
        };
    }

    const automaticCheckout = isAfterAutomaticCheckout(now);
    return {
        status: automaticCheckout ? 'AUTO_CHECKED_OUT' : 'ACTIVE',
        logs,
        lastEvent,
        checkInTime: sessionStart?.created_at || lastEvent.created_at,
        locationId: lastEvent.location_id,
        isAutoCheckedOut: automaticCheckout,
    };
};

export const getTodayVisitState = async (userId, now = new Date()) => {
    if (!userId) return { status: 'NOT_CHECKED_IN', logs: [] };
    const rawLogs = await requestSupabaseRest(
        `logs?select=id,type,created_at,location_id&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&limit=100`,
        {},
        2
    );
    return deriveTodayVisitState(rawLogs, now);
};

const recheckAfterUncertainWrite = async (userId, type) => {
    const state = await getTodayVisitState(userId);
    if (type === 'CHECKIN' && ['ACTIVE', 'AUTO_CHECKED_OUT'].includes(state.status)) return state;
    if (type === 'CHECKOUT' && state.status === 'CHECKED_OUT') return state;
    return null;
};

const settlePointsWithoutInvalidatingVisit = async ({ userId, event = null, adminId = null }) => {
    try {
        return await settleVisitEventPoints({ userId, event, adminId });
    } catch (error) {
        // The visit is already committed. Keep the visit successful and expose
        // the settlement failure to callers/monitoring for a safe retry.
        console.error('Visit point settlement failed', { userId, eventId: event?.id, error });
        return { error: error?.message || '포인트 정산에 실패했습니다.' };
    }
};

/**
 * Writes at most one visit event for the requested state transition.
 * Mutating requests are intentionally never retried blindly: a timeout can
 * happen after Supabase has already committed the first write.
 */
export const recordVisitEvent = async ({ userId, locationId = null, type, adminId = null }) => {
    if (!userId || !['CHECKIN', 'MOVE', 'CHECKOUT'].includes(type)) {
        throw new Error('방문 처리 정보가 올바르지 않습니다.');
    }

    const before = await getTodayVisitState(userId);

    if (type === 'CHECKIN') {
        if (before.status === 'ACTIVE') return { outcome: 'ALREADY_ACTIVE', state: before };
        if (before.status === 'AUTO_CHECKED_OUT') return { outcome: 'REQUIRES_CHECKOUT', state: before };
    } else if (type === 'MOVE') {
        if (before.status === 'AUTO_CHECKED_OUT') return { outcome: 'REQUIRES_CHECKOUT', state: before };
        if (before.status !== 'ACTIVE') return { outcome: 'ALREADY_CHECKED_OUT', state: before };
        if (before.locationId === locationId) return { outcome: 'ALREADY_ACTIVE', state: before };
    } else {
        if (before.status === 'CHECKED_OUT' || before.status === 'NOT_CHECKED_IN') {
            return { outcome: 'ALREADY_CHECKED_OUT', state: before };
        }
    }

    try {
        const created = await requestSupabaseRest('logs?select=id,type,created_at,location_id', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify([{
                user_id: userId,
                location_id: type === 'CHECKOUT'
                    ? before.locationId || locationId || null
                    : locationId || before.locationId || null,
                type,
            }]),
        });
        const event = created?.[0] || null;
        const pointSettlement = await settlePointsWithoutInvalidatingVisit({ userId, event, adminId });
        return { outcome: 'CREATED', event, state: await getTodayVisitState(userId), pointSettlement };
    } catch (error) {
        // A timed-out browser request may still have been committed. Verify
        // state once rather than issuing a duplicate POST.
        const reconciled = await recheckAfterUncertainWrite(userId, type).catch(() => null);
        if (reconciled) {
            const pointSettlement = await settlePointsWithoutInvalidatingVisit({ userId, event: reconciled.lastEvent, adminId });
            return { outcome: 'RECONCILED', state: reconciled, pointSettlement };
        }
        throw error;
    }
};
