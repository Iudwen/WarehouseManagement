import { Router } from 'express';
import {
  handleApproveExport,
  handleApproveImport,
  handleExport,
  handleImport,
  handlePendingApprovals,
  handleRejectExport,
  handleRejectImport,
} from '../controllers/inventoryController';
import { verifyToken, branchGuard, verifyRole } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Pipeline bảo vệ 4 lớp toàn diện cho các thao tác Nhập/Xuất kho
router.use(
  verifyToken,
  dbSelector,
  branchGuard,
  verifyRole(['ADMIN', 'MANAGER', 'STAFF'])
);

router.post('/import', handleImport);
router.post('/export', handleExport);
router.get('/pending', verifyRole(['ADMIN', 'MANAGER']), handlePendingApprovals);
router.post('/import/:maPhieu/approve', verifyRole(['ADMIN', 'MANAGER']), handleApproveImport);
router.post('/import/:maPhieu/reject', verifyRole(['ADMIN', 'MANAGER']), handleRejectImport);
router.post('/export/:maPhieu/approve', verifyRole(['ADMIN', 'MANAGER']), handleApproveExport);
router.post('/export/:maPhieu/reject', verifyRole(['ADMIN', 'MANAGER']), handleRejectExport);

export default router;