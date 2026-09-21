import { ok } from '../utils/response.js';
import { canAccessDevice } from '../middleware/auth.js';
import { listDevices } from '../services/deviceService.js';
import { presentDevice } from '../services/presenters.js';

export async function list(req, res) {
  const devices = (await listDevices()).filter((d) => canAccessDevice(req.user, d.deviceId));
  return ok(res, { devices });
}

export function get(req, res) {
  return ok(res, { device: presentDevice(req.device) });
}

// Lightweight view for polling.
export function status(req, res) {
  const d = presentDevice(req.device);
  return ok(res, {
    deviceId: d.deviceId,
    status: d.status,
    gateStatus: d.gateStatus,
    mode: d.mode,
    lastSeen: d.lastSeen,
    scheduleVersion: d.scheduleVersion,
    appliedScheduleVersion: d.appliedScheduleVersion,
  });
}
