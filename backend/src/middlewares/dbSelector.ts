import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { getDbPool } from '../config/postgresql';

export const dbSelector = (req: CustomRequest, res: Response, next: NextFunction): void => {
  const maKho = req.body?.ma_kho || req.query?.ma_kho || req.user?.ma_kho;
  req.dbPool = getDbPool(maKho as string);
  req.maKhoContext = maKho as string;
  next();
};