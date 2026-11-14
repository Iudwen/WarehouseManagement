/**
 * monitoringRoutes.ts
 * Tuyến đường API Giám sát Hệ thống Phân tán
 * Bảo vệ bởi middleware auth và roleGuard('ADMIN')
 */

import { Router } from 'express';
import {
  getHealthController,
  getNodesController,
  getMetricsController,
  checkTargetDatabaseController,
} from '../controllers/monitoringController';
import { auth } from '../middlewares/auth';
import { roleGuard } from '../middlewares/roleGuard';

const router = Router();

// Yêu cầu xác thực token và chỉ người dùng quyền ADMIN mới được phép truy cập
router.use(auth);
router.use(roleGuard('ADMIN'));

// 1. Tổng quan trạng thái sức khỏe hệ thống
router.get('/health', getHealthController);

// 2. Trạng thái chi tiết từng Node phân tán (HN, DN, HCM, Central)
router.get('/nodes', getNodesController);

// 3. Chỉ số đo lường độ trễ và dung lượng Outbox backlog
router.get('/metrics', getMetricsController);

// 4. Kiểm tra sức khỏe database/target cụ thể (Task 5.8 Fault & Recovery Test)
router.post('/check-target', checkTargetDatabaseController);

export default router;

