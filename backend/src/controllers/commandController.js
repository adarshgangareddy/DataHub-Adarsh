import { ok } from '../utils/response.js';
import { AppError } from '../utils/errors.js';
import { commandIdSchema, modeSchema } from '../utils/validation.js';
import { repo } from '../db/repository.js';
import { sendGateCommand, sendModeCommand } from '../services/commandService.js';
import { presentCommand } from '../services/presenters.js';

export const open = async (req, res) => ok(res, { command: await sendGateCommand(req.device, 'OPEN', req.user) }, 202);

export const close = async (req, res) => ok(res, { command: await sendGateCommand(req.device, 'CLOSE', req.user) }, 202);

export async function setMode(req, res) {
  const { mode } = modeSchema.parse(req.body);
  return ok(res, { command: await sendModeCommand(req.device, mode, req.user) }, 202);
}

export async function getCommand(req, res) {
  const id = commandIdSchema.parse(req.params.commandId);
  const row = await repo.getCommand(req.device.device_id, id);
  if (!row) throw new AppError(404, 'COMMAND_NOT_FOUND', 'Command not found.');
  return ok(res, { command: presentCommand(row) });
}
