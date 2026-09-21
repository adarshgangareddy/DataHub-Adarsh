// Integration test: real Express app + in-memory database + the mock device (no network, no hardware).
// Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.DB_DRIVER = 'memory';
process.env.MOCK_DEVICE = 'true';
process.env.MOCK_MOVE_SECONDS = '0.4';
process.env.MOCK_HEARTBEAT_SECONDS = '1';
process.env.COMMAND_ACK_TIMEOUT_S = '3';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('correct horse battery', 4);
process.env.DEVICE_ID = 'GATE-001';
process.env.API_RATE_LIMIT_PER_MIN = '100000'; // the test polls quickly

const { createApp } = await import('../src/app.js');
const { ensureDevice } = await import('../src/services/deviceService.js');
const { startMqtt } = await import('../src/mqtt/index.js');
const { getTransport } = await import('../src/mqtt/transport.js');
const { expireUnacknowledgedCommands } = await import('../src/services/commandService.js');
const { sweepOfflineDevices } = await import('../src/services/presenceService.js');

let server;
let base;
let cookie = '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(50);
  }
  throw new Error('timed out waiting for condition');
}

async function api(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-Requested-With': 'gate-dashboard' } : {}),
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json, res };
}

before(async () => {
  await ensureDevice('GATE-001', 'Main gate');
  startMqtt();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await getTransport().close();
  server.closeAllConnections?.();
  server.close();
});

test('protected routes require login', async () => {
  const r = await api('/devices', { auth: false });
  assert.equal(r.status, 401);
  assert.equal(r.json.success, false);
  assert.equal(r.json.error.code, 'AUTH_REQUIRED');
});

test('login rejects bad credentials and accepts good ones', async () => {
  const bad = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'nope' }, auth: false });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.error.code, 'INVALID_CREDENTIALS');

  const good = await api('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'correct horse battery' },
    auth: false,
  });
  assert.equal(good.status, 200);
  assert.equal(good.json.success, true);
  const setCookie = good.res.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.equal(JSON.stringify(good.json).includes('token'), false, 'JWT must not appear in the response body');
  cookie = setCookie.split(';')[0];
});

test('state-changing requests need the CSRF header', async () => {
  const r = await api('/devices/GATE-001/commands/mode', {
    method: 'POST',
    body: { mode: 'MANUAL' },
    headers: { 'X-Requested-With': '' },
  });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'CSRF_REJECTED');
});

test('device access: malformed and unknown IDs are rejected', async () => {
  assert.equal((await api('/devices/bad_id')).status, 400);
  assert.equal((await api('/devices/GATE-999')).status, 404);
});

test('schedule validation', async () => {
  const put = (body) => api('/devices/GATE-001/schedule', { method: 'PUT', body });
  const base = { dayOfWeek: 'Monday', openTime: '08:00', closeTime: '20:00', enabled: true };

  assert.equal((await put({ ...base, dayOfWeek: 'Funday' })).status, 400);
  assert.equal((await put({ ...base, openTime: '8am' })).status, 400);
  assert.equal((await put({ ...base, openTime: '25:00' })).status, 400);
  assert.equal((await put({ ...base, openTime: '10:00', closeTime: '10:00' })).status, 400);
  const backwards = await put({ ...base, openTime: '20:00', closeTime: '08:00' });
  assert.equal(backwards.status, 400);
  assert.equal(backwards.json.error.code, 'VALIDATION_ERROR');
  assert.equal((await put({ ...base, extra: 1 })).status, 400);
});

test('saving a schedule reaches the device and is acknowledged', async () => {
  // Wait for the mock device to come online first.
  await waitFor(async () => (await api('/devices/GATE-001/status')).json.data.status === 'ONLINE');

  const r = await api('/devices/GATE-001/schedule', {
    method: 'PUT',
    body: { dayOfWeek: 'Monday', openTime: '08:30', closeTime: '19:15', enabled: true },
  });
  assert.equal(r.status, 202);
  assert.equal(r.json.data.delivery, 'SENT');
  const version = r.json.data.schedule.version;
  assert.ok(version >= 1);

  await waitFor(async () => (await api('/devices/GATE-001/schedule')).json.data.appliedVersion === version);
  const sched = (await api('/devices/GATE-001/schedule')).json.data;
  const monday = sched.days.find((d) => d.dayOfWeek === 'Monday');
  assert.deepEqual([monday.openTime, monday.closeTime, monday.enabled], ['08:30', '19:15', true]);
  assert.equal(sched.days.length, 7);

  const cmd = await waitFor(async () => {
    const c = await api(`/devices/GATE-001/commands/${r.json.data.command.id}`);
    return c.json.data.command.status === 'ACKNOWLEDGED' ? c.json.data.command : null;
  });
  assert.equal(cmd.status, 'ACKNOWLEDGED');
});

test('open command: gate state changes only after the device reports it', async () => {
  const r = await api('/devices/GATE-001/commands/open', { method: 'POST' });
  assert.equal(r.status, 202);
  // The API call succeeding must NOT change the gate state by itself.
  const immediately = (await api('/devices/GATE-001/status')).json.data;
  assert.notEqual(immediately.gateStatus, 'OPEN');

  await waitFor(async () => (await api('/devices/GATE-001/status')).json.data.gateStatus === 'OPEN');

  // Repeating OPEN is refused.
  const again = await api('/devices/GATE-001/commands/open', { method: 'POST' });
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, 'ALREADY_IN_STATE');

  const logs = (await api('/devices/GATE-001/logs')).json.data.logs;
  const types = logs.map((l) => l.eventType);
  assert.ok(types.includes('COMMAND_SENT'));
  assert.ok(types.includes('COMMAND_ACKNOWLEDGED'));
  assert.ok(types.includes('GATE_OPENED'));
  assert.ok(types.includes('SCHEDULE_UPDATED'));
});

