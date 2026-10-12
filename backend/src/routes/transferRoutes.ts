import { Router } from 'express';
import {
  handleListTransfers,
  handleTransfer,
  handleApproveTransfer,
  handleConfirmSourceTransfer,
  handleSourceShipment,
  handleDestinationReceiving,
} from '../controllers/transferController';

import { auth } from '../middlewares/auth';
import { roleGuard } from '../middlewares/roleGuard';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Đọc danh sách phiếu điều chuyển (Áp dụng cho tất cả các vai trò liên quan)
router.get(
  '/',
  auth,
  roleGuard('DIEU_PHOI', 'QUAN_LY_KHO', 'NHAN_VIEN_KHO', 'ADMIN', 'DATA_ANALYST'),
  handleListTransfers
);

router.post(
  '/',
  auth,
  roleGuard('DIEU_PHOI'),
  dbSelector,
  handleTransfer
);

router.post(
  '/:maPhieu/approve',
  auth,
  roleGuard('QUAN_LY_KHO'),
  dbSelector,
  handleApproveTransfer
);

router.post(
  '/:maPhieu/source-confirm',
  auth,
  roleGuard('NHAN_VIEN_KHO'),
  dbSelector,
  handleConfirmSourceTransfer
);

router.post(
  '/:maPhieu/source-ship',
  auth,
  roleGuard('NHAN_VIEN_KHO'),
  dbSelector,
  handleSourceShipment
);

router.post(
  '/:maPhieu/destination-receive',
  auth,
  roleGuard('NHAN_VIEN_KHO'),
  dbSelector,
  handleDestinationReceiving
);

export default router;