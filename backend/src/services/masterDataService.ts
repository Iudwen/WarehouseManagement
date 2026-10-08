import { Pool } from 'pg';

import { getMasterData } from '../repositories/masterDataRepository';

export const getMasterDataByNode = async (pool: Pool) => {
  return getMasterData(pool);
};