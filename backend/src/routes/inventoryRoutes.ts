import { Router } from 'express';
import { handleImport, handleExport } from '../controllers/inventoryController';
import { auth } from '../middlewares/auth';
import { roleGuard } from '../middlewares/roleGuard';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

router.use(auth);
router.use(roleGuard('NHAN_VIEN_KHO'));
router.use(dbSelector);

router.post('/import', handleImport);
router.post('/export', handleExport);

export default router;