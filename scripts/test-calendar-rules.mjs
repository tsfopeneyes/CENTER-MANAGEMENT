import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRecruitment, formatRecruitmentStart, fromKstInput, toKstInput, validateRecruitmentForm } from '../src/utils/programRecruitment.js';
import { buildCalendarEvents, getMonthGrid, kstDateKey, shiftCalendarMonth } from '../src/utils/calendarUtils.js';
import { fetchAllPages } from '../src/utils/fetchAllPages.js';

const program = { id: 1, category: 'PROGRAM', is_recruiting: true, program_date: '2026-09-10T06:00:00Z', recruitment_start_at: '2026-08-31T03:00:00Z', recruitment_deadline: '2026-09-09T03:00:00Z', recruitment_details_ready: true };
assert.equal(getRecruitment(program, Date.parse(program.recruitment_start_at) - 1).status, 'SCHEDULED');
assert.equal(getRecruitment(program, Date.parse(program.recruitment_start_at)).canApply, true);
assert.equal(getRecruitment(program, Date.parse(program.recruitment_deadline) - 1).canApply, true);
assert.equal(getRecruitment(program, Date.parse(program.recruitment_deadline)).status, 'CLOSED');
assert.equal(getRecruitment(program, Date.parse(program.recruitment_deadline)).canViewDetails, true);
assert.equal(getRecruitment({ ...program, recruitment_details_ready: false }, Date.parse(program.recruitment_start_at)).canApply, false);
assert.equal(getRecruitment({ ...program, recruitment_details_ready: false }, Date.parse(program.recruitment_start_at)).status, 'OPEN');
assert.equal(getRecruitment({ ...program, program_status: 'CANCELLED' }, Date.parse(program.recruitment_start_at) - 1).status, 'CANCELLED');
assert.equal(getRecruitment({ ...program, program_status: 'CANCELLED' }, Date.parse(program.recruitment_start_at) - 1).canViewDetails, false);
assert.equal(getRecruitment({ ...program, is_program_preview: true }, Date.parse(program.recruitment_start_at) + 1).canApply, false);
assert.equal(getRecruitment({ ...program, is_program_preview: true }, Date.parse(program.recruitment_start_at) + 1).canViewDetails, false);
assert.equal(getRecruitment({ ...program, is_recruiting: false }).status, 'NONE');
assert.equal(getRecruitment({ ...program, recruitment_start_at: null, recruitment_details_ready: false }, Date.parse(program.recruitment_start_at) - 1).canApply, true);
assert.equal(getRecruitment({ ...program, recruitment_start_at: 'invalid' }, Date.parse(program.recruitment_start_at)).canApply, false);
assert.equal(getRecruitment({ ...program, is_challenge: true, program_date: '2026-09-01T00:00:00Z', program_end_date: '2026-09-30' }, Date.parse('2026-09-03T00:00:00Z')).canApply, true);
assert.equal(formatRecruitmentStart('2026-08-31T03:00:00Z'), '8/31(월) 오후 12시 신청 시작');
assert.equal(formatRecruitmentStart('2026-08-31T20:30:00Z'), '9/1(화) 오전 5시 30분 신청 시작');
assert.equal(formatRecruitmentStart('2026-08-31T15:00:00Z'), '9/1(화) 오전 12시 신청 시작');
assert.equal(fromKstInput('2026-09-01T05:30'), '2026-08-31T20:30:00.000Z');
assert.equal(toKstInput('2026-08-31T20:30:00Z'), '2026-09-01T05:30');
assert.equal(fromKstInput('2026-09-01'), '2026-08-31T15:00:00.000Z');
const form = { is_recruiting: true, recruitment_start_at: '2026-09-01T05:00', recruitment_deadline: '2026-09-03T12:00', program_date: '2026-09-04T12:00', target_regions: ['강동'], max_capacity: 0, content: '', program_location: '', program_duration: '' };
assert.equal(validateRecruitmentForm(form, Date.parse('2026-08-31T00:00:00Z')), null);
assert.match(validateRecruitmentForm(form, Date.parse('2026-09-02T00:00:00Z')), /소개/);
assert.equal(validateRecruitmentForm({ ...form, content: '<p>소개</p>', program_location: '하이픈', program_duration: '1시간' }, Date.parse('2026-09-02T00:00:00Z')), null);
assert.match(validateRecruitmentForm({ ...form, recruitment_deadline: form.recruitment_start_at }), /뒤여야/);
assert.match(validateRecruitmentForm({ ...form, recruitment_deadline: '2026-09-05T12:00' }), /늦을 수/);
assert.equal(validateRecruitmentForm({ ...form, _legacy_recruitment: true, recruitment_start_at: '' }), null);

