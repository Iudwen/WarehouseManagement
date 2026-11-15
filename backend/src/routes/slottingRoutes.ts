import { Router } from 'express';
import {
  handleGetSlottingOverview,
  handleGetStorageBins,
  handleGetStorageBinDetail,
  handleGetSlottingAdvisor,
  handleMoveStorageBin,
} from '../controllers/slottingController';
import { auth } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';
import { roleGuard } from '../middlewares/roleGuard';

const router = Router();

// Áp dụng middleware xác thực và phân giải context kho
router.use(auth);
router.use(dbSelector);

// 1. Tổng quan KPI vị trí kho
router.get(
  '/overview',
  roleGuard('ADMIN', 'DIEU_PHOI', 'DATA_ANALYST', 'QUAN_LY_KHO', 'NHAN_VIEN_KHO'),
  handleGetSlottingOverview
);

// 2. Danh sách ô kệ kèm bộ lọc
router.get(
  '/bins',
  roleGuard('ADMIN', 'DIEU_PHOI', 'DATA_ANALYST', 'QUAN_LY_KHO', 'NHAN_VIEN_KHO'),
  handleGetStorageBins
);

// 3. Chi tiết một ô kệ
router.get(
  '/bins/:maViTri',
  roleGuard('ADMIN', 'DIEU_PHOI', 'DATA_ANALYST', 'QUAN_LY_KHO', 'NHAN_VIEN_KHO'),
  handleGetStorageBinDetail
);

// 4. Slotting Advisor - Gợi ý tối ưu vị trí
router.get(
  '/advisor',
  roleGuard('ADMIN', 'DIEU_PHOI', 'DATA_ANALYST', 'QUAN_LY_KHO', 'NHAN_VIEN_KHO'),
  handleGetSlottingAdvisor
);

// 5. Di chuyển sản phẩm giữa các ô kệ trong kho
router.post(
  '/move',
  roleGuard('ADMIN', 'DIEU_PHOI', 'QUAN_LY_KHO', 'NHAN_VIEN_KHO'),
  handleMoveStorageBin
);

export default router;
