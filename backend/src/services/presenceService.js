import { repo } from '../db/repository.js';
import { config } from '../config.js';
import { logEvent } from './logService.js';
import { updateDeviceAndNotify } from './deviceService.js';
import { acknowledgeScheduleUpTo } from './commandService.js';
import { republishConfig } from './scheduleService.js';
import { logger } from '../utils/logger.js';

/**
 * Applies a status or heartbeat report from the device.
 * The gate state, mode and schedule version are taken ONLY from what the device reports —
 * never from an API request succeeding.
 */
export async function applyDeviceReport(device, report) {
  const deviceId = device.device_id;
  const patch = {};

  if (report.online === false) {
    // Last-will message: the broker tells us the device dropped off.
    patch.status = 'OFFLINE';
    if (device.status === 'ONLINE') {
      await logEvent(deviceId, 'DEVICE_OFFLINE', 'Device went offline', { reason: 'connection lost' });
    }
  } else {
    patch.status = 'ONLINE';
    patch.last_seen = new Date().toISOString(); // server clock, never the device's own timestamp
    if (device.status !== 'ONLINE') {
      await logEvent(deviceId, 'DEVICE_ONLINE', 'Device came online');
    }
  }

  if (report.online !== false) {
    if (report.gateStatus && report.gateStatus !== device.gate_status) {
      patch.gate_status = report.gateStatus;
      if (report.gateStatus === 'OPEN') await logEvent(deviceId, 'GATE_OPENED', 'Gate opened');
      if (report.gateStatus === 'CLOSED') await logEvent(deviceId, 'GATE_CLOSED', 'Gate closed');
    }
    if (report.mode && report.mode !== device.mode) patch.mode = report.mode;
    if (report.firmwareVersion && report.firmwareVersion !== device.firmware_version) {
      patch.firmware_version = report.firmwareVersion;
    }

    const extra = {};
    if (report.rtcOk !== undefined) extra.rtcOk = report.rtcOk;
    if (report.emergencyStop !== undefined) extra.emergencyStop = report.emergencyStop;
    if (Object.keys(extra).length) {
      const before = device.telemetry ?? {};
      patch.telemetry = { ...before, ...extra };
      if (extra.rtcOk === false && before.rtcOk !== false) {
        await logEvent(deviceId, 'ERROR', 'Device clock (RTC) is not valid. Automatic schedule is paused.');
      }
      if (extra.emergencyStop === true && before.emergencyStop !== true) {
        await logEvent(deviceId, 'ERROR', 'Emergency stop engaged at the gate');
      }
    }

    // A status report describes what the device is running right now, so it is authoritative
    // (a device that was reset and reports an older version really is behind).
    if (report.scheduleVersion !== undefined) patch.applied_schedule_version = report.scheduleVersion;
  }

  const updated = await updateDeviceAndNotify(deviceId, patch);

  if (report.online !== false && report.scheduleVersion !== undefined) {
    // If the device confirms a schedule version, any waiting SET_SCHEDULE commands up to it are done.
    await acknowledgeScheduleUpTo(deviceId, report.scheduleVersion);
    // If it is behind the database, send the schedule again.
    if (updated && report.scheduleVersion < updated.schedule_version) await republishConfig(deviceId);
  }
  return updated;
}

/** Merges telemetry (Wi-Fi signal, uptime...) into the device row. */
export async function applyTelemetry(device, telemetry) {
  const { token, deviceId, timestamp, ...values } = telemetry;
  const patch = {
    telemetry: { ...(device.telemetry ?? {}), ...values, receivedAt: new Date().toISOString() },
    status: 'ONLINE',
    last_seen: new Date().toISOString(),
  };
  return updateDeviceAndNotify(device.device_id, patch);
}

/** Background job: mark devices OFFLINE when their heartbeats stop. */
export async function sweepOfflineDevices() {
  const cutoff = new Date(Date.now() - config.DEVICE_OFFLINE_TIMEOUT_S * 1000).toISOString();
  const stale = await repo.listStaleOnlineDevices(cutoff);
  for (const device of stale) {
    await updateDeviceAndNotify(device.device_id, { status: 'OFFLINE' });
    await logEvent(device.device_id, 'DEVICE_OFFLINE', 'Device went offline', {
      reason: `no heartbeat for ${config.DEVICE_OFFLINE_TIMEOUT_S} seconds`,
    });
    logger.warn('Device marked offline (no heartbeat)', { deviceId: device.device_id });
  }
}
