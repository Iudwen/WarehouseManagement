import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { getDbPool } from '../config/postgresql';

export const dbSelector = (
  req: CustomRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.user) {
      res.status(401).json({
        message: 'Chưa đăng nhập',
      });
      return;
    }

    const { vai_tro, ma_kho } = req.user;

    const centralRoles = [
      'ADMIN',
      'DIEU_PHOI',
      'DATA_ANALYST',
    ];

    if (centralRoles.includes(vai_tro)) {
      req.dbPool = getDbPool('CENTRAL');
      req.maKhoContext = 'CENTRAL';

      next();
      return;
    }

    if (!ma_kho) {
      res.status(403).json({
        message: 'Tài khoản chưa được gán kho',
      });
      return;
    }

    req.dbPool = getDbPool(ma_kho);
    req.maKhoContext = ma_kho.toUpperCase();

    next();
  } catch (error: any) {
    console.error('DB Selector Error:', error);

    res.status(500).json({
      message: 'Lỗi phân phối kết nối CSDL',
    });
  }
};