import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { getDbPool } from '../config/postgresql';

export const dbSelector = (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): void => {
  try {
    let maKho: string | undefined;

    if (req.user) {
      // Các vai trò trung tâm luôn làm việc với CENTRAL
      if (
        req.user.vai_tro === 'ADMIN' ||
        req.user.vai_tro === 'DIEU_PHOI' ||
        req.user.vai_tro === 'DATA_ANALYST'
      ) {
        req.maKhoContext = 'CENTRAL';
        req.dbPool = getDbPool('CENTRAL');
        next();
        return;
      }

      // MANAGER / STAFF bị giới hạn bởi kho được gán
      if (req.user.ma_kho) {
        maKho = req.user.ma_kho;
      } else {
        res.status(400).json({
          message: 'Tài khoản chưa được gán mã kho',
        });
        return;
      }
    } else {
      // Request public chưa đăng nhập
      maKho = (
        req.query?.ma_kho ||
        req.body?.ma_kho ||
        req.headers['x-warehouse-id'] ||
        'HN01'
      ) as string;
    }

    const normalizedKho = maKho.trim().toUpperCase();

    req.maKhoContext = normalizedKho;
    req.dbPool = getDbPool(normalizedKho);

    next();
  } catch (error: any) {
    const status = error.message?.startsWith('Mã kho không hợp lệ')
      ? 400
      : 500;

    res.status(status).json({
      message: `Lỗi phân phối kết nối CSDL Node: ${error.message}`,
    });
  }
};