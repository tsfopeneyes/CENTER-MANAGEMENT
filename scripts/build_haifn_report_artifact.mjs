import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'analysis', 'haifn_june_july_2026');
const summary = JSON.parse(fs.readFileSync(path.join(DIR, 'analysis_summary.json'), 'utf8'));
const june = summary.headline.june;
const july = summary.headline.july;
const generatedAt = summary.generatedAt;

const visitSource = {
  id: 'src_visit',
  label: 'Supabase public.logs + public.users + public.locations + public.location_groups (직접 테이블 읽기)',
  path: 'scripts/analyze_haifn_june_july_2026.mjs',
  query: {
    engine: 'PostgreSQL / Supabase', language: 'SQL', executed_at: generatedAt,
    description: 'PostgREST 직접 테이블 읽기와 같은 원천 범위를 재현하는 SQL이며, 세션화·방문일 집계는 연결된 JavaScript에서 수행',
    tables_used: ['public.logs', 'public.users', 'public.locations', 'public.location_groups'],
    filters: ['KST 2026-01-01 이상, 2026-08-01 미만 원천 이력', '하이픈 location group', '관리자 및 STAFF 제외'],
    metric_definitions: ['월 이용자 = 유효 방문일 1일 이상 고유 이용자', '방문일 = 동일 이용자·날짜 내 유효 하이픈 방문을 1회로 집계', '재방문율 = 월 2일 이상 방문 이용자 / 월 이용자', '유지율 = 6월 이용자 중 7월 재방문 이용자 / 6월 이용자'],
    sql: `select l.id, l.created_at, l.user_id, l.location_id, l.type,
       u.role, u.user_group, loc.name as location_name, grp.name as location_group
from public.logs l
join public.users u on u.id = l.user_id
join public.locations loc on loc.id = l.location_id
join public.location_groups grp on grp.id = loc.group_id
where l.created_at >= timestamptz '2025-12-31 15:00:00+00'
  and l.created_at < timestamptz '2026-07-31 15:00:00+00'
  and grp.name = '하이픈'
  and coalesce(u.role, '') not in ('admin', 'STAFF')
  and coalesce(u.user_group, '') <> 'STAFF'
order by l.created_at;`
  }
};

const programSource = {
  id: 'src_program',
  label: 'Supabase public.notices + public.notice_responses (직접 테이블 읽기)',
  path: 'scripts/analyze_haifn_june_july_2026.mjs',
  query: {
    engine: 'PostgreSQL / Supabase', language: 'SQL', executed_at: generatedAt,
    description: '하이픈 관련 프로그램별 신청·출석 원천을 재현하는 SQL',
    tables_used: ['public.notices', 'public.notice_responses'],
    filters: ['KST 2026-06-01~2026-07-31', '강동 대상 또는 하이픈 장소', 'STAFF 응답 제외'],
    metric_definitions: ['프로그램 출석률 = 출석 건수 / JOIN 신청 건수', '프로그램일 방문 비중 = 프로그램 날짜의 방문일 / 월 방문일'],
    sql: `select n.id, n.title, n.program_date, n.created_at, n.program_type,
       n.target_regions, n.program_location, n.program_status,
       r.user_id, r.status, r.is_attended, r.is_staff
from public.notices n
left join public.notice_responses r on r.notice_id = n.id
where n.category = 'PROGRAM'
  and coalesce(n.program_date, n.created_at) >= timestamptz '2026-05-31 15:00:00+00'
  and coalesce(n.program_date, n.created_at) < timestamptz '2026-07-31 15:00:00+00'
  and ('강동' = any(n.target_regions) or n.program_location like '%하이픈%')
  and coalesce(r.is_staff, false) = false;`
  }
};

