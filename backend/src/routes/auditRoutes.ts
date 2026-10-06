import { Router } from 'express';
import { getAuditLogs } from '../controllers/auditController';
import { verifyToken, verifyRole } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Chỉ duy nhất ADMIN tối cao mới có quyền truy cập xem Nhật ký hệ thống
router.use(verifyToken, dbSelector, verifyRole(['ADMIN']));

router.get('/logs', getAuditLogs);
router.get('/', getAuditLogs);

export default router;