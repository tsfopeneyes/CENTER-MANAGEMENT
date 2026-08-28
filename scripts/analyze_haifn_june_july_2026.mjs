import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'analysis', 'haifn_june_july_2026');
const START_DATE = '2026-06-01';
const END_DATE_EXCLUSIVE = '2026-08-01';
const HISTORY_START = '2026-01-01';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const splitAt = line.indexOf('=');
      return [line.slice(0, splitAt).trim(), line.slice(splitAt + 1).trim()];
    })
);

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Supabase environment variables are missing.');
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const kstDate = (value) => new Date(new Date(value).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
const kstHour = (value) => new Date(new Date(value).getTime() + KST_OFFSET_MS).getUTCHours();
const utcStartForKstDate = (date) => new Date(`${date}T00:00:00+09:00`).toISOString();
const monthLabel = (date) => date.slice(0, 7) === '2026-06' ? '6월' : date.slice(0, 7) === '2026-07' ? '7월' : null;
const round = (value, digits = 1) => Number(value.toFixed(digits));
const rate = (numerator, denominator) => denominator ? round(100 * numerator / denominator, 1) : 0;
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function fetchAll(table, columns = '*', configure = (query) => query) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    query = configure(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

const [groups, locations, users, allLogs, notes, transactions, notices, responses] = await Promise.all([
  fetchAll('location_groups', 'id,name,is_active'),
  fetchAll('locations', 'id,name,group_id,is_active'),
  fetchAll('users', 'id,created_at,school,birth,role,user_group,status,is_leader,grade,current_haifn'),
  fetchAll('logs', 'id,created_at,user_id,location_id,type', (query) => query
    .gte('created_at', utcStartForKstDate(HISTORY_START))
    .lt('created_at', utcStartForKstDate(END_DATE_EXCLUSIVE))
    .order('created_at', { ascending: true })),
  fetchAll('visit_notes', 'user_id,visit_date,purpose,remarks', (query) => query
    .gte('visit_date', START_DATE)
    .lt('visit_date', END_DATE_EXCLUSIVE)),
  fetchAll('haifn_transactions', 'user_id,amount,transaction_type,source_description,created_at', (query) => query
    .gte('created_at', utcStartForKstDate(START_DATE))
    .lt('created_at', utcStartForKstDate(END_DATE_EXCLUSIVE))
    .order('created_at', { ascending: true })),
  fetchAll('notices', 'id,title,category,program_date,created_at,program_type,target_regions,program_location,program_status'),
  fetchAll('notice_responses', 'notice_id,user_id,status,is_attended,is_staff')
]);

const haifnGroupIds = new Set(groups.filter((group) => group.name?.includes('하이픈')).map((group) => group.id));
const haifnLocations = locations.filter((location) => haifnGroupIds.has(location.group_id) || location.name?.includes('하이픈'));
const haifnLocationIds = new Set(haifnLocations.map((location) => location.id));
if (!haifnLocationIds.size) throw new Error('No Haifn location was found.');

const usersById = new Map(users.map((user) => [user.id, user]));
const isAdminOrStaff = (user) => !user || user.role === 'admin' || user.role === 'STAFF' || user.user_group === 'STAFF' || user.name === 'admin';
const eligibleUserIds = new Set(users.filter((user) => !isAdminOrStaff(user)).map((user) => user.id));

const validLogTypes = new Set(['CHECKIN', 'CHECKOUT', 'MOVE']);
const logsByUser = new Map();
for (const log of allLogs) {
  if (!eligibleUserIds.has(log.user_id) || !validLogTypes.has(log.type)) continue;
  if (!logsByUser.has(log.user_id)) logsByUser.set(log.user_id, []);
  logsByUser.get(log.user_id).push(log);
}

const sessions = [];
for (const [userId, userLogs] of logsByUser.entries()) {
  const byDay = new Map();
  for (const log of userLogs) {
    const day = kstDate(log.created_at);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(log);
  }

  for (const [date, dayLogs] of byDay.entries()) {
    const ordered = [...dayLogs].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let current = [];
    let hasCheckout = false;
    const grouped = [];
    for (const log of ordered) {
      if (log.type === 'CHECKIN' && hasCheckout) {
        grouped.push(current);
        current = [];
        hasCheckout = false;
      }
      current.push(log);
      if (log.type === 'CHECKOUT') hasCheckout = true;
    }
    if (current.length) grouped.push(current);

    for (const rawLogs of grouped) {
      const firstCheckin = rawLogs.find((log) => log.type === 'CHECKIN');
      const hasMove = rawLogs.some((log) => log.type === 'MOVE');
      if (!firstCheckin && !hasMove) continue;

      let currentLocationId = rawLogs[0].location_id;
      let segmentStart = new Date(rawLogs[0].created_at);
      let durationMinutes = 0;
      let touchedHaifn = haifnLocationIds.has(currentLocationId);

      for (const log of rawLogs) {
        if (log.type !== 'MOVE') continue;
        const moveAt = new Date(log.created_at);
        if (haifnLocationIds.has(currentLocationId)) {
          durationMinutes += Math.max(0, Math.floor((moveAt - segmentStart) / 60000));
        }
        currentLocationId = log.location_id;
        segmentStart = moveAt;
        if (haifnLocationIds.has(currentLocationId)) touchedHaifn = true;
      }

      const checkout = [...rawLogs].reverse().find((log) => log.type === 'CHECKOUT');
      if (checkout && haifnLocationIds.has(currentLocationId)) {
        durationMinutes += Math.max(0, Math.floor((new Date(checkout.created_at) - segmentStart) / 60000));
      }

      sessions.push({
        userId,
        date,
        month: monthLabel(date),
        touchedHaifn,
        hasCheckout: Boolean(checkout),
        durationMinutes,
        checkinHour: firstCheckin ? kstHour(firstCheckin.created_at) : kstHour(rawLogs[0].created_at),
        rawLogs
      });
    }
  }
}

const historyValidSessions = sessions.filter((session) => session.touchedHaifn && session.hasCheckout && session.durationMinutes > 0);
const periodSessions = historyValidSessions.filter((session) => session.date >= START_DATE && session.date < END_DATE_EXCLUSIVE);
const periodTouchedSessions = sessions.filter((session) => session.touchedHaifn && session.date >= START_DATE && session.date < END_DATE_EXCLUSIVE);

const visitDays = new Map();
for (const session of periodSessions) {
  const key = `${session.userId}|${session.date}`;
  if (!visitDays.has(key)) {
    visitDays.set(key, { userId: session.userId, date: session.date, month: session.month, durationMinutes: 0, firstHour: session.checkinHour });
  }
  const record = visitDays.get(key);
  record.durationMinutes += session.durationMinutes;
  record.firstHour = Math.min(record.firstHour, session.checkinHour);
}
const visitDayRows = [...visitDays.values()];

const monthUsers = { '6월': new Set(), '7월': new Set() };
for (const row of visitDayRows) monthUsers[row.month].add(row.userId);

const firstVisitByUser = new Map();
for (const session of historyValidSessions) {
  if (!firstVisitByUser.has(session.userId) || session.date < firstVisitByUser.get(session.userId)) {
    firstVisitByUser.set(session.userId, session.date);
  }
}

const isoWeek = (date) => {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-${String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`;
};

const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
const sourceCategory = (description = '') => {
  const match = description.match(/^\[([^\]]+)\]/);
  if (match?.[1]) return match[1];
  if (!description) return '설명 없음';
  if (description.includes('체크인')) return '체크인';
  if (description.includes('방문')) return '방문';
  if (description.includes('인증')) return '콘텐츠 인증';
  return '기타/미분류';
};

function summarizeMonth(label) {
  const rows = visitDayRows.filter((row) => row.month === label);
  const visitors = monthUsers[label];
  const userDates = new Map();
  for (const row of rows) {
    if (!userDates.has(row.userId)) userDates.set(row.userId, []);
    userDates.get(row.userId).push(row.date);
  }

  const repeatUsers = [...userDates.values()].filter((dates) => dates.length >= 2).length;
  const activeUsers = [...userDates.values()].filter((dates) => {
    const weeks = new Map();
    for (const date of dates) weeks.set(isoWeek(date), (weeks.get(isoWeek(date)) || 0) + 1);
    return [...weeks.values()].filter((count) => count >= 2).length >= 2;
  }).length;
  const durations = rows.map((row) => row.durationMinutes);
  const cleanRows = rows.filter((row) => row.durationMinutes <= 8 * 60);
  const rawSessions = periodTouchedSessions.filter((session) => session.month === label);
  const completeSessions = rawSessions.filter((session) => session.hasCheckout && session.durationMinutes > 0);
  const over8hRows = rows.filter((row) => row.durationMinutes > 8 * 60);

  const byDay = {};
  const byHour = {};
  const daily = {};
  for (const row of rows) {
    const weekday = weekdayLabels[new Date(`${row.date}T00:00:00Z`).getUTCDay()];
    byDay[weekday] = (byDay[weekday] || 0) + 1;
    const hourBand = row.firstHour < 12 ? '오전(0~11시)' : row.firstHour < 15 ? '점심(12~14시)' : row.firstHour < 18 ? '오후(15~17시)' : '저녁(18시 이후)';
    byHour[hourBand] = (byHour[hourBand] || 0) + 1;
    daily[row.date] = (daily[row.date] || 0) + 1;
  }

  const groups = {};
  const schools = {};
  for (const userId of visitors) {
    const user = usersById.get(userId);
    const group = user?.user_group || '미분류';
    groups[group] = (groups[group] || 0) + 1;
    const school = (user?.school || '미분류').trim();
    schools[school] = (schools[school] || 0) + 1;
  }

  const visitCounts = [...userDates.entries()].map(([userId, dates]) => ({ userId, visits: dates.length }));
  const top10VisitShare = rate(visitCounts.sort((a, b) => b.visits - a.visits).slice(0, 10).reduce((sum, item) => sum + item.visits, 0), rows.length);

  const visitorTransactions = transactions.filter((transaction) => monthLabel(kstDate(transaction.created_at)) === label && visitors.has(transaction.user_id));
  const positive = visitorTransactions.filter((transaction) => transaction.amount > 0);
  const negative = visitorTransactions.filter((transaction) => transaction.amount < 0);
  const transactionSources = {};
  for (const transaction of visitorTransactions) {
    const category = sourceCategory(transaction.source_description);
    if (!transactionSources[category]) transactionSources[category] = { count: 0, netAmount: 0 };
    transactionSources[category].count += 1;
    transactionSources[category].netAmount += transaction.amount;
  }

  return {
    label,
    uniqueVisitors: visitors.size,
    visitDays: rows.length,
    visitsPerVisitor: round(rows.length / Math.max(visitors.size, 1), 2),
    repeatUsers,
    repeatRate: rate(repeatUsers, visitors.size),
    activeUsers,
    activeRate: rate(activeUsers, visitors.size),
    totalHours: round(durations.reduce((sum, value) => sum + value, 0) / 60, 1),
    cleanTotalHours: round(cleanRows.reduce((sum, row) => sum + row.durationMinutes, 0) / 60, 1),
    avgMinutesPerVisitDay: round(durations.reduce((sum, value) => sum + value, 0) / Math.max(rows.length, 1), 1),
    medianMinutesPerVisitDay: round(median(durations), 1),
    cleanAvgMinutesPerVisitDay: round(cleanRows.reduce((sum, row) => sum + row.durationMinutes, 0) / Math.max(cleanRows.length, 1), 1),
    over8hVisitDays: over8hRows.length,
    incompleteSessionRate: rate(rawSessions.length - completeSessions.length, rawSessions.length),
    top10VisitShare,
    byDay,
    byHour,
    daily,
    userGroups: Object.entries(groups).map(([group, count]) => ({ group, count, share: rate(count, visitors.size) })).sort((a, b) => b.count - a.count),
    topSchools: Object.entries(schools).map(([school, count]) => ({ school, count, share: rate(count, visitors.size) })).sort((a, b) => b.count - a.count).slice(0, 8),
    pointActivity: {
      transactionUsers: new Set(visitorTransactions.map((transaction) => transaction.user_id)).size,
      transactionUserRate: rate(new Set(visitorTransactions.map((transaction) => transaction.user_id)).size, visitors.size),
      earnedAmount: positive.reduce((sum, transaction) => sum + transaction.amount, 0),
      earnUsers: new Set(positive.map((transaction) => transaction.user_id)).size,
      spentAmount: Math.abs(negative.reduce((sum, transaction) => sum + transaction.amount, 0)),
      spendUsers: new Set(negative.map((transaction) => transaction.user_id)).size,
      sources: Object.entries(transactionSources).map(([category, values]) => ({ category, ...values })).sort((a, b) => b.count - a.count)
    }
  };
}

const june = summarizeMonth('6월');
const july = summarizeMonth('7월');
const juneVisitors = monthUsers['6월'];
const julyVisitors = monthUsers['7월'];
const retained = [...juneVisitors].filter((userId) => julyVisitors.has(userId));
const julyNew = [...julyVisitors].filter((userId) => firstVisitByUser.get(userId)?.startsWith('2026-07'));
const julyWinback = [...julyVisitors].filter((userId) => !juneVisitors.has(userId) && firstVisitByUser.get(userId) < '2026-06-01');

const notePurposeCounts = {};
const notePurposeTagCounts = {};
for (const note of notes) {
  const label = monthLabel(note.visit_date);
  if (!label || !monthUsers[label].has(note.user_id)) continue;
  const visitKey = `${note.user_id}|${note.visit_date}`;
  if (!visitDays.has(visitKey)) continue;
  const purpose = (note.purpose || '미기록').trim() || '미기록';
  if (!notePurposeCounts[label]) notePurposeCounts[label] = {};
  notePurposeCounts[label][purpose] = (notePurposeCounts[label][purpose] || 0) + 1;
  if (!notePurposeTagCounts[label]) notePurposeTagCounts[label] = {};
  for (const tag of purpose.split(',').map((value) => value.trim()).filter(Boolean)) {
    notePurposeTagCounts[label][tag] = (notePurposeTagCounts[label][tag] || 0) + 1;
  }
}

const programRows = notices
  .filter((notice) => notice.category === 'PROGRAM')
  .filter((notice) => {
    const date = kstDate(notice.program_date || notice.created_at);
    if (date < START_DATE || date >= END_DATE_EXCLUSIVE) return false;
    const isGangdong = Array.isArray(notice.target_regions) && notice.target_regions.includes('강동');
    const locationMentionsHaifn = notice.program_location?.includes('하이픈');
    return isGangdong || locationMentionsHaifn;
  })
  .map((notice) => {
    const date = kstDate(notice.program_date || notice.created_at);
    const programResponses = responses.filter((response) => response.notice_id === notice.id && !response.is_staff);
    return {
      month: monthLabel(date),
      date,
      title: notice.title,
      programType: notice.program_type || 'CENTER',
      joined: programResponses.filter((response) => response.status === 'JOIN').length,
      attended: programResponses.filter((response) => response.is_attended).length,
      status: notice.program_status
    };
  })
  .sort((a, b) => a.date.localeCompare(b.date));

const programsByMonth = ['6월', '7월'].map((label) => {
  const rows = programRows.filter((row) => row.month === label);
  const programDates = new Set(rows.map((row) => row.date));
  const monthVisitDays = visitDayRows.filter((row) => row.month === label);
  const programDayVisitDays = monthVisitDays.filter((row) => programDates.has(row.date)).length;
  const busiest = Object.entries(label === '6월' ? june.daily : july.daily).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  return {
    label,
    programs: rows.length,
    joined: rows.reduce((sum, row) => sum + row.joined, 0),
    attended: rows.reduce((sum, row) => sum + row.attended, 0),
    attendanceRate: rate(rows.reduce((sum, row) => sum + row.attended, 0), rows.reduce((sum, row) => sum + row.joined, 0)),
    programDayVisitDays,
    programDayVisitShare: rate(programDayVisitDays, monthVisitDays.length),
    nonProgramDayVisitDays: monthVisitDays.length - programDayVisitDays,
    busiestDate: busiest[0],
    busiestDateVisitDays: busiest[1],
    busiestDateShare: rate(busiest[1], monthVisitDays.length),
    details: rows
  };
});

const weeklyTrendMap = new Map();
for (const row of visitDayRows) {
  const week = isoWeek(row.date);
  if (!weeklyTrendMap.has(week)) weeklyTrendMap.set(week, { week, startDate: row.date, users: new Set(), visitDays: 0, totalMinutes: 0 });
  const entry = weeklyTrendMap.get(week);
  if (row.date < entry.startDate) entry.startDate = row.date;
  entry.users.add(row.userId);
  entry.visitDays += 1;
  entry.totalMinutes += row.durationMinutes;
}
const weeklyTrend = [...weeklyTrendMap.values()]
  .map((entry) => ({
    week: entry.week,
    startDate: entry.startDate,
    uniqueVisitors: entry.users.size,
    visitDays: entry.visitDays,
    avgMinutes: round(entry.totalMinutes / Math.max(entry.visitDays, 1), 1)
  }))
  .sort((a, b) => a.week.localeCompare(b.week));

const duplicateLogKeys = new Map();
for (const log of allLogs.filter((item) => kstDate(item.created_at) >= START_DATE && kstDate(item.created_at) < END_DATE_EXCLUSIVE)) {
  const key = `${log.user_id}|${log.created_at}|${log.location_id}|${log.type}`;
  duplicateLogKeys.set(key, (duplicateLogKeys.get(key) || 0) + 1);
}

const report = {
  generatedAt: new Date().toISOString(),
  scope: {
    period: `${START_DATE}~2026-07-31 (KST)`,
    comparison: '2026년 6월 vs 7월',
    locationGroup: '하이픈',
    locationIds: [...haifnLocationIds],
    population: '관리자/STAFF를 제외한 등록 이용자',
    visitDefinition: '하이픈 공간에서 양의 체류시간이 계산되고 체크아웃이 존재하는 이용자-날짜',
    officialMetricCompatibility: '앱 운영보고서의 체크인-체크아웃 기반 공간 집계 로직과 동일한 기준'
  },
  headline: {
    june,
    july,
    changes: {
      uniqueVisitorsPct: rate(july.uniqueVisitors - june.uniqueVisitors, june.uniqueVisitors),
      visitDaysPct: rate(july.visitDays - june.visitDays, june.visitDays),
      visitsPerVisitorPct: rate(july.visitsPerVisitor - june.visitsPerVisitor, june.visitsPerVisitor),
      repeatRatePp: round(july.repeatRate - june.repeatRate, 1),
      activeRatePp: round(july.activeRate - june.activeRate, 1),
      cleanAvgDurationPct: rate(july.cleanAvgMinutesPerVisitDay - june.cleanAvgMinutesPerVisitDay, june.cleanAvgMinutesPerVisitDay)
    }
  },
  retention: {
    juneVisitors: juneVisitors.size,
    retainedInJuly: retained.length,
    juneToJulyRetentionRate: rate(retained.length, juneVisitors.size),
    retainedShareOfJuly: rate(retained.length, julyVisitors.size),
    julyFirstTimeVisitors: julyNew.length,
    julyFirstTimeShare: rate(julyNew.length, julyVisitors.size),
    julyWinbackVisitors: julyWinback.length,
    julyWinbackShare: rate(julyWinback.length, julyVisitors.size)
  },
  purposes: Object.entries(notePurposeCounts).map(([label, counts]) => ({
    label,
    recordedVisitDays: Object.values(counts).reduce((sum, count) => sum + count, 0),
    tagCounts: Object.entries(notePurposeTagCounts[label] || {}).map(([purpose, count]) => ({
      purpose,
      count,
      shareOfRecorded: rate(count, Object.values(counts).reduce((sum, value) => sum + value, 0))
    })).sort((a, b) => b.count - a.count),
    categories: Object.entries(counts).map(([purpose, count]) => ({ purpose, count })).sort((a, b) => b.count - a.count)
  })),
  programs: programsByMonth,
  weeklyTrend,
  dataQuality: {
    sourceRowCounts: {
      users: users.length,
      logsSince2026: allLogs.length,
      periodVisitNotes: notes.length,
      periodPointTransactions: transactions.length,
      notices: notices.length,
      responses: responses.length
    },
    periodTouchedSessions: periodTouchedSessions.length,
    validPeriodSessions: periodSessions.length,
    duplicateExactLogRows: [...duplicateLogKeys.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0),
    noteCoverageByMonth: ['6월', '7월'].map((label) => {
      const recorded = Object.values(notePurposeCounts[label] || {}).reduce((sum, count) => sum + count, 0);
      const visits = label === '6월' ? june.visitDays : july.visitDays;
      return { label, recorded, visitDays: visits, coverageRate: rate(recorded, visits) };
    }),
    durationSensitivity: ['6월', '7월'].map((label) => {
      const month = label === '6월' ? june : july;
      return {
        label,
        officialAvgMinutes: month.avgMinutesPerVisitDay,
        excludingOver8hAvgMinutes: month.cleanAvgMinutesPerVisitDay,
        over8hVisitDays: month.over8hVisitDays
      };
    })
  }
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUTPUT_DIR, 'analysis_summary.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: path.join(OUTPUT_DIR, 'analysis_summary.json'), headline: report.headline, retention: report.retention, dataQuality: report.dataQuality }, null, 2));
