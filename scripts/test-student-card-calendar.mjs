import assert from 'node:assert/strict';
import { getCalendarAgenda, buildCalendarEvents, getMonthGrid, kstDateKey } from '../src/utils/calendarUtils.js';
import { getRecruitment, formatRecruitmentStart } from '../src/utils/programRecruitment.js';

const program = { id: 1, category: 'PROGRAM', title: '예정 프로그램', is_recruiting: true,
    program_date: '2026-09-18T08:30:00Z', recruitment_start_at: '2026-09-07T08:00:00Z',
    recruitment_deadline: '2026-09-17T08:00:00Z', recruitment_details_ready: true };
assert.equal(formatRecruitmentStart(program.recruitment_start_at, '모집 예정'), '9/7(월) 오후 5시 모집 예정');
assert.equal(formatRecruitmentStart('2026-09-07T08:30:00Z', '모집 예정'), '9/7(월) 오후 5시 30분 모집 예정');
assert.equal(getRecruitment(program, Date.parse('2026-09-01')).canApply, false);
assert.equal(getRecruitment({...program,is_program_preview:true}, Date.parse('2026-09-08')).canApply, false);
assert.equal(getRecruitment(program, Date.parse('2026-09-08')).canApply, true);
const events = buildCalendarEvents({ days:getMonthGrid('2026-09'), programs:[program], schedules:[
    {id:2,title:'월 경계 일정',start_date:'2026-08-31',end_date:'2026-09-02'},
    {id:3,title:'다음 달',start_date:'2026-10-01'},
    {id:4,title:'휴관',start_date:'2026-09-03',category_id:'closed'},
],categories:[{id:'closed',name:'휴관'}] });
const agenda = getCalendarAgenda(events, '2026-09', null, '2026-09-01');
assert.deepEqual(agenda.map(row=>row.date), ['2026-09-01','2026-09-02','2026-09-18']);
assert.equal(agenda.at(-1).event.title, program.title);
assert.equal(getCalendarAgenda(events, '2026-09','2026-09-18').length, 1);
assert.deepEqual(getCalendarAgenda(events, '2026-09','2026-09-03'), []);
assert.deepEqual(getCalendarAgenda({}, '2026-09'), []);
const orderedDates = (today) => getCalendarAgenda(events, '2026-09', null, today).map(row=>row.date);
assert.deepEqual(orderedDates('2026-09-02'), ['2026-09-02','2026-09-18','2026-09-01']);
assert.deepEqual(orderedDates('2026-09-15'), ['2026-09-18','2026-09-01','2026-09-02']);
assert.deepEqual(orderedDates('2026-08-31'), ['2026-09-01','2026-09-02','2026-09-18']);
assert.deepEqual(orderedDates('2026-10-01'), ['2026-09-01','2026-09-02','2026-09-18']);
assert.deepEqual(orderedDates(kstDateKey('2026-09-01T15:00:00Z')), ['2026-09-02','2026-09-18','2026-09-01']);
assert.deepEqual(getCalendarAgenda(events, '2026-09', '2026-09-01', '2026-09-15').map(row=>row.date), ['2026-09-01']);
const sameDay = { '2026-09-15': [{id:'first',type:'PROGRAM'},{id:'second',type:'RENTAL'}] };
assert.deepEqual(getCalendarAgenda(sameDay, '2026-09', null, '2026-09-15').map(row=>row.event.id), ['first','second']);
console.log('PASS: scheduled button label/KST, application gates, chronological monthly agenda, date filtering, multi-day boundaries and empty days.');
