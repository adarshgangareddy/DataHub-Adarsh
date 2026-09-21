import { ok } from '../utils/response.js';
import { scheduleUpdateSchema } from '../utils/validation.js';
import { getSchedule, saveScheduleDay } from '../services/scheduleService.js';

export async function get(req, res) {
  return ok(res, await getSchedule(req.device));
}

export async function update(req, res) {
  const input = scheduleUpdateSchema.parse(req.body);
  const result = await saveScheduleDay(req.device, input, req.user);
  // 202: stored, and on its way to the device; the device confirms asynchronously.
  return ok(res, result, 202);
}
