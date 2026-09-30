import { Router } from 'express';
import { handleApproveTransfer, handleTransfer } from '../controllers/transferController';
import { verifyToken, branchGuard, verifyRole } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Pipeline bảo vệ 4 lớp: Bắt buộc Token -> Chọn DB -> Guard Chi nhánh -> Siết quyền ADMIN/MANAGER
router.post(
  '/',
  verifyToken,
  dbSelector,
  branchGuard,
  verifyRole(['ADMIN', 'MANAGER']), // STAFF gọi API này sẽ nhận ngay 403 Forbidden
  handleTransfer
);

router.post(
  '/:maPhieu/approve',
  verifyToken,
  dbSelector,
  branchGuard,
  verifyRole(['ADMIN', 'MANAGER']),
  handleApproveTransfer
);
export default router;