import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const local = dotenv.parse(await fs.readFile('.env.local', 'utf8'));
const legacy = dotenv.parse(await fs.readFile('.env', 'utf8'));
const supabase = createClient(local.VITE_SUPABASE_URL || legacy.VITE_SUPABASE_URL, local.VITE_SUPABASE_ANON_KEY || legacy.VITE_SUPABASE_ANON_KEY);

const from = '2026-06-30T15:00:00.000Z';
const to = new Date().toISOString();
const pageSize = 1000;

async function allRows(table, select, configure) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    let query = supabase.from(table).select(select).range(start, start + pageSize - 1);
    query = configure(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

const [logs, txs, users, locations] = await Promise.all([
  allRows('logs', 'id,user_id,type,created_at,location_id', q => q.in('type', ['CHECKIN', 'CHECKOUT', 'MOVE']).gte('created_at', from).lte('created_at', to).order('created_at')),
  allRows('haifn_transactions', 'id,user_id,amount,transaction_type,source_description,created_at', q => q.in('source_description', ['공간 방문 (1일 1회)', '공간 체류 (1시간 이상)']).gte('created_at', from).lte('created_at', to).order('created_at')),
  allRows('users', 'id,name,school,user_group,role', q => q.order('name')),
  allRows('locations', 'id,name', q => q.order('name')),
]);

const userById = new Map(users.map(u => [u.id, u]));
const locationById = new Map(locations.map(l => [String(l.id), l.name]));
const kstDay = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const keyOf = (userId, day) => `${userId}|${day}`;

const eventsByKey = new Map();
for (const log of logs) {
  const day = kstDay(log.created_at);
  const key = keyOf(log.user_id, day);
  if (!eventsByKey.has(key)) eventsByKey.set(key, []);
  eventsByKey.get(key).push(log);
}

const txByKeyAndType = new Map();
for (const tx of txs) {
  const key = `${keyOf(tx.user_id, kstDay(tx.created_at))}|${tx.source_description}`;
  if (!txByKeyAndType.has(key)) txByKeyAndType.set(key, []);
  txByKeyAndType.get(key).push(tx);
}

const rows = [];
for (const [key, events] of eventsByKey) {
  events.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const [userId, day] = key.split('|');
  const checkins = events.filter(e => e.type === 'CHECKIN');
  if (!checkins.length) continue;

  let active = null;
  const completed = [];
  for (const event of events) {
    if (event.type === 'CHECKIN') {
      if (!active) active = event;
    } else if (event.type === 'CHECKOUT' && active) {
      const minutes = Math.max(0, Math.floor((new Date(event.created_at) - new Date(active.created_at)) / 60000));
      completed.push({ checkin: active, checkout: event, minutes });
      active = null;
    }
  }

  const visitTx = txByKeyAndType.get(`${key}|공간 방문 (1일 1회)`) || [];
  const stayTx = txByKeyAndType.get(`${key}|공간 체류 (1시간 이상)`) || [];
  const eligibleStay = completed.some(s => s.minutes >= 60);
  const maxMinutes = completed.reduce((max, s) => Math.max(max, s.minutes), 0);
  const locationsUsed = [...new Set(events.filter(e => e.type === 'CHECKIN' || e.type === 'MOVE').map(e => locationById.get(String(e.location_id)) || String(e.location_id || '-')))];
  const user = userById.get(userId) || {};
  rows.push({
    day, userId, name: user.name || '(알 수 없음)', school: user.school || '-', group: user.user_group || '-', role: user.role || '-',
    locations: locationsUsed.join(', '), checkinCount: checkins.length, checkoutCount: events.filter(e => e.type === 'CHECKOUT').length,
    checkoutTimesKst: events.filter(e => e.type === 'CHECKOUT').map(e => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(e.created_at))),
    completedSessions: completed.length, maxMinutes, visitRewardCount: visitTx.length, stayRewardCount: stayTx.length,
    missingVisit: visitTx.length === 0, eligibleStay, missingStay: eligibleStay && stayTx.length === 0,
    duplicateVisitReward: visitTx.length > 1, duplicateStayReward: stayTx.length > 1,
  });
}

const missing = rows.filter(r => r.missingVisit || r.missingStay);
const monthSummary = ['2026-07', '2026-08'].map(month => {
  const monthRows = rows.filter(r => r.day.startsWith(month));
  const monthMissing = missing.filter(r => r.day.startsWith(month));
  return {
    month,
    visitDays: monthRows.length,
    eligibleStayDays: monthRows.filter(r => r.eligibleStay).length,
    missingVisitDays: monthMissing.filter(r => r.missingVisit).length,
    missingStayDays: monthMissing.filter(r => r.missingStay).length,
    affectedUserDays: monthMissing.length,
    affectedUsers: new Set(monthMissing.map(r => r.userId)).size,
    missingPoints: monthMissing.reduce((n, r) => n + Number(r.missingVisit) + Number(r.missingStay), 0),
  };
});

const byUser = [...new Map(missing.map(r => [r.userId, { userId: r.userId, name: r.name, school: r.school, group: r.group, missingVisit: 0, missingStay: 0, days: [] }])).values()];
for (const user of byUser) {
  for (const row of missing.filter(r => r.userId === user.userId)) {
    user.missingVisit += Number(row.missingVisit);
    user.missingStay += Number(row.missingStay);
    user.days.push(`${row.day}:${row.missingVisit ? '방문' : ''}${row.missingVisit && row.missingStay ? '+' : ''}${row.missingStay ? '1시간' : ''}`);
  }
  user.missingTotal = user.missingVisit + user.missingStay;
  delete user.userId;
}
byUser.sort((a, b) => b.missingTotal - a.missingTotal || a.name.localeCompare(b.name, 'ko'));

const result = {
  asOf: to,
  sourceProfile: { logRows: logs.length, pointTransactions: txs.length, userRows: users.length, locationRows: locations.length, visitDayRows: rows.length },
  monthSummary,
  total: {
    affectedUserDays: missing.length,
    affectedUsers: new Set(missing.map(r => r.userId)).size,
    missingVisitDays: missing.filter(r => r.missingVisit).length,
    missingStayDays: missing.filter(r => r.missingStay).length,
    missingPoints: missing.reduce((n, r) => n + Number(r.missingVisit) + Number(r.missingStay), 0),
    duplicateVisitRewardDays: rows.filter(r => r.duplicateVisitReward).length,
    duplicateStayRewardDays: rows.filter(r => r.duplicateStayReward).length,
  },
  affectedUsers: byUser,
  duplicateRows: rows.filter(r => r.duplicateVisitReward || r.duplicateStayReward),
  missingRows: missing,
};

console.log(JSON.stringify(result, null, 2));
