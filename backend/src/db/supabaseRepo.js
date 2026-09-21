// Supabase (PostgreSQL) repository. Only the backend uses this, with the service-role key.
import { createClient } from '@supabase/supabase-js';
import { AppError } from '../utils/errors.js';

const dbError = (error) =>
  new AppError(500, 'DB_ERROR', 'A database error occurred.', { cause: new Error(error.message) });

// Postgres returns time as "08:00:00"; the rest of the app uses "08:00".
const hhmm = (t) => (typeof t === 'string' ? t.slice(0, 5) : t);
const scheduleRow = (r) => (r ? { ...r, open_time: hhmm(r.open_time), close_time: hhmm(r.close_time) } : r);

export function createRepo({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }) {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Unwraps a Supabase response: returns data or throws a safe error.
  const run = async (query) => {
    const { data, error } = await query;
    if (error) throw dbError(error);
    return data;
  };

  const getDevice = async (deviceId) =>
    run(sb.from('devices').select('*').eq('device_id', deviceId).maybeSingle());

  return {
    getDevice,

    async listDevices() {
      return run(sb.from('devices').select('*').order('name'));
    },

    async createDeviceIfMissing({ deviceId, name }) {
      await run(
        sb.from('devices').upsert({ device_id: deviceId, name }, { onConflict: 'device_id', ignoreDuplicates: true }),
      );
      return getDevice(deviceId);
    },

    async updateDevice(deviceId, patch) {
      return run(sb.from('devices').update(patch).eq('device_id', deviceId).select().maybeSingle());
    },

    async bumpScheduleVersion(deviceId) {
      return run(sb.rpc('bump_schedule_version', { p_device_id: deviceId }));
    },

    async listSchedule(deviceId) {
      const rows = await run(sb.from('schedules').select('*').eq('device_id', deviceId));
      return rows.map(scheduleRow);
    },

    async upsertScheduleDay(deviceId, day) {
      const row = await run(
        sb
          .from('schedules')
          .upsert({ device_id: deviceId, ...day }, { onConflict: 'device_id,day_of_week' })
          .select()
          .single(),
      );
      return scheduleRow(row);
    },

    async insertScheduleDayIfMissing(deviceId, day) {
      await run(
        sb
          .from('schedules')
          .upsert({ device_id: deviceId, ...day }, { onConflict: 'device_id,day_of_week', ignoreDuplicates: true }),
      );
    },

    async createCommand(command) {
      return run(sb.from('commands').insert(command).select().single());
    },

    async getCommand(deviceId, id) {
      return run(sb.from('commands').select('*').eq('device_id', deviceId).eq('id', id).maybeSingle());
    },

    async getCommandByRequestId(requestId) {
      return run(sb.from('commands').select('*').eq('request_id', requestId).maybeSingle());
    },

    async updateCommand(id, patch) {
      return run(sb.from('commands').update(patch).eq('id', id).select().maybeSingle());
    },

    async listOpenCommands({ deviceId, commandTypes, createdBefore, createdAfter } = {}) {
      let q = sb.from('commands').select('*').in('status', ['PENDING', 'SENT']);
      if (deviceId) q = q.eq('device_id', deviceId);
      if (commandTypes) q = q.in('command', commandTypes);
      if (createdBefore) q = q.lt('created_at', createdBefore);
      if (createdAfter) q = q.gte('created_at', createdAfter);
      return run(q);
    },

    async listStaleOnlineDevices(cutoffIso) {
      return run(
        sb.from('devices').select('*').eq('status', 'ONLINE').or(`last_seen.is.null,last_seen.lt.${cutoffIso}`),
      );
    },

    async insertLog(entry) {
      return run(sb.from('device_logs').insert(entry).select().single());
    },

    async listLogs(deviceId, limit) {
      return run(
        sb.from('device_logs').select('*').eq('device_id', deviceId).order('created_at', { ascending: false }).limit(limit),
      );
    },
  };
}

