import assert from 'node:assert/strict';
import {
  getQrSecondsRemaining,
  isKioskQrAccessError,
  requiresRotatingQrAccess,
} from '../src/utils/kioskQr.js';

assert.equal(requiresRotatingQrAccess({ isQRCheckin: true, locationParam: 'HAIFN' }), true);
assert.equal(requiresRotatingQrAccess({ enabled: false, isQRCheckin: true, locationParam: 'HAIFN' }), true, 'legacy feature flags must not disable token checks');
assert.equal(requiresRotatingQrAccess({ isQRCheckin: true, locationParam: null }), true);
assert.equal(requiresRotatingQrAccess({ isQRCheckin: true, locationParam: '06d8ca2b-a2b4-4fe8-a568-7d425cd2d0ca' }), true);
assert.equal(requiresRotatingQrAccess({ isQRCheckin: true, locationParam: 'ENOUGH_PLACE' }), false);
assert.equal(requiresRotatingQrAccess({ isQRCheckin: false, locationParam: 'HAIFN' }), false);

assert.equal(isKioskQrAccessError('QR_TOKEN_EXPIRED'), true);
assert.equal(isKioskQrAccessError('KIOSK_DEVICE_INACTIVE'), true);
assert.equal(isKioskQrAccessError('network failed'), false);

const now = Date.parse('2026-08-28T00:00:00.000Z');
assert.equal(getQrSecondsRemaining('2026-08-28T00:01:15.000Z', now), 75);
assert.equal(getQrSecondsRemaining('2026-08-27T23:59:59.000Z', now), 0);
assert.equal(getQrSecondsRemaining(null, now), 0);

console.log('kiosk QR rules: ok');
