import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { v5 as uuidv5 } from 'uuid';
import {
    VISIT_POINT_DESCRIPTIONS,
    getKstDate,
    getVisitPointCorrectionDescription,
} from '../src/utils/visitPointRules.js';

const APPLY = process.argv.includes('--apply');
const local = dotenv.parse(await fs.readFile('.env.local', 'utf8'));
const legacy = dotenv.parse(await fs.readFile('.env', 'utf8'));
const supabase = createClient(
    local.VITE_SUPABASE_URL || legacy.VITE_SUPABASE_URL,
    local.VITE_SUPABASE_ANON_KEY || legacy.VITE_SUPABASE_ANON_KEY
);

const RANGE_START = '2026-06-30T15:00:00.000Z';
const RANGE_END = new Date().toISOString();
const NAMESPACE = 'e15a6e77-4851-4013-81ad-98d9f6609e7d';
const PAGE_SIZE = 1000;

// Confirmed in the incident history as accidental remote QR opens.
const CONFIRMED_EXCLUSIONS = new Map([
    ['김소윤|2026-08-27', '개인 공간에서 QR 주소 오접속으로 확인'],
    ['조은결|2026-08-20', '재방문이 아닌 원격 QR 주소 오접속으로 확인'],
]);

async function allRows(table, select, configure) {
    const rows = [];
    for (let start = 0; ; start += PAGE_SIZE) {
        let query = supabase.from(table).select(select).range(start, start + PAGE_SIZE - 1);
        query = configure(query);
        const { data, error } = await query;
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...data);
        if (data.length < PAGE_SIZE) return rows;
    }
}

const [logs, transactions, users] = await Promise.all([
    allRows('logs', 'id,user_id,type,created_at,location_id', query => query
        .in('type', ['CHECKIN', 'MOVE', 'CHECKOUT'])
        .gte('created_at', RANGE_START)
        .lte('created_at', RANGE_END)
        .order('created_at')),
    allRows('haifn_transactions', 'id,user_id,amount,transaction_type,source_description,created_at', query => query.order('created_at')),
    allRows('users', 'id,name,school,user_group,role', query => query.order('name')),
]);

const usersById = new Map(users.map(user => [user.id, user]));
const groupedLogs = new Map();
for (const log of logs) {
    const date = getKstDate(log.created_at);
    const key = `${log.user_id}|${date}`;
    if (!groupedLogs.has(key)) groupedLogs.set(key, []);
    groupedLogs.get(key).push(log);
}

const effectiveAward = (userId, date, kind) => {
    const base = VISIT_POINT_DESCRIPTIONS[kind];
    const correction = getVisitPointCorrectionDescription(kind, date);
    return transactions
        .filter(tx => tx.user_id === userId && (
            (tx.source_description === base && getKstDate(tx.created_at) === date)
            || tx.source_description === correction
        ))
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
};

const planned = [];
const held = [];
for (const [key, dayLogs] of groupedLogs) {
    const separator = key.lastIndexOf('|');
    const userId = key.slice(0, separator);
    const date = key.slice(separator + 1);
    if (date < '2026-07-01' || date > '2026-08-31') continue;

    const user = usersById.get(userId);
    if (!user || user.name === 'admin' || user.user_group === 'STAFF' || user.user_group === '관리자' || user.role === 'admin' || user.role === 'STAFF') continue;

    const sorted = [...dayLogs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const hasCheckin = sorted.some(log => log.type === 'CHECKIN');
    if (!hasCheckin) continue;

    let active = null;
    let longestMinutes = 0;
    let completedSessions = 0;
    for (const log of sorted) {
        if (log.type === 'CHECKIN') {
            if (!active) active = log;
        } else if (log.type === 'CHECKOUT' && active) {
            longestMinutes = Math.max(longestMinutes, Math.max(0, Math.floor(
                (new Date(log.created_at) - new Date(active.created_at)) / 60000
            )));
            completedSessions += 1;
            active = null;
        }
    }

    const missingKinds = [];
    if (effectiveAward(userId, date, 'VISIT') < 1) missingKinds.push('VISIT');
    if (completedSessions > 0 && longestMinutes >= 60 && effectiveAward(userId, date, 'STAY') < 1) missingKinds.push('STAY');
    if (missingKinds.length === 0) continue;

    const row = {
        userId,
        name: user.name,
        school: user.school || '-',
        group: user.user_group || '-',
        date,
        completedSessions,
        longestMinutes,
        missingKinds,
        missingPoints: missingKinds.length,
    };

    const confirmedReason = CONFIRMED_EXCLUSIONS.get(`${user.name}|${date}`);
    if (confirmedReason) {
        held.push({ ...row, reason: confirmedReason });
        continue;
    }

    // A missing visit reward with no completed checkout cannot be safely
    // distinguished from a remote QR open, so require manual review.
    if (missingKinds.includes('VISIT') && completedSessions === 0) {
        held.push({ ...row, reason: '퇴실 기록이 없어 실제 현장 방문 여부 확인 필요' });
        continue;
    }

    for (const kind of missingKinds) {
        planned.push({ ...row, kind, amount: 1 });
    }
}

planned.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ko') || a.kind.localeCompare(b.kind));
held.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ko'));

const inserted = [];
const alreadyApplied = [];
if (APPLY) {
    for (const item of planned) {
        const id = uuidv5(`missing-point|${item.userId}|${item.date}|${item.kind}`, NAMESPACE);
        const payload = {
            id,
            user_id: item.userId,
            amount: 1,
            transaction_type: 'EARN',
            source_description: getVisitPointCorrectionDescription(item.kind, item.date),
        };
        const { error } = await supabase.from('haifn_transactions').insert([payload]);
        if (error?.code === '23505') {
            alreadyApplied.push({ ...item, transactionId: id });
            continue;
        }
        if (error) throw new Error(`지급 실패 ${item.name} ${item.date} ${item.kind}: ${error.message}`);
        inserted.push({ ...item, transactionId: id });
    }
}

const summarize = rows => ({
    rows: rows.length,
    points: rows.reduce((sum, row) => sum + Number(row.amount || row.missingPoints || 0), 0),
    users: new Set(rows.map(row => row.userId)).size,
    visit: rows.filter(row => row.kind === 'VISIT').length,
    stay: rows.filter(row => row.kind === 'STAY').length,
});

console.log(JSON.stringify({
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    range: { start: RANGE_START, end: RANGE_END },
    plan: summarize(planned),
    byMonth: ['2026-07', '2026-08'].map(month => ({ month, ...summarize(planned.filter(row => row.date.startsWith(month))) })),
    held: { ...summarize(held), items: held },
    inserted: summarize(inserted),
    alreadyApplied: summarize(alreadyApplied),
    planned,
}, null, 2));
