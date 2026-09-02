import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { dutyStaffOptions, sameDutyAssignment, saveDutyAssignment, seoulDateString } from '../src/utils/dutyRoster.js';

// Isolated in-memory database only; never connects to Supabase or real accounts.
const db = new PGlite();
try {
    await db.exec(`CREATE TABLE center_duty_assignments (
        center_code text, duty_date date, duty_status text, staff_id text,
        staff_name text, label text, PRIMARY KEY (center_code, duty_date)
    );`);
    const fields = ['center_code', 'duty_date', 'duty_status', 'staff_id', 'staff_name', 'label'];
    const client = { from(table) {
        assert.equal(table, 'center_duty_assignments');
        let payload, inserting = false;
        const filters = [];
        const execute = async () => {
            try {
                const values = fields.map(key => payload[key]);
                const where = filters.map(([key, value]) => {
                    assert.ok(fields.includes(key));
                    if (value === null) return `${key} IS NULL`;
                    values.push(value);
                    return `${key}=$${values.length}`;
                });
                const sql = inserting
                    ? `INSERT INTO center_duty_assignments (${fields.join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')}) RETURNING duty_date`
                    : `UPDATE center_duty_assignments SET ${fields.map((key, i) => `${key}=$${i + 1}`).join(',')} WHERE ${where.join(' AND ')} RETURNING duty_date`;
                return { data: (await db.query(sql, values)).rows, error: null };
            } catch (error) { return { data: null, error }; }
        };
        const query = {
            insert(row) { payload = row; inserting = true; return query; },
            update(row) { payload = row; return query; },
            eq(key, value) { filters.push([key, value]); return query; },
            is(key, value) { assert.equal(value, null); filters.push([key, null]); return query; },
            select: execute,
            then(resolve, reject) { return execute().then(resolve, reject); },
        };
        return query;
    } };
    const first = { id: 'test-staff-0001', name: '가상 스태프', role: 'staff' };
    const second = { ...first, id: 'test-staff-0002' };
    const options = dutyStaffOptions([first, second, { id: 'student', name: '학생', role: 'student' }, { ...first, id: 'inactive', status: 'withdrawn' }]);
    assert.equal(options.length, 2);
    assert.deepEqual(options.map(row => row.accountHint), ['0001', '0002']);
    const date = '2026-09-01';
    await assert.rejects(saveDutyAssignment(client, { date, staff: { name: '이름만 입력' } }), /선택/);
    const initial = await saveDutyAssignment(client, { date, staff: first });
    assert.equal(sameDutyAssignment(initial, { ...initial, staff_id: second.id }), false);
    await assert.rejects(saveDutyAssignment(client, { date, staff: second }), { code: '23505' });
    const replaced = await saveDutyAssignment(client, { date, staff: second, expected: initial });
    await assert.rejects(saveDutyAssignment(client, { date, off: true, expected: initial }), { code: 'DUTY_CONFLICT' });
    const off = await saveDutyAssignment(client, { date, off: true, expected: replaced });
    assert.equal(off.staff_id, null);
    assert.equal(off.staff_name, null);
    assert.equal(off.duty_status, 'OFF');
    await assert.rejects(saveDutyAssignment(client, { date, staff: first, expected: replaced }), { code: 'DUTY_CONFLICT' });
    await saveDutyAssignment(client, { date, staff: first, expected: off });
    await db.exec("UPDATE center_duty_assignments SET label='다른 화면 수정'");
    await assert.rejects(saveDutyAssignment(client, { date, off: true, expected: initial }), { code: 'DUTY_CONFLICT' });
    assert.equal(sameDutyAssignment(null, undefined), true);
    assert.equal(sameDutyAssignment(initial, null), false);
    assert.equal(seoulDateString(new Date('2026-08-31T14:59:59Z')), '2026-08-31');
    assert.equal(seoulDateString(new Date('2026-08-31T15:00:00Z')), '2026-09-01');
    console.log('PASS: staff selection, duplicate names, concurrent inserts, stale account/status/label updates, OFF transitions, and Seoul midnight. No production writes.');
} finally { await db.close(); }
