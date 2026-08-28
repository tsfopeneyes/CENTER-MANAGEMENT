import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { v5 as uuidv5 } from 'uuid';
import {
    VISIT_POINT_DESCRIPTIONS,
    calculateVisitPointEntitlements,
    getKstDate,
    getKstDayBounds,
    getVisitPointCorrectionDescription,
} from '../src/utils/visitPointRules.js';

const local = dotenv.parse(await fs.readFile('.env.local', 'utf8'));
const legacy = dotenv.parse(await fs.readFile('.env', 'utf8'));
const supabase = createClient(
    local.VITE_SUPABASE_URL || legacy.VITE_SUPABASE_URL,
    local.VITE_SUPABASE_ANON_KEY || legacy.VITE_SUPABASE_ANON_KEY
);

const USER_ID = 'd6acb365-4d57-4138-b462-e91739bd7408';
const USER_NAME = '김학생';
const NAMESPACE = 'a72e32da-156c-4dd1-91b0-b510fa3d23d7';

const requireNoError = (error, context) => {
    if (error) throw new Error(`${context}: ${error.message}`);
};

const { data: user, error: userError } = await supabase
    .from('users')
    .select('id,name')
    .eq('id', USER_ID)
    .maybeSingle();
requireNoError(userError, 'test user lookup');
if (user?.name !== USER_NAME) throw new Error('Safety stop: test user mismatch');

const date = getKstDate();
const bounds = getKstDayBounds(date);

const loadLogs = async () => {
    const { data, error } = await supabase
        .from('logs')
        .select('id,type,created_at,location_id')
        .eq('user_id', USER_ID)
        .in('type', ['CHECKIN', 'MOVE', 'CHECKOUT'])
        .gte('created_at', bounds.start)
        .lte('created_at', bounds.end)
        .order('created_at');
    requireNoError(error, 'load logs');
    return data || [];
};

const loadKindTransactions = async kind => {
    const base = VISIT_POINT_DESCRIPTIONS[kind];
    const correction = getVisitPointCorrectionDescription(kind, date);
    const [{ data: baseRows, error: baseError }, { data: correctionRows, error: correctionError }] = await Promise.all([
        supabase.from('haifn_transactions').select('id,amount,source_description').eq('user_id', USER_ID)
            .eq('source_description', base).gte('created_at', bounds.start).lte('created_at', bounds.end),
        supabase.from('haifn_transactions').select('id,amount,source_description').eq('user_id', USER_ID)
            .eq('source_description', correction),
    ]);
    requireNoError(baseError, 'load base transactions');
    requireNoError(correctionError, 'load corrections');
    return [...(baseRows || []), ...(correctionRows || [])];
};

const reconcileStay = async () => {
    const logs = await loadLogs();
    const desired = calculateVisitPointEntitlements(logs, date).stay;
    const rows = await loadKindTransactions('STAY');
    const effective = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const delta = desired - effective;
    if (!delta) return { desired, effective, delta, duplicateBlocked: null };

    const fingerprint = `${USER_ID}|${date}|STAY|${delta}|${rows.map(row => row.id).sort().join(',') || 'empty'}`;
    const id = uuidv5(fingerprint, NAMESPACE);
    const payload = {
        id,
        user_id: USER_ID,
        amount: delta,
        transaction_type: delta > 0 ? 'EARN' : 'SPEND',
        source_description: delta > 0 && rows.length === 0
            ? VISIT_POINT_DESCRIPTIONS.STAY
            : getVisitPointCorrectionDescription('STAY', date),
    };
    const { error } = await supabase.from('haifn_transactions').insert([payload]);
    requireNoError(error, 'insert settlement');

    const { error: duplicateError } = await supabase.from('haifn_transactions').insert([payload]);
    if (duplicateError?.code !== '23505') {
        throw new Error(`duplicate protection failed: ${duplicateError?.message || 'duplicate insert succeeded'}`);
    }
    return { desired, effective, delta, duplicateBlocked: true };
};

const originalLogs = await loadLogs();
const checkin = originalLogs.find(row => row.type === 'CHECKIN');
const checkout = [...originalLogs].reverse().find(row => row.type === 'CHECKOUT');
if (!checkin || !checkout) throw new Error('Safety stop: today\'s completed test visit was not found');

const originalCheckinAt = checkin.created_at;
const checkoutMs = new Date(checkout.created_at).getTime();
const originalDuration = Math.floor((checkoutMs - new Date(originalCheckinAt).getTime()) / 60000);
if (originalDuration >= 60) throw new Error('Safety stop: original visit is already at least 60 minutes');

const promotedCheckinAt = new Date(checkoutMs - 61 * 60000).toISOString();
let restored = false;
let promotedResult;
let restoredResult;

try {
    const { error: promoteError } = await supabase.from('logs').update({ created_at: promotedCheckinAt }).eq('id', checkin.id);
    requireNoError(promoteError, 'promote visit duration');
    promotedResult = await reconcileStay();
} finally {
    const { error: restoreError } = await supabase.from('logs').update({ created_at: originalCheckinAt }).eq('id', checkin.id);
    requireNoError(restoreError, 'restore original check-in time');
    restored = true;
}

restoredResult = await reconcileStay();
const finalLogs = await loadLogs();
const finalTransactions = await loadKindTransactions('STAY');

console.log(JSON.stringify({
    user: user.name,
    date,
    originalDuration,
    promotedResult,
    restored,
    restoredResult,
    originalLogRestored: finalLogs.find(row => row.id === checkin.id)?.created_at === originalCheckinAt,
    finalEffectiveStayPoints: finalTransactions.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    stayTransactions: finalTransactions,
}, null, 2));
