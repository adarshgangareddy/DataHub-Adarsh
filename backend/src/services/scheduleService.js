import { randomUUID } from 'node:crypto';
import { repo } from '../db/repository.js';
import { DAYS, DAY_NUMBER } from '../utils/constants.js';
import { getTransport } from '../mqtt/transport.js';
import { topicsFor } from '../mqtt/topics.js';
import { logEvent } from './logService.js';
import { publishEvent } from './eventBus.js';
import { presentCommand, presentDevice, presentSchedule } from './presenters.js';
import { logger } from '../utils/logger.js';
import { withLock } from '../utils/lock.js';

// Until a schedule is saved, every day is present but switched off, so a fresh install never
// opens the gate by surprise.
const DEFAULT_DAY = { open_time: '08:00', close_time: '20:00', enabled: false };

export async function ensureDefaultSchedule(deviceId) {
  for (const day of DAYS) {
    await repo.insertScheduleDayIfMissing(deviceId, { day_of_week: day, ...DEFAULT_DAY });
  }
}

export async function getSchedule(device) {
  const rows = await repo.listSchedule(device.device_id);
  return presentSchedule(rows, device);
}

/**
 * The full weekly schedule as sent to the device.
 * The whole week is sent every time (not just the edited day) so that a device that missed an
 * earlier message, or was offline, always ends up with a complete, consistent schedule.
 */
async function buildConfigPayload(device, requestId, version) {
  const rows = await repo.listSchedule(device.device_id);
  const byDay = new Map(rows.map((r) => [r.day_of_week, r]));
  return {
    type: 'SCHEDULE_UPDATE',
    deviceId: device.device_id,
    requestId,
    version,
    timestamp: new Date().toISOString(),
    schedule: DAYS.map((day) => {
      const r = byDay.get(day);
      return {
        dayOfWeek: DAY_NUMBER[day],
        openTime: r?.open_time ?? DEFAULT_DAY.open_time,
        closeTime: r?.close_time ?? DEFAULT_DAY.close_time,
        enabled: r?.enabled ?? false,
      };
    }),
  };
}

const describeDay = (d) => (d.enabled ? `${d.dayOfWeek} ${d.openTime} → ${d.closeTime}` : `${d.dayOfWeek} off`);

/** Saves one day, bumps the version, and publishes the full schedule (retained) to the device. */
export function saveScheduleDay(deviceRow, input, user) {
  return withLock(deviceRow.device_id, () => saveScheduleDayLocked(deviceRow, input, user));
}

async function saveScheduleDayLocked(deviceRow, input, user) {
  const deviceId = deviceRow.device_id;

  await repo.upsertScheduleDay(deviceId, {
    day_of_week: input.dayOfWeek,
    open_time: input.openTime,
    close_time: input.closeTime,
    enabled: input.enabled,
  });
  const version = await repo.bumpScheduleVersion(deviceId);

  const requestId = randomUUID();
  const command = await repo.createCommand({
    device_id: deviceId,
    command: 'SET_SCHEDULE',
    request_id: requestId,
    payload: { ...input, version },
    requested_by: user.username,
    status: 'PENDING',
  });

  await logEvent(deviceId, 'SCHEDULE_UPDATED', `Schedule updated: ${describeDay(input)}`, {
    ...input,
    version,
    requestedBy: user.username,
  });

  let delivery = 'SENT';
  let warning;
  let latestCommand = command;
  try {
    const fresh = await repo.getDevice(deviceId);
    const payload = await buildConfigPayload(fresh, requestId, version);
    await getTransport().publish(topicsFor(deviceId).config, payload, { qos: 1, retain: true });
    latestCommand = await repo.updateCommand(command.id, { status: 'SENT', sent_at: new Date().toISOString() });
  } catch (err) {
    // The schedule is safely stored. The retained message / next status report will deliver it.
    logger.warn('Schedule saved but could not be published', { deviceId, reason: err.message });
    delivery = 'QUEUED';
    warning = 'Saved, but the message broker is unavailable. The gate will receive it when the connection is restored.';
  }

  const device = await repo.getDevice(deviceId);
  if (delivery === 'SENT' && presentDevice(device).status === 'OFFLINE') {
    delivery = 'QUEUED';
    warning = 'Saved. The device is offline and will apply the schedule when it reconnects.';
  }

  const schedule = await getSchedule(device);
  publishEvent('schedule', schedule);
  publishEvent('command', presentCommand(latestCommand));
  return { schedule, command: presentCommand(latestCommand), delivery, warning };
}

const lastRepublish = new Map();

/**
 * Re-sends the current schedule when the device reports an older version than the database
 * (for example after a broker outage or a device reset). Rate limited per device.
 */
export async function republishConfig(deviceId, { force = false } = {}) {
  const now = Date.now();
  if (!force && now - (lastRepublish.get(deviceId) ?? 0) < 30_000) return false;
  lastRepublish.set(deviceId, now);

  try {
    const device = await repo.getDevice(deviceId);
    if (!device || device.schedule_version === 0) return false;
    const payload = await buildConfigPayload(device, randomUUID(), device.schedule_version);
    await getTransport().publish(topicsFor(deviceId).config, payload, { qos: 1, retain: true });
    logger.info('Re-sent schedule to device', { deviceId, version: device.schedule_version });
    return true;
  } catch (err) {
    logger.warn('Could not re-send schedule', { deviceId, reason: err.message });
    return false;
  }
}

/** Called when the MQTT connection (re)opens. */
export async function syncAllConfigs() {
  const devices = await repo.listDevices();
  for (const d of devices) {
    if (d.schedule_version > 0 && (d.applied_schedule_version ?? -1) < d.schedule_version) {
      await republishConfig(d.device_id, { force: true });
    }
  }
}