const purposeSource = {
  id: 'src_purpose',
  label: 'Supabase public.visit_notes + public.logs (직접 테이블 읽기)',
  path: 'scripts/analyze_haifn_june_july_2026.mjs',
  query: {
    engine: 'PostgreSQL / Supabase', language: 'SQL', executed_at: generatedAt,
    description: '6~7월 방문 목적 원천을 재현하며 유효 방문일 매칭과 복수 태그 분리는 JavaScript에서 수행',
    tables_used: ['public.visit_notes', 'public.logs'],
    filters: ['visit_date 2026-06-01 이상, 2026-08-01 미만', '유효 하이픈 방문일과 일치하는 기록'],
    metric_definitions: ['목적 비중 = 목적 태그 선택 방문일 / 목적 기록 방문일', '복수 선택이므로 합계는 100%를 초과할 수 있음'],
    sql: `select user_id, visit_date, purpose, remarks
from public.visit_notes
where visit_date >= date '2026-06-01'
  and visit_date < date '2026-08-01'
order by visit_date, user_id;`
  }
};

const pointSource = {
  id: 'src_points',
  label: 'Supabase public.haifn_transactions (직접 테이블 읽기)',
  path: 'scripts/analyze_haifn_june_july_2026.mjs',
  query: {
    engine: 'PostgreSQL / Supabase', language: 'SQL', executed_at: generatedAt,
    description: '6~7월 하이픈 포인트 거래 원천을 재현하고 월 방문자 집단과 JavaScript에서 매칭',
    tables_used: ['public.haifn_transactions'],
    filters: ['KST 2026-06-01 이상, 2026-08-01 미만', '해당 월 하이픈 방문자에 한정'],
    metric_definitions: ['적립량 = 양수 amount 합계', '사용량 = 음수 amount 절댓값 합계', '거래 이용자율 = 거래 이용자 / 월 하이픈 이용자'],
    sql: `select user_id, amount, transaction_type, source_description, created_at
from public.haifn_transactions
where created_at >= timestamptz '2026-05-31 15:00:00+00'
  and created_at < timestamptz '2026-07-31 15:00:00+00'
order by created_at;`
  }
};

const sources = [visitSource, programSource, purposeSource, pointSource];

const kpiRows = [{
  period: '7월',
  uniqueVisitors: july.uniqueVisitors,
  juneUniqueVisitors: june.uniqueVisitors,
  uniqueVisitorsChange: summary.headline.changes.uniqueVisitorsPct / 100,
  visitDays: july.visitDays,
  juneVisitDays: june.visitDays,
  visitDaysChange: summary.headline.changes.visitDaysPct / 100,
  repeatRate: july.repeatRate / 100,
  juneRepeatRate: june.repeatRate / 100,
  repeatRateChangePp: summary.headline.changes.repeatRatePp,
  retentionRate: summary.retention.juneToJulyRetentionRate / 100,
  retainedUsers: summary.retention.retainedInJuly,
  julyFirstTimeVisitors: summary.retention.julyFirstTimeVisitors,
  julyFirstTimeShare: summary.retention.julyFirstTimeShare / 100
}];

const weekdayOrder = ['월', '화', '수', '목', '금', '토', '일'];
const weekdayUsage = ['6월', '7월'].flatMap((month) => {
  const values = month === '6월' ? june.byDay : july.byDay;
  return weekdayOrder.map((weekday, index) => ({ month, weekday, weekdayOrder: index + 1, visitDays: values[weekday] || 0 }));
});

const purposeUsage = summary.purposes.flatMap((month) => month.tagCounts.map((row) => ({
  month: month.label,
  purpose: row.purpose,
  recordedVisitDays: month.recordedVisitDays,
  selectedCount: row.count,
  share: row.shareOfRecorded / 100
})));

const programSummary = summary.programs.map((row) => ({
  month: row.label,
  programs: row.programs,
  joined: row.joined,
  attended: row.attended,
  attendanceRate: row.attendanceRate / 100,
  programDayVisitDays: row.programDayVisitDays,
  programDayVisitShare: row.programDayVisitShare / 100,
  nonProgramDayVisitDays: row.nonProgramDayVisitDays,
  busiestDate: row.busiestDate,
  busiestDateVisitDays: row.busiestDateVisitDays
}));

