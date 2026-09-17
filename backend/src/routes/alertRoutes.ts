import { Router } from 'express';
import { getAlerts } from '../controllers/alertController';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

router.use(dbSelector);
router.get('/low-stock', getAlerts);

export default router;