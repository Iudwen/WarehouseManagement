import { Router } from 'express';
import { getAuditLogs } from '../controllers/auditController';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Bọc dbSelector để đọc log theo kho nếu có query ma_kho
router.use(dbSelector);

router.get('/logs', getAuditLogs);
router.get('/', getAuditLogs);

export default router;