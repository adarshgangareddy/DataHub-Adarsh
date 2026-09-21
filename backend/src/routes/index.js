import { Router } from 'express';
import { config } from '../config.js';
import { ok } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import authRoutes from './authRoutes.js';
import deviceRoutes from './deviceRoutes.js';
import devRoutes from './devRoutes.js';
import { stream } from '../controllers/eventsController.js';

const router = Router();

// Public: liveness only, reveals nothing about devices.
router.get('/health', (_req, res) => ok(res, { status: 'ok' }));

router.use('/auth', authRoutes);

// Everything below requires a valid session.
router.use(requireAuth);
router.get('/events', stream);
router.use('/devices', deviceRoutes);
if (config.MOCK_DEVICE) router.use('/dev', devRoutes);

export default router;
