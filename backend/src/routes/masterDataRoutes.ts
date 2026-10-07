import { Router } from 'express';

import { getMasterData } from '../controllers/masterDataController';

import { auth } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

router.use(auth);
router.use(dbSelector);

router.get('/', getMasterData);

export default router;