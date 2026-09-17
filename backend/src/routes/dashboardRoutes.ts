import { Router } from 'express';
import { getDashboardSummary } from '../controllers/dashboardController';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

router.use(dbSelector);
router.get('/summary', getDashboardSummary);

export default router;