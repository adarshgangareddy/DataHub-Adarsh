import { repo } from '../db/repository.js';
import { canAccessDevice } from './auth.js';
import { deviceIdSchema } from '../utils/validation.js';
import { AppError, Errors } from '../utils/errors.js';

/**
 * Mounted on /devices/:deviceId. Rejects malformed IDs, unknown devices and users who are not
 * allowed to touch this device, then exposes the device row as req.device.
 */
export async function loadDevice(req, _res, next) {
  const parsed = deviceIdSchema.safeParse(req.params.deviceId);
  if (!parsed.success) return next(new AppError(400, 'INVALID_DEVICE_ID', 'Invalid device ID.'));

  if (!canAccessDevice(req.user, parsed.data)) return next(Errors.forbidden());

  const device = await repo.getDevice(parsed.data);
  if (!device) return next(Errors.deviceNotFound());

  req.device = device;
  next();
}
