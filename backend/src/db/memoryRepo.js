// In-memory repository for development and tests (DB_DRIVER=memory).
// Data disappears when the process stops. Refused in production by config.js.
import { randomUUID } from 'node:crypto';

const nowIso = () => new Date().toISOString();
const clone = (value) => (value === undefined || value === null ? value : structuredClone(value));
const OPEN_STATUSES = ['PENDING', 'SENT'];

export function createRepo() {
  const devices = new Map();
  const schedules = new Map(); // `${deviceId}|${day}` -> row
  const commands = new Map(); // id -> row
  const logs = [];

  return {
    async getDevice(deviceId) {
      return clone(devices.get(deviceId) ?? null);
    },

    async listDevices() {
      return [...devices.values()].sort((a, b) => a.name.localeCompare(b.name)).map(clone);
    },

    async createDeviceIfMissing({ deviceId, name }) {
      if (!devices.has(deviceId)) {
        const ts = nowIso();
        devices.set(deviceId, {
          id: randomUUID(),
          device_id: deviceId,
          name,
          status: 'OFFLINE',
          gate_status: 'UNKNOWN',
          mode: 'AUTO',
          last_seen: null,
          firmware_version: null,
          schedule_version: 0,
          applied_schedule_version: null,
          telemetry: {},
          token_hash: null,
          created_at: ts,
          updated_at: ts,
        });
      }
      return clone(devices.get(deviceId));
    },

    async updateDevice(deviceId, patch) {
      const row = devices.get(deviceId);
      if (!row) return null;
      Object.assign(row, patch, { updated_at: nowIso() });
      return clone(row);
    },

    async bumpScheduleVersion(deviceId) {
      const row = devices.get(deviceId);
      row.schedule_version += 1;
      row.updated_at = nowIso();
      return row.schedule_version;
    },

    async listSchedule(deviceId) {
      return [...schedules.values()].filter((r) => r.device_id === deviceId).map(clone);
    },

    async upsertScheduleDay(deviceId, day) {
      const key = `${deviceId}|${day.day_of_week}`;
      const existing = schedules.get(key);
      const ts = nowIso();
      const row = existing
        ? { ...existing, ...day, updated_at: ts }
        : { id: randomUUID(), device_id: deviceId, ...day, created_at: ts, updated_at: ts };
      schedules.set(key, row);
      return clone(row);
    },

    async insertScheduleDayIfMissing(deviceId, day) {
      const key = `${deviceId}|${day.day_of_week}`;
      if (!schedules.has(key)) {
        const ts = nowIso();
        schedules.set(key, { id: randomUUID(), device_id: deviceId, ...day, created_at: ts, updated_at: ts });
      }
    },

    async createCommand(command) {
      const row = {
        id: randomUUID(),
        result_message: null,
        sent_at: null,
        completed_at: null,
        created_at: nowIso(),
        ...command,
      };
      commands.set(row.id, row);
      return clone(row);
    },

    async getCommand(deviceId, id) {
      const row = commands.get(id);
      return row && row.device_id === deviceId ? clone(row) : null;
    },

    async getCommandByRequestId(requestId) {
      return clone([...commands.values()].find((c) => c.request_id === requestId) ?? null);
    },

    async updateCommand(id, patch) {
      const row = commands.get(id);
      if (!row) return null;
      Object.assign(row, patch);
      return clone(row);
    },

    // Commands still waiting for the device. All filters optional.
    async listOpenCommands({ deviceId, commandTypes, createdBefore, createdAfter } = {}) {
      return [...commands.values()]
        .filter((c) => OPEN_STATUSES.includes(c.status))
        .filter((c) => !deviceId || c.device_id === deviceId)
        .filter((c) => !commandTypes || commandTypes.includes(c.command))
        .filter((c) => !createdBefore || c.created_at < createdBefore)
        .filter((c) => !createdAfter || c.created_at >= createdAfter)
        .map(clone);
    },

    async listStaleOnlineDevices(cutoffIso) {
      return [...devices.values()]
        .filter((d) => d.status === 'ONLINE' && (!d.last_seen || d.last_seen < cutoffIso))
        .map(clone);
    },

    async insertLog(entry) {
      const row = { id: randomUUID(), metadata: {}, created_at: nowIso(), ...entry };
      logs.push(row);
      if (logs.length > 5000) logs.splice(0, logs.length - 5000);
      return clone(row);
    },

    async listLogs(deviceId, limit) {
      return logs
        .filter((l) => l.device_id === deviceId)
        .slice(-limit)
        .reverse()
        .map(clone);
    },
  };
}
