// Converts database rows (snake_case) into the API shape (camelCase) and hides internal columns.
import { config } from '../config.js';
import { DAYS } from '../utils/constants.js';

export function isStale(lastSeen) {
  return !lastSeen || Date.now() - Date.parse(lastSeen) > config.DEVICE_OFFLINE_TIMEOUT_S * 1000;
}

export function presentDevice(row) {
  // A device that has gone quiet is shown as OFFLINE even before the background sweep marks it.
  const status = row.status === 'ONLINE' && !isStale(row.last_seen) ? 'ONLINE' : 'OFFLINE';
  return {
    deviceId: row.device_id,
    name: row.name,
    status,
    gateStatus: row.gate_status,
    mode: row.mode,
    lastSeen: row.last_seen,
    firmwareVersion: row.firmware_version,
    scheduleVersion: row.schedule_version,
    appliedScheduleVersion: row.applied_schedule_version,
    telemetry: row.telemetry ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function presentSchedule(rows, device) {
  const byDay = new Map(rows.map((r) => [r.day_of_week, r]));
  return {
    deviceId: device.device_id,
    version: device.schedule_version,
    appliedVersion: device.applied_schedule_version,
    days: DAYS.map((day) => {
      const r = byDay.get(day);
      return {
        dayOfWeek: day,
        openTime: r?.open_time ?? '08:00',
        closeTime: r?.close_time ?? '20:00',
        enabled: r?.enabled ?? false,
        updatedAt: r?.updated_at ?? null,
      };
    }),
  };
}

export function presentCommand(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    command: row.command,
    requestId: row.request_id,
    status: row.status,
    requestedBy: row.requested_by,
    resultMessage: row.result_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function presentLog(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    eventType: row.event_type,
    message: row.message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}
