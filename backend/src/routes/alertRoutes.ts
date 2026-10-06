import { Router } from 'express';
import { getAlerts } from '../controllers/alertController';
import { verifyToken, branchGuard } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Bắt buộc có Token + Tự động chọn DB + Chặn truy cập cảnh báo kho khác
router.use(verifyToken, dbSelector, branchGuard);

router.get('/low-stock', getAlerts);

export default router;