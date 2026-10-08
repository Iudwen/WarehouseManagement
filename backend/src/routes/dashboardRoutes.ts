import { Router } from 'express';

import { getDashboardSummary } from '../controllers/dashboardController';

import { auth } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

router.use(auth);
router.use(dbSelector);

router.get('/summary', getDashboardSummary);

export default router;