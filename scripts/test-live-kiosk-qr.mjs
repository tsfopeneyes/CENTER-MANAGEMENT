import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const setupPin = process.argv[2];
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!setupPin || !supabaseUrl || !anonKey) {
  throw new Error('Usage: node scripts/test-live-kiosk-qr.mjs <setup-pin> (Supabase browser env is also required)');
}

const restHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
const locationsResponse = await fetch(`${supabaseUrl}/rest/v1/locations?select=id,name,group_id&is_active=neq.false`, {
  headers: restHeaders,
});
assert.equal(locationsResponse.ok, true, 'locations must be readable');
const locations = await locationsResponse.json();

const groupsResponse = await fetch(`${supabaseUrl}/rest/v1/location_groups?select=id,name`, { headers: restHeaders });
assert.equal(groupsResponse.ok, true, 'location groups must be readable');
const groups = await groupsResponse.json();
const haifnGroupIds = new Set(groups.filter((group) => /하이픈|haifn|강동/i.test(group.name || '')).map((group) => group.id));
const location = locations.find((item) => /하이픈|haifn|강동/i.test(item.name || '') || haifnGroupIds.has(item.group_id));
assert.ok(location?.id, 'an active Haifn location is required');

const callFunction = async (body, expectedOk = true) => {
  const response = await fetch(`${supabaseUrl}/functions/v1/kiosk-qr`, {
    method: 'POST',
    headers: { ...restHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.ok, expectedOk, payload?.error || `unexpected HTTP ${response.status}`);
  return { response, payload };
};

let device;
let initialActiveDeviceCount = 0;
try {
  const { payload: initialStatus } = await callFunction({ action: 'rotation-status' });
  initialActiveDeviceCount = initialStatus.activeDeviceCount;
  assert.equal(initialStatus.active, initialActiveDeviceCount > 0);

  ({ payload: device } = await callFunction({
    action: 'activate-device',
    locationId: location.id,
    setupPin,
    displayName: 'Codex deployment verification',
  }));
  assert.ok(device.deviceId && device.deviceSecret, 'activation must return device credentials');
  const { payload: activeStatus } = await callFunction({ action: 'rotation-status' });
  assert.equal(activeStatus.active, true, 'legacy QR must turn off once a kiosk is active');
  assert.equal(activeStatus.activeDeviceCount, initialActiveDeviceCount + 1);

  const { payload: issued } = await callFunction({
    action: 'issue-qr',
    locationId: location.id,
    deviceId: device.deviceId,
    deviceSecret: device.deviceSecret,
  });
  assert.ok(issued.token && new Date(issued.expiresAt).getTime() > Date.now(), 'issued QR must be live');

  const { payload: exchanged } = await callFunction({ action: 'exchange-qr', token: issued.token });
  assert.ok(exchanged.presenceGrant, 'QR exchange must return a presence grant');
  assert.equal(exchanged.location.id, location.id, 'verified location must match the kiosk');

  const { payload: checkinValidation } = await callFunction({
    action: 'validate-presence',
    presenceGrant: exchanged.presenceGrant,
    locationId: location.id,
    type: 'CHECKIN',
  });
  assert.equal(checkinValidation.valid, true);

  const { payload: checkoutValidation } = await callFunction({
    action: 'validate-presence',
    presenceGrant: exchanged.presenceGrant,
    locationId: '00000000-0000-4000-8000-000000000000',
    type: 'CHECKOUT',
  });
  assert.equal(checkoutValidation.valid, true, 'checkout may use the active visit location even after QR rotation');

  await callFunction({ action: 'exchange-qr', token: `${issued.token}broken` }, false);
} finally {
  if (device?.deviceId && device?.deviceSecret) {
    await callFunction({
      action: 'deactivate-device',
      locationId: location.id,
      deviceId: device.deviceId,
      deviceSecret: device.deviceSecret,
    });
    await callFunction({
      action: 'issue-qr',
      locationId: location.id,
      deviceId: device.deviceId,
      deviceSecret: device.deviceSecret,
    }, false);
    const { payload: finalStatus } = await callFunction({ action: 'rotation-status' });
    assert.equal(finalStatus.activeDeviceCount, initialActiveDeviceCount, 'test cleanup must preserve existing kiosk devices');
    assert.equal(finalStatus.active, initialActiveDeviceCount > 0);
  }
}

console.log('live kiosk QR flow: ok');
