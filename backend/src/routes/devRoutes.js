import { Router } from 'express';
import { getMock, setMock } from '../controllers/devController.js';

const router = Router();
router.get('/mock', getMock);
router.post('/mock', setMock);
export default router;
