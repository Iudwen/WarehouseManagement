import { Router } from 'express';
import {
  handleApproveTransfer,
  handleDestinationReceiving,
  handleSourceConfirmation,
  handleSourceShipment,
  handleTransfer,
} from '../controllers/transferController';
import { verifyToken, verifyRole } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// ĐIỀU PHỐI: tạo yêu cầu điều chuyển
router.post(
  '/',
  verifyToken,
  dbSelector,
  verifyRole(['DIEU_PHOI']),
  handleTransfer
);

// QUẢN LÝ KHO NGUỒN: duyệt yêu cầu
router.post(
  '/:maPhieu/approve',
  verifyToken,
  dbSelector,
  verifyRole(['MANAGER']),
  handleApproveTransfer
);

// QUẢN LÝ KHO NGUỒN: xác nhận nguồn
router.post(
  '/:maPhieu/source-confirm',
  verifyToken,
  dbSelector,
  verifyRole(['MANAGER']),
  handleSourceConfirmation
);

// NHÂN VIÊN KHO NGUỒN: xuất hàng
router.post(
  '/:maPhieu/source-ship',
  verifyToken,
  dbSelector,
  verifyRole(['STAFF']),
  handleSourceShipment
);

// NHÂN VIÊN KHO ĐÍCH: nhận hàng
router.post(
  '/:maPhieu/destination-receive',
  verifyToken,
  dbSelector,
  verifyRole(['STAFF']),
  handleDestinationReceiving
);

export default router;