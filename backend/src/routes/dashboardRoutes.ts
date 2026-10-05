import { Router } from 'express';
import { getDashboardSummary } from '../controllers/dashboardController';
import { verifyToken, branchGuard } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Yêu cầu đăng nhập -> Chọn DB Kho tương ứng -> Chặn truy cập Dashboard kho khác
router.use(verifyToken, dbSelector, branchGuard);

router.get('/summary', getDashboardSummary);

export default router;