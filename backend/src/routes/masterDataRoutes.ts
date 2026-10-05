import { Router } from 'express';
import { getMasterData } from '../controllers/masterDataController';
import { verifyToken, verifyRole } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Yêu cầu đăng nhập -> Chọn DB Kho -> Cấp quyền cho cả 3 vai trò
router.use(
  verifyToken,
  dbSelector,
  verifyRole(['ADMIN', 'MANAGER', 'STAFF'])
);

router.get('/', getMasterData);

export default router;