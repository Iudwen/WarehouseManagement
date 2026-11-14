/**
 * backupRoutes.ts
 * Tuyến đường API Sao lưu & Phục hồi dữ liệu (Phase 5 - Task 5.7)
 * Bảo vệ bởi middleware auth và roleGuard('ADMIN')
 */

import { Router } from 'express';
import {
  getBackupHistoryController,
  runFullBackupController,
  backupPostgresController,
  backupMongoController,
  restorePostgresController,
  restoreMongoController,
} from '../controllers/backupController';
import { auth } from '../middlewares/auth';
import { roleGuard } from '../middlewares/roleGuard';

const router = Router();

// Yêu cầu xác thực token và chỉ người dùng quyền ADMIN mới được phép truy cập
router.use(auth);
router.use(roleGuard('ADMIN'));

// 1. Lịch sử sao lưu & Thống kê tổng quan
router.get('/history', getBackupHistoryController);

// 2. Kích hoạt sao lưu toàn diện 5 DB
router.post('/all', runFullBackupController);

// 3. Sao lưu PostgreSQL theo Node (HN, DN, HCM, Central)
router.post('/postgres', backupPostgresController);

// 4. Sao lưu MongoDB Event Store
router.post('/mongodb', backupMongoController);

// 5. Khôi phục cơ sở dữ liệu PostgreSQL
router.post('/restore/postgres', restorePostgresController);

// 6. Khôi phục cơ sở dữ liệu MongoDB
router.post('/restore/mongodb', restoreMongoController);

export default router;
