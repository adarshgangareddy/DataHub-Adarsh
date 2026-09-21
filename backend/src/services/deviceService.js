import { repo } from '../db/repository.js';
import { config } from '../config.js';
import { ensureDefaultSchedule } from './scheduleService.js';
import { presentDevice } from './presenters.js';
import { publishEvent } from './eventBus.js';
import { logger } from '../utils/logger.js';

/** Registers a device (and its default, switched-off schedule) if it does not exist yet. */
export async function ensureDevice(deviceId, name) {
  const device = await repo.createDeviceIfMissing({ deviceId, name });
  await ensureDefaultSchedule(deviceId);
  if (!device.token_hash) {
    logger.warn(
      `Device ${deviceId} has no token registered. ` +
        (config.NODE_ENV === 'production'
          ? 'Its MQTT messages will be REJECTED until you run: npm run register-device'
          : 'Accepting its messages because this is not production.'),
    );
  }
  return device;
}

export async function listDevices() {
  return (await repo.listDevices()).map(presentDevice);
}

/** Persist a change to a device row and notify open dashboards. */
export async function updateDeviceAndNotify(deviceId, patch) {
  const updated = await repo.updateDevice(deviceId, patch);
  if (updated) publishEvent('device', presentDevice(updated));
  return updated;
}
