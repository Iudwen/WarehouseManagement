import { Router } from 'express';
import { getAlerts } from '../controllers/alertController';

const router = Router();
router.get('/low-stock', getAlerts);

export default router;