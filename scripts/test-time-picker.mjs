import assert from 'node:assert/strict';
import { formatClockTime, parseClockTime, toClockTime } from '../src/utils/timePicker.js';

assert.equal(formatClockTime('00:00'), '오전 12:00');
assert.equal(formatClockTime('12:00'), '오후 12:00');
assert.equal(formatClockTime('14:37'), '오후 2:37');
assert.equal(formatClockTime('23:59'), '오후 11:59');
for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute++) {
        const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        assert.equal(toClockTime(parseClockTime(value)), value);
    }
}
for (const value of ['', undefined, '24:00', '12:60', '12:3', '-1:00']) {
    assert.equal(parseClockTime(value), null);
    assert.equal(formatClockTime(value), '');
}
assert.equal(toClockTime({ period: '오전', hour: 0, minute: 0 }), '');
assert.equal(toClockTime({ period: '오후', hour: 12, minute: 60 }), '');
console.log('PASS: all 1,440 minute values round-trip without rounding; midnight/noon, Korean display and invalid/empty values.');
