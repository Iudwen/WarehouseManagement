import { Router } from 'express';
import { getMasterData } from '../controllers/masterDataController';

const router = Router();
router.get('/', getMasterData);

export default router;