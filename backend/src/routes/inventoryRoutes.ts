import { Router } from 'express';
import { handleImport, handleExport } from '../controllers/inventoryController';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Tạm thời chưa bọc verifyToken để bạn test Postman dễ dàng trước
router.post('/import', dbSelector, handleImport);
router.post('/export', dbSelector, handleExport);

export default router;