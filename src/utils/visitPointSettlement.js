import { v5 as uuidv5 } from 'uuid';
import { supabase } from '../supabaseClient';
import { isAdminOrStaff } from './userUtils';
import {
    VISIT_POINT_DESCRIPTIONS,
    calculateVisitPointEntitlements,
    getKstDate,
    getKstDayBounds,
    getVisitPointCorrectionDescription,
} from './visitPointRules';

const SETTLEMENT_NAMESPACE = 'a72e32da-156c-4dd1-91b0-b510fa3d23d7';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sumAmounts = rows => (rows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);

const loadEffectiveAward = async ({ userId, date, kind }) => {
    const baseDescription = VISIT_POINT_DESCRIPTIONS[kind];
    const correctionDescription = getVisitPointCorrectionDescription(kind, date);
    const bounds = getKstDayBounds(date);

    const [{ data: legacyRows, error: legacyError }, { data: correctionRows, error: correctionError }] = await Promise.all([
        supabase
            .from('haifn_transactions')
            .select('id,amount')
            .eq('user_id', userId)
            .eq('source_description', baseDescription)
            .gte('created_at', bounds.start)
            .lte('created_at', bounds.end),
        supabase
            .from('haifn_transactions')
            .select('id,amount')
            .eq('user_id', userId)
            .eq('source_description', correctionDescription),
    ]);

    if (legacyError) throw legacyError;
    if (correctionError) throw correctionError;
    const rows = [...(legacyRows || []), ...(correctionRows || [])];
    return { amount: sumAmounts(rows), transactionIds: rows.map(row => row.id).sort() };
};

const insertIdempotentAdjustment = async ({ userId, date, kind, delta, transactionIds, adminId = null }) => {
    if (!delta) return { changed: false, delta: 0 };

    const isCurrentKstDay = date === getKstDate();
    const sourceDescription = delta > 0 && isCurrentKstDay && transactionIds.length === 0
        ? VISIT_POINT_DESCRIPTIONS[kind]
        : getVisitPointCorrectionDescription(kind, date);
    const fingerprint = `${userId}|${date}|${kind}|${delta}|${transactionIds.join(',') || 'empty'}`;
    const transactionId = uuidv5(fingerprint, SETTLEMENT_NAMESPACE);

    const payload = {
        id: transactionId,
        user_id: userId,
        amount: delta,
        transaction_type: delta > 0 ? 'EARN' : 'SPEND',
        source_description: sourceDescription,
        admin_id: UUID_PATTERN.test(String(adminId || '')) ? adminId : null,
    };

    const { error } = await supabase.from('haifn_transactions').insert([payload]);
    // A concurrent settlement uses the same deterministic id. Treat the loser
    // as already settled instead of writing a duplicate point transaction.
    if (error && error.code !== '23505') throw error;
    return { changed: !error, delta: error ? 0 : delta };
};

export const reconcileVisitPointsForDate = async ({ userId, date, adminId = null }) => {
    if (!userId || !date) throw new Error('포인트 정산 대상 정보가 없습니다.');

    const { data: user, error: userError } = await supabase
        .from('users')
        .select('id,name,user_group,role')
        .eq('id', userId)
        .maybeSingle();
    if (userError) throw userError;
    if (!user || isAdminOrStaff(user)) return { skipped: true, reason: 'STAFF' };

    const bounds = getKstDayBounds(date);
    const { data: logs, error: logsError } = await supabase
        .from('logs')
        .select('id,type,created_at,location_id')
        .eq('user_id', userId)
        .in('type', ['CHECKIN', 'MOVE', 'CHECKOUT'])
        .gte('created_at', bounds.start)
        .lte('created_at', bounds.end)
        .order('created_at', { ascending: true });
    if (logsError) throw logsError;

    const entitlement = calculateVisitPointEntitlements(logs, date);
    const result = { date, entitlement, adjustments: {} };

    for (const kind of ['VISIT', 'STAY']) {
        const desired = kind === 'VISIT' ? entitlement.visit : entitlement.stay;
        const effective = await loadEffectiveAward({ userId, date, kind });
        const delta = desired - effective.amount;
        result.adjustments[kind] = await insertIdempotentAdjustment({
            userId,
            date,
            kind,
            delta,
            transactionIds: effective.transactionIds,
            adminId,
        });
        result.adjustments[kind].before = effective.amount;
        result.adjustments[kind].after = desired;
    }

    return result;
};

export const reconcileVisitPointsForDates = async ({ userId, dates, adminId = null }) => {
    const uniqueDates = [...new Set((dates || []).filter(Boolean))];
    const results = [];
    for (const date of uniqueDates) {
        results.push(await reconcileVisitPointsForDate({ userId, date, adminId }));
    }
    return results;
};

export const settleVisitEventPoints = async ({ userId, event, fallbackDate = null, adminId = null }) => {
    const date = event?.created_at ? getKstDate(event.created_at) : fallbackDate || getKstDate();
    const current = await reconcileVisitPointsForDate({ userId, date, adminId });

    // The first action on a new day also closes and settles an unfinished
    // previous-day visit at the standard 22:00 automatic checkout time.
    if (date === getKstDate()) {
        const previousDate = getKstDate(new Date(`${date}T12:00:00+09:00`).getTime() - 86400000);
        try {
            current.previousDay = await reconcileVisitPointsForDate({ userId, date: previousDate, adminId });
        } catch (error) {
            console.error('Previous-day visit point reconciliation failed', { userId, previousDate, error });
            current.previousDay = { error: error?.message || '이전 방문 정산 실패' };
        }
    }
    return current;
};
