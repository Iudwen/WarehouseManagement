import { Router } from 'express';
import { handleTransfer } from '../controllers/transferController';

const router = Router();

router.post('/transfer', handleTransfer);

export default router;