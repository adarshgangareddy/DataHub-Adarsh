import { z } from 'zod';
import { DAYS, DEVICE_ID_REGEX, GATE_STATUS, MODES, TIME_REGEX } from './constants.js';

export const deviceIdSchema = z.string().regex(DEVICE_ID_REGEX, 'Invalid device ID.');
export const timeSchema = z.string().regex(TIME_REGEX, 'Time must be in 24-hour HH:MM format.');

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// ---------- HTTP request bodies ----------

export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export const scheduleUpdateSchema = z
  .object({
    dayOfWeek: z.enum(DAYS, { error: 'Day must be Monday to Sunday.' }),
    openTime: timeSchema,
    closeTime: timeSchema,
    enabled: z.boolean({ error: 'enabled must be true or false.' }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.openTime === value.closeTime) {
      ctx.addIssue({ code: 'custom', path: ['closeTime'], message: 'Opening and closing time cannot be the same.' });
    } else if (toMinutes(value.closeTime) < toMinutes(value.openTime)) {
      ctx.addIssue({ code: 'custom', path: ['closeTime'], message: 'Closing time must be after opening time.' });
    }
  });

export const modeSchema = z.object({ mode: z.enum(MODES, { error: 'Mode must be AUTO or MANUAL.' }) }).strict();

export const commandIdSchema = z.string().uuid('Invalid command ID.');

export const logQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(30),
});

// ---------- Messages received from the device over MQTT (untrusted input) ----------

const deviceBase = {
  deviceId: deviceIdSchema.optional(),
  token: z.string().max(200).optional(),
  timestamp: z.string().max(40).optional(),
};

const report = {
  gateStatus: z.enum(GATE_STATUS).optional(),
  mode: z.enum(MODES).optional(),
  firmwareVersion: z.string().max(32).optional(),
  scheduleVersion: z.number().int().min(0).optional(),
  rtcOk: z.boolean().optional(),
  emergencyStop: z.boolean().optional(),
};

export const deviceMessageSchemas = {
  status: z.object({ ...deviceBase, ...report, online: z.boolean().default(true) }),
  heartbeat: z.object({ ...deviceBase, ...report }),
  ack: z.object({
    ...deviceBase,
    requestId: z.string().min(8).max(64),
    command: z.string().max(32).optional(),
    status: z.enum(['OK', 'REJECTED', 'ERROR']),
    message: z.string().max(200).optional(),
    scheduleVersion: z.number().int().min(0).optional(),
  }),
  telemetry: z.object({
    ...deviceBase,
    rssi: z.number().optional(),
    uptimeS: z.number().optional(),
    freeHeap: z.number().optional(),
    rtcOk: z.boolean().optional(),
    rtcTime: z.string().max(40).optional(),
  }),
};

export function formatIssues(error) {
  return error.issues.map((i) => ({ field: i.path.join('.') || undefined, message: i.message }));
}
