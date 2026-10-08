import { Router } from 'express';

import { getAuditLogs } from '../controllers/auditController';

import { auth } from '../middlewares/auth';
import { roleGuard } from '../middlewares/roleGuard';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

router.use(auth);

router.use(
  roleGuard(
    'ADMIN',
    'DIEU_PHOI',
    'DATA_ANALYST',
    'QUAN_LY_KHO'
  )
);

router.use(dbSelector);

router.get('/logs', getAuditLogs);
router.get('/', getAuditLogs);

export default router;