import assert from 'node:assert/strict';
import { calculateVisitPointEntitlements } from '../src/utils/visitPointRules.js';

const date = '2026-08-28';
const duringVisitDay = new Date('2026-08-28T12:00:00+09:00');
const log = (type, time, location_id = 'HAIFN') => ({
    id: `${type}-${time}`,
    type,
    location_id,
    created_at: `${date}T${time}:00+09:00`,
});

assert.deepEqual(calculateVisitPointEntitlements([log('CHECKIN', '10:00')], date, duringVisitDay), {
    visit: 1, stay: 0, longestCompletedStayMinutes: 0,
});

assert.equal(calculateVisitPointEntitlements([
    log('CHECKIN', '10:00'), log('CHECKOUT', '10:59'),
], date, duringVisitDay).stay, 0);

assert.equal(calculateVisitPointEntitlements([
    log('CHECKIN', '10:00'), log('CHECKOUT', '11:00'),
], date, duringVisitDay).stay, 1);

assert.equal(calculateVisitPointEntitlements([
    log('CHECKIN', '10:00'), log('CHECKIN', '10:30'), log('CHECKOUT', '11:00'),
], date, duringVisitDay).stay, 1, 'duplicate check-in must not restart the stay clock');

assert.equal(calculateVisitPointEntitlements([
    log('CHECKIN', '10:00'), log('MOVE', '10:30', 'ENOUGH_PLACE'), log('CHECKOUT', '11:00', 'ENOUGH_PLACE'),
], date, duringVisitDay).stay, 1, 'moving locations must keep the original stay clock');

const twoSessions = calculateVisitPointEntitlements([
    log('CHECKIN', '10:00'), log('CHECKOUT', '10:20'),
    log('CHECKIN', '12:00'), log('CHECKOUT', '13:05'),
], date, duringVisitDay);
assert.equal(twoSessions.visit, 1);
assert.equal(twoSessions.stay, 1);
assert.equal(twoSessions.longestCompletedStayMinutes, 65);

assert.deepEqual(calculateVisitPointEntitlements([
    { ...log('CHECKIN', '10:00'), created_at: '2026-08-27T10:00:00+09:00' },
], date, duringVisitDay), { visit: 0, stay: 0, longestCompletedStayMinutes: 0 });

const autoCheckout = calculateVisitPointEntitlements(
    [log('CHECKIN', '20:30')],
    date,
    new Date('2026-08-29T10:00:00+09:00')
);
assert.equal(autoCheckout.stay, 1, 'an unfinished past-day visit must close at 22:00');
assert.equal(autoCheckout.longestCompletedStayMinutes, 90);

console.log('visit point rules: all tests passed');
