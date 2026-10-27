import { Router } from 'express';
import {
  getDashboardSummary,
  getIOStatisticsController,
} from '../controllers/dashboardController';
import { auth } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

router.use(auth);
router.use(dbSelector);

// 1. Tồn kho realtime & đơn hàng chờ xử lý
router.get('/summary', getDashboardSummary);

// 2. Thống kê nhập - xuất (hôm nay, tháng này, theo ngày/tháng, theo kho/toàn quốc)
router.get('/io-statistics', getIOStatisticsController);

export default router;