const pointSummary = [june, july].map((row) => ({
  month: row.label,
  visitors: row.uniqueVisitors,
  transactionUsers: row.pointActivity.transactionUsers,
  transactionUserRate: row.pointActivity.transactionUserRate / 100,
  earned: row.pointActivity.earnedAmount,
  spent: row.pointActivity.spentAmount
}));

const artifact = {
  surface: 'report',
  manifest: {
    version: 1,
    surface: 'report',
    title: '하이픈 6~7월 이용 결산',
    description: '2026년 6월과 7월 하이픈 이용 규모, 재방문, 프로그램 기여, 이용 목적과 데이터 품질 분석',
    generatedAt,
    sources,
    cards: [
      { id: 'card_visitors', dataset: 'kpis', sourceId: 'src_visit', description: '7월 고유 이용자와 6월 대비 변화', metrics: [
        { label: '7월 이용자', field: 'uniqueVisitors', format: 'number' },
        { label: '6월', field: 'juneUniqueVisitors', format: 'number' },
        { label: '증감', field: 'uniqueVisitorsChange', format: 'percent', signed: true }
      ] },
      { id: 'card_visits', dataset: 'kpis', sourceId: 'src_visit', description: '동일 이용자·날짜를 1회로 센 방문일', metrics: [
        { label: '7월 방문일', field: 'visitDays', format: 'number' },
        { label: '6월', field: 'juneVisitDays', format: 'number' },
        { label: '증감', field: 'visitDaysChange', format: 'percent', signed: true }
      ] },
      { id: 'card_repeat', dataset: 'kpis', sourceId: 'src_visit', description: '월 2일 이상 방문한 이용자의 비중', metrics: [
        { label: '7월 재방문율', field: 'repeatRate', format: 'percent' },
        { label: '6월', field: 'juneRepeatRate', format: 'percent' },
        { label: '증감(%p)', field: 'repeatRateChangePp', format: 'number', signed: true }
      ] },
      { id: 'card_retention', dataset: 'kpis', sourceId: 'src_visit', description: '6월 이용자 중 7월에도 방문한 비중', metrics: [
        { label: '6→7월 유지율', field: 'retentionRate', format: 'percent' },
        { label: '유지 이용자', field: 'retainedUsers', format: 'number' }
      ] },
      { id: 'card_new', dataset: 'kpis', sourceId: 'src_visit', description: '7월 하이픈 첫 방문 이용자', metrics: [
        { label: '7월 첫 방문자', field: 'julyFirstTimeVisitors', format: 'number' },
        { label: '7월 이용자 중', field: 'julyFirstTimeShare', format: 'percent' }
      ] }
    ],
    charts: [
      {
        id: 'chart_weekly', title: '주간 이용 추이', subtitle: '6월 마지막 주와 7월 넷째 주에 프로그램 일정과 함께 이용이 집중',
        type: 'line', dataset: 'weeklyTrend', sourceId: 'src_visit', layout: 'full', valueFormat: 'number',
        encodings: {
          x: { field: 'startDate', type: 'temporal', label: '주 시작일' },
          y: { fields: ['uniqueVisitors', 'visitDays'], type: 'quantitative', label: '명 / 방문일' },
          tooltip: [
            { field: 'week', type: 'text', label: 'ISO 주차' },
            { field: 'uniqueVisitors', type: 'quantitative', label: '고유 이용자' },
            { field: 'visitDays', type: 'quantitative', label: '방문일' },
            { field: 'avgMinutes', type: 'quantitative', label: '평균 체류분' }
          ]
        },
        compatibleTypes: ['line', 'bar']
      },
      {
        id: 'chart_weekday', title: '요일별 방문일', subtitle: '금요일 집중은 이어졌지만 7월에는 목요일과 토요일까지 이용 요일이 확대',
        type: 'bar', dataset: 'weekdayUsage', sourceId: 'src_visit', layout: 'full', valueFormat: 'number',
        encodings: {
          x: { field: 'weekday', type: 'ordinal', label: '요일' },
          y: { field: 'visitDays', type: 'quantitative', aggregate: 'sum', label: '방문일' },
          color: { field: 'month', type: 'nominal', label: '월' },
          tooltip: [
            { field: 'month', type: 'nominal', label: '월' },
            { field: 'visitDays', type: 'quantitative', label: '방문일' }
          ]
        },
        compatibleTypes: ['bar']
      },
      {
        id: 'chart_purpose', title: '방문 목적 비중', subtitle: '복수 선택 기준이며 7월에는 스처쌤 만남과 개인 활동 비중이 확대',
        type: 'bar', dataset: 'purposeUsage', sourceId: 'src_purpose', layout: 'full', valueFormat: 'percent',
        encodings: {
          x: { field: 'purpose', type: 'nominal', label: '방문 목적' },
          y: { field: 'share', type: 'quantitative', label: '기록 방문일 중 비중', format: 'percent' },
          color: { field: 'month', type: 'nominal', label: '월' },
          tooltip: [
            { field: 'selectedCount', type: 'quantitative', label: '선택 건수' },
            { field: 'recordedVisitDays', type: 'quantitative', label: '목적 기록 방문일' }
          ]
        },
        compatibleTypes: ['bar']
      }
    ],
    tables: [
      {
        id: 'table_programs', title: '프로그램과 방문 기여', subtitle: '2026년 6~7월 강동 대상 또는 하이픈 개최 프로그램',
        dataset: 'programSummary', sourceId: 'src_program', density: 'spacious', layout: 'full',
        defaultSort: { field: 'month', direction: 'asc' },
        columns: [
          { field: 'month', label: '월', type: 'text' },
          { field: 'programs', label: '프로그램 수', format: 'number' },
          { field: 'attended', label: '출석', format: 'number' },
          { field: 'attendanceRate', label: '출석률', format: 'percent' },
          { field: 'programDayVisitShare', label: '프로그램일 방문 비중', format: 'percent' },
          { field: 'nonProgramDayVisitDays', label: '비프로그램일 방문일', format: 'number' }
        ]
      },
      {
        id: 'table_points', title: '하이픈 포인트 활동', subtitle: '각 월 하이픈 방문자의 동일 월 적립·사용',
        dataset: 'pointSummary', sourceId: 'src_points', density: 'spacious', layout: 'full',
        defaultSort: { field: 'month', direction: 'asc' },
        columns: [
          { field: 'month', label: '월', type: 'text' },
          { field: 'transactionUsers', label: '거래 이용자', format: 'number' },
          { field: 'transactionUserRate', label: '거래 이용자율', format: 'percent' },
          { field: 'earned', label: '적립 H', format: 'number' },
          { field: 'spent', label: '사용 H', format: 'number' }
        ]
      }
    ],
    blocks: [
      { id: 'title', type: 'markdown', body: '# 하이픈 6~7월 이용 결산' },
      { id: 'summary', type: 'markdown', body: `## Executive Summary\n\n- **7월은 이용 규모와 빈도가 함께 확대됐다.** 고유 이용자는 29명에서 49명으로 69.0%, 방문일은 47일에서 106일로 125.5% 늘었다. 1인당 방문일도 1.62일에서 2.16일로 증가했다.\n- **성장은 신규 유입이 주도했지만 반복 이용의 질도 좋아졌다.** 7월 이용자의 69.4%(34명)가 첫 방문자였고, 재방문율은 37.9%에서 46.9%로 9.0%p 상승했다. 다만 6월 이용자의 7월 유지율은 51.7%(15/29명)여서 신규 이용자의 8월 정착이 핵심 과제다.\n- **프로그램은 성장의 중요한 촉매였지만 전부는 아니다.** 7월 프로그램 개최일이 전체 방문일의 53.8%를 만들었고, 비프로그램일 방문도 30일에서 49일로 63.3% 증가했다.\n- **체류시간은 ‘대폭 증가’로 단정하면 안 된다.** 전형적인 방문의 중앙값은 216분에서 213.5분으로 거의 같고, 7월 공식 평균에는 8시간 초과 기록 10건이 포함돼 있다.` },
      { id: 'kpis', type: 'metric-strip', cardIds: ['card_visitors', 'card_visits', 'card_repeat', 'card_retention', 'card_new'] },
      { id: 'growth', type: 'markdown', body: `## 7월은 신규 유입과 반복 이용이 동시에 커졌다\n\n**방문일 증가율이 이용자 증가율보다 56.5%p 높았다.** 이는 단순히 사람 수만 늘어난 것이 아니라 한 사람이 더 자주 찾았다는 뜻이다. 상위 10명 방문 비중도 57.4%에서 46.2%로 낮아져, 증가분이 소수 단골에게만 집중되지 않았다.\n\n다만 7월 이용자 중 6월에도 왔던 사람은 30.6%뿐이다. 다음 결산에서는 7월 첫 방문자 34명 중 8월에 다시 방문한 비율을 별도 KPI로 추적해야 한다.` , sourceId: 'src_visit' },
      { id: 'weekly', type: 'chart', chartId: 'chart_weekly', layout: 'full' },
      { id: 'weekday_narrative', type: 'markdown', body: `## 이용이 금요일 중심에서 더 많은 요일과 시간대로 넓어졌다\n\n**금요일은 여전히 가장 큰 이용일이지만 의존도는 51.1%에서 42.5%로 낮아졌다.** 6월에는 이용 기록이 4개 요일에 있었지만 7월에는 6개 요일로 넓어졌고, 방문이 발생한 날짜도 9일에서 19일로 늘었다.\n\n첫 입실 시간도 달라졌다. 6월은 15~17시 입실이 76.6%였지만 7월은 44.3%로 낮아지고, 오전·점심 입실이 20.3%에서 46.2%로 늘었다. 방학·프로그램 일정과 함께 낮 시간 운영 수요가 커진 신호로 볼 수 있다.` , sourceId: 'src_visit' },
      { id: 'weekday', type: 'chart', chartId: 'chart_weekday', layout: 'full' },
      { id: 'program_narrative', type: 'markdown', body: `## 프로그램이 성장을 당겼고 일상 이용도 같이 늘었다\n\n**7월 프로그램은 1개에서 7개로 늘었고, 출석은 10건에서 32건으로 증가했다.** 특히 7월 24일 DINNER CHURCH 당일 방문일 23건이 7월 전체의 21.7%를 차지했다.\n\n그럼에도 프로그램이 없는 날짜의 방문일도 30일에서 49일로 늘었다. 따라서 7월 성장을 ‘행사 효과’만으로 설명하기보다는, 프로그램 유입과 일상 재방문이 함께 작동한 결과로 보는 편이 타당하다.` , sourceId: 'src_program' },
      { id: 'programs', type: 'table', tableId: 'table_programs', layout: 'full' },
      { id: 'purpose_narrative', type: 'markdown', body: `## 관계 중심의 이용이 유지되면서 개인 활동이 보강됐다\n\n**교제·휴식은 두 달 모두 기록 방문일의 약 53%로 가장 안정적인 목적이었다.** 스처쌤 만남은 37.5%에서 48.3%, 개인 할 일은 3.1%에서 10.1%로 증가했다. 프로그램 참여 비중도 34.4%에서 36.0%로 유지됐다.\n\n즉 하이픈은 단일 행사장이 아니라 관계 형성, 휴식, 프로그램, 개인 활동이 겹치는 복합 거점으로 쓰이고 있다. 목적 데이터는 복수 선택이며 기록 커버리지가 6월 68.1%, 7월 84.0%이므로 절대 비중보다는 방향성을 보는 것이 안전하다.` , sourceId: 'src_purpose' },
      { id: 'purpose', type: 'chart', chartId: 'chart_purpose', layout: 'full' },
      { id: 'points_narrative', type: 'markdown', body: `## 하이픈 포인트는 적립은 활성화됐지만 사용은 발생하지 않았다\n\n**7월 방문자 49명 모두가 같은 달 하이픈 거래를 보유했고 총 366H가 적립됐다.** 반면 6월과 7월 방문자 집단에서 사용 기록은 모두 0H였다.\n\n결산에서는 적립량을 참여 성과로 볼 수 있지만, 보상 생태계의 순환 여부를 판단하려면 다음 달부터 ‘적립 이용자 중 사용 전환율’과 ‘첫 사용까지 걸린 일수’를 별도 추적하는 것이 좋다.` , sourceId: 'src_points' },
      { id: 'points', type: 'table', tableId: 'table_points', layout: 'full' },
      { id: 'next_steps', type: 'markdown', body: `## 다음 달 운영 제안\n\n1. **7월 첫 방문자 34명의 8월 재방문율을 최우선 KPI로 둔다.** 신규 유입이 실제 정착으로 이어지는지 가장 직접적으로 보여준다.\n2. **프로그램일과 비프로그램일을 분리해 관리한다.** 프로그램별 신규 유입, 30일 내 재방문, 비프로그램일 이용 전환까지 한 흐름으로 연결한다.\n3. **낮 시간 운영을 보강한다.** 오전·점심 입실 비중이 46.2%까지 올라간 만큼 방학형 오픈 프로그램과 스처쌤 배치를 시험한다.\n4. **포인트 사용 전환 장치를 만든다.** 소액·즉시 교환 품목이나 프로그램 후 사용 동선을 실험하고 적립→첫 사용 전환율을 측정한다.\n5. **체크아웃 품질을 개선한다.** 8시간 초과 10건을 자동 알림·상한 검토 대상으로 두고 결산에는 중앙값을 기본 체류지표로 쓴다.` },
      { id: 'questions', type: 'markdown', body: `## 다음 결산에서 확인할 질문\n\n- 7월 첫 방문자 34명 중 8월에 다시 온 사람은 몇 명인가?\n- 어떤 프로그램이 당일 방문뿐 아니라 30일 내 재방문을 가장 많이 만들었는가?\n- 오전·점심 이용 증가는 방학 효과인가, 특정 프로그램 효과인가?\n- 포인트를 한 번이라도 사용한 이용자의 재방문율은 미사용자보다 높은가?` },
      { id: 'caveats', type: 'markdown', body: `## 전제와 주의사항\n\n- 기간은 2026년 6월 1일~7월 31일(KST)이며, 관리자·STAFF를 제외한 등록 이용자만 포함했다.\n- 방문은 앱 운영보고서와 맞춰 ‘체크아웃이 있고 하이픈 체류시간이 0분보다 큰 이용자-날짜’로 정의했다.\n- 7월에는 8시간 초과 방문일이 10건 있어 공식 평균 체류시간 250.4분 대신 중앙값 213.5분과 이상치 제외 평균 217.1분을 함께 봐야 한다.\n- 기간 내 동일 시각·이용자·장소·유형의 완전 중복 로그 2건이 발견됐지만, 방문일 단위 집계에는 영향을 주지 않았다.\n- 방문 목적은 복수 선택이고 기록 커버리지가 완전하지 않아 방향성 지표로 해석해야 한다. 프로그램 출석은 운영 입력값에 의존한다.` }
    ]
  },
  snapshot: {
    version: 1,
    generatedAt,
    status: 'ready',
    datasets: {
      kpis: kpiRows,
      weeklyTrend: summary.weeklyTrend,
      weekdayUsage,
      purposeUsage,
      programSummary,
      pointSummary
    }
  },
  sources
};

fs.writeFileSync(path.join(DIR, 'artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(path.join(DIR, 'artifact.json'));