const days = getMonthGrid('2026-09');
assert.equal(days[0], '2026-08-30');
assert.equal(days.at(-1), '2026-10-03');
assert.equal(getMonthGrid('2026-08').length, 42);
assert.equal(shiftCalendarMonth('2026-01', -1), '2025-12');
assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01');
assert.ok(getMonthGrid('2028-02').includes('2028-02-29'));
assert.equal(kstDateKey('2026-08-31T20:30:00Z'), '2026-09-01');
assert.equal(kstDateKey(undefined), '');
const events = buildCalendarEvents({ days, region: '강동', programs: [
    program,
    { id: 2, title: '매주 화요일', category: 'PROGRAM', is_recruiting: false, program_start_date: '2020-01-01', program_end_date: '2030-12-31', program_days: [2] },
    { id: 3, title: '과거 프로그램', category: 'PROGRAM', program_date: '2026-08-30T03:00:00Z' },
    { id: 4, title: '날짜 없음', category: 'PROGRAM' },
    { id: 5, title: '늦은 시간 프로그램', category: 'PROGRAM', program_date: '2026-09-03T10:00:00Z' },
    { id: 6, title: '먼저 진행하는 프로그램', category: 'PROGRAM', program_date: '2026-09-03T08:00:00Z' },
], schedules: [
    { id: 1, category_id: 'CLOSE', start_date: '2026-09-24', end_date: '2026-09-25', content: JSON.stringify({ closed_spaces: ['HAIFN'] }) },
    { id: 2, title: '다른 센터 대관', category_id: 'RENTAL', region: '강서', start_date: '2026-09-01', end_date: '2026-09-01' },
    { id: 3, title: '용인백현중', category_id: 'RENTAL', region: '강동', start_date: '2026-09-03', end_date: '2026-09-03' },
    { id: 3, title: '센터 행사', category_id: 'EVENT', region: '강동', start_date: '2026-09-03', end_date: '2026-09-03' },
], categories: [{ id: 'CLOSE', name: '휴관' }] });
assert.ok(events['2026-08-30'].some(e => e.raw.id === 3));
assert.equal(events['2026-09-01'].filter(e => e.raw.id === 2 && e.type === 'PROGRAM').length, 1);
assert.equal(events['2026-09-02'].length, 0);
assert.equal(events['2026-09-24'][0].type, 'CLOSED');
assert.equal(events['2026-09-25'][0].type, 'CLOSED');
assert.equal(events['2026-09-03'].find(e => e.title === '용인백현중').type, 'RENTAL');
assert.equal(events['2026-09-03'].find(e => e.title === '센터 행사').type, 'SCHEDULE');
assert.equal(new Set(events['2026-09-03'].map(e=>e.id)).size, 4);
assert.deepEqual(events['2026-09-03'].map(e=>e.type), ['PROGRAM','PROGRAM','SCHEDULE','RENTAL']);
assert.deepEqual(events['2026-09-03'].slice(0,2).map(e=>e.raw.id), [6,5]);
assert.ok(!Object.values(events).flat().some(e => e.title === '다른 센터 대관' || e.title === '날짜 없음'));
assert.ok(!Object.values(events).flat().some(e => e.raw.id === 4));
const seed = JSON.parse(readFileSync(new URL('../src/data/haifnDutyRoster.json', import.meta.url)));
assert.equal(Object.keys(seed).length, 20);
assert.equal(seed['2026-09-01'], 'Ethan');
assert.equal(seed['2026-09-30'], 'Rok');
assert.equal(seed['2026-09-24'], undefined);
const source = Array.from({ length: 1201 }, (_, index) => index);
const paged = await fetchAllPages(() => ({ range: async (from, to) => ({ data: source.slice(from, to + 1) }) }));
assert.equal(paged.length, 1201);
assert.equal(paged.at(-1), 1200);
console.log('PASS: recruitment boundaries, KST, incomplete/legacy/challenge rules, historical and recurring calendar, region closures, roster, pagination.');
