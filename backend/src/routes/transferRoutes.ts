import { Router } from 'express';
import { handleTransfer } from '../controllers/transferController';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

router.use(dbSelector);

// Đổi path từ '/transfer' thành '/' để gọi POST /api/transfer không bị trùng
router.post('/', handleTransfer);

export default router;