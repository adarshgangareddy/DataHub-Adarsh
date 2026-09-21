import { Router } from 'express';
import * as devices from '../controllers/deviceController.js';
import * as schedule from '../controllers/scheduleController.js';
import * as commands from '../controllers/commandController.js';
import * as logs from '../controllers/logController.js';
import { loadDevice } from '../middleware/deviceAccess.js';
import { commandLimiter } from '../middleware/rateLimit.js';

const router = Router();
router.get('/', devices.list);

const one = Router({ mergeParams: true });
one.get('/', devices.get);
one.get('/status', devices.status);
one.get('/schedule', schedule.get);
one.put('/schedule', schedule.update);
one.post('/commands/open', commandLimiter, commands.open);
one.post('/commands/close', commandLimiter, commands.close);
one.post('/commands/mode', commandLimiter, commands.setMode);
one.get('/commands/:commandId', commands.getCommand);
one.get('/logs', logs.list);

router.use('/:deviceId', loadDevice, one);
export default router;
