import { Router } from 'express';
import { handleImport, handleExport } from '../controllers/inventoryController';
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

export default router;