test('close command works and mode can be changed', async () => {
  assert.equal((await api('/devices/GATE-001/commands/close', { method: 'POST' })).status, 202);
  await waitFor(async () => (await api('/devices/GATE-001/status')).json.data.gateStatus === 'CLOSED');

  const m = await api('/devices/GATE-001/commands/mode', { method: 'POST', body: { mode: 'MANUAL' } });
  assert.equal(m.status, 202);
  await waitFor(async () => (await api('/devices/GATE-001/status')).json.data.mode === 'MANUAL');
  assert.equal((await api('/devices/GATE-001/commands/mode', { method: 'POST', body: { mode: 'BOGUS' } })).status, 400);
});

test('offline device: gate commands are refused, schedules are queued', async () => {
  await api('/dev/mock', { method: 'POST', body: { online: false } });
  await waitFor(async () => (await api('/devices/GATE-001/status')).json.data.status === 'OFFLINE');

  const open = await api('/devices/GATE-001/commands/open', { method: 'POST' });
  assert.equal(open.status, 409);
  assert.equal(open.json.error.code, 'DEVICE_OFFLINE');

  const sched = await api('/devices/GATE-001/schedule', {
    method: 'PUT',
    body: { dayOfWeek: 'Tuesday', openTime: '09:00', closeTime: '17:00', enabled: true },
  });
  assert.equal(sched.status, 202);
  assert.equal(sched.json.data.delivery, 'QUEUED');
  const version = sched.json.data.schedule.version;

  // Device comes back: the retained schedule is delivered and applied.
  await api('/dev/mock', { method: 'POST', body: { online: true } });
  await waitFor(async () => (await api('/devices/GATE-001/schedule')).json.data.appliedVersion === version);
});

test('unacknowledged commands become FAILED', async () => {
  await api('/dev/mock', { method: 'POST', body: { respond: false } });
  const r = await api('/devices/GATE-001/commands/open', { method: 'POST' });
  assert.equal(r.status, 202);
  const id = r.json.data.command.id;

  // A second gate command while one is waiting is refused.
  assert.equal((await api('/devices/GATE-001/commands/open', { method: 'POST' })).json.error.code, 'COMMAND_IN_PROGRESS');

  // The background job (jobs.js) runs this same function every few seconds.
  await sleep(3200);
  await expireUnacknowledgedCommands();
  const failed = (await api(`/devices/GATE-001/commands/${id}`)).json.data.command;
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.resultMessage, 'Device did not acknowledge command.');
  await api('/dev/mock', { method: 'POST', body: { respond: true } });
});

test('a device that stops sending heartbeats is marked offline', async () => {
  // Stop the mock's traffic, then run the sweep with a tiny timeout window.
  await api('/dev/mock', { method: 'POST', body: { online: true } });
  await waitFor(async () => (await api('/devices/GATE-001/status')).json.data.status === 'ONLINE');
  const { repo } = await import('../src/db/repository.js');
  await repo.updateDevice('GATE-001', { last_seen: new Date(Date.now() - 10 * 60_000).toISOString() });
  // presenter already reports it OFFLINE before the sweep has run...
  assert.equal((await api('/devices/GATE-001/status')).json.data.status, 'OFFLINE');
  await sweepOfflineDevices();
  const logs = (await api('/devices/GATE-001/logs?limit=50')).json.data.logs;
  assert.ok(logs.some((l) => l.eventType === 'DEVICE_OFFLINE'));
});

test('responses never contain the device token hash', async () => {
  const d = await api('/devices/GATE-001');
  assert.equal(JSON.stringify(d.json).includes('token'), false);
});

test('MQTT input is authenticated: bad token, retained and mismatched messages are ignored', async () => {
  const { createHash } = await import('node:crypto');
  const { repo } = await import('../src/db/repository.js');
  const { handleMqttMessage } = await import('../src/mqtt/messageHandler.js');

  await api('/dev/mock', { method: 'POST', body: { online: false } }); // silence the simulator
  await repo.updateDevice('GATE-001', {
    token_hash: createHash('sha256').update('secret-token').digest('hex'),
    gate_status: 'CLOSED',
  });

  const send = (body, { topic = 'gate/GATE-001/status', retain = false } = {}) =>
    handleMqttMessage(topic, Buffer.from(JSON.stringify(body)), { retain });
  const gate = async () => (await repo.getDevice('GATE-001')).gate_status;

  await send({ online: true, gateStatus: 'OPEN', token: 'wrong' });
  assert.equal(await gate(), 'CLOSED', 'wrong token must be ignored');

  await send({ online: true, gateStatus: 'OPEN' });
  assert.equal(await gate(), 'CLOSED', 'missing token must be ignored');

  await send({ online: true, gateStatus: 'OPEN', token: 'secret-token' }, { retain: true });
  assert.equal(await gate(), 'CLOSED', 'retained messages must be ignored');

  await send({ deviceId: 'GATE-002', online: true, gateStatus: 'OPEN', token: 'secret-token' });
  assert.equal(await gate(), 'CLOSED', 'topic/payload device mismatch must be ignored');

  await send({ online: true, gateStatus: 'EXPLODING', token: 'secret-token' });
  assert.equal(await gate(), 'CLOSED', 'invalid payload must be ignored');

  await send({ online: true, gateStatus: 'OPEN', token: 'secret-token' });
  assert.equal(await gate(), 'OPEN', 'valid, authenticated message is applied');

  await repo.updateDevice('GATE-001', { token_hash: null });
});
