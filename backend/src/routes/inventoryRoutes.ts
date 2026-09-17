import { Router } from 'express';
import { handleImport, handleExport } from '../controllers/inventoryController';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Bọc chung ở đầu router thay vì viết lặp lại ở từng route
router.use(dbSelector);

router.post('/import', handleImport);
router.post('/export', handleExport);

export default router;