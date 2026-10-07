import { Router } from 'express';

import { getAlerts } from '../controllers/alertController';

import { auth } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

router.use(auth);
router.use(dbSelector);

router.get('/low-stock', getAlerts);

export default router;