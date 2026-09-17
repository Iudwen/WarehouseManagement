import { Router } from 'express';
import { getMasterData } from '../controllers/masterDataController';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

router.use(dbSelector);
router.get('/', getMasterData);

export default router;