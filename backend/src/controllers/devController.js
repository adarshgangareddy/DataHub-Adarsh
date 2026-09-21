// Development-only controls for the simulated device. Only mounted when MOCK_DEVICE=true.
import { z } from 'zod';
import { ok } from '../utils/response.js';
import { getTransport } from '../mqtt/transport.js';

const bodySchema = z
  .object({
    online: z.boolean().optional(),
    respond: z.boolean().optional(),
    emergencyStop: z.boolean().optional(),
    rtcOk: z.boolean().optional(),
  })
  .strict();

export const getMock = (_req, res) => ok(res, { mock: getTransport().controls.get() });

export function setMock(req, res) {
  const patch = bodySchema.parse(req.body);
  return ok(res, { mock: getTransport().controls.set(patch) });
}
