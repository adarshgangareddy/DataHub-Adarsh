import { ok } from '../utils/response.js';
import { logQuerySchema } from '../utils/validation.js';
import { repo } from '../db/repository.js';
import { presentLog } from '../services/presenters.js';

export async function list(req, res) {
  const { limit } = logQuerySchema.parse(req.query);
  const rows = await repo.listLogs(req.device.device_id, limit);
  return ok(res, { logs: rows.map(presentLog) });
}
