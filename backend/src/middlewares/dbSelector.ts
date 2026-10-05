import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { getDbPool } from '../config/postgresql';

export const dbSelector = (req: CustomRequest, res: Response, next: NextFunction): void => {
  try {
    let maKho: string | undefined;

    // 1. Nếu request đã đi qua verifyToken và có thông tin req.user
    if (req.user) {
      if (req.user.vai_tro !== 'ADMIN' && req.user.ma_kho) {
        // STAFF và MANAGER luôn bị cưỡng chế kết nối tới CSDL kho được gán
        maKho = req.user.ma_kho;
      } else {
        // ADMIN có quyền chỉ định kho từ Query/Body/Header, fallback mặc định 'HN01'
        maKho = (
          req.query?.ma_kho || 
          req.body?.ma_kho || 
          req.headers['x-warehouse-id'] || 
          'HN01'
        ) as string;
      }
    } else {
      // 2. Với các request public chưa đăng nhập (như API Login)
      maKho = (
        req.query?.ma_kho || 
        req.body?.ma_kho || 
        req.headers['x-warehouse-id'] || 
        'HN01'
      ) as string;
    }

    const normalizedKho = maKho.trim().toUpperCase();

    // Gán Context và mở Pool kết nối tới Node Postgres tương ứng
    req.maKhoContext = normalizedKho;
    req.dbPool = getDbPool(normalizedKho);

    next();
  } catch (error: any) {
    const status = error.message?.startsWith('Mã kho không hợp lệ') ? 400 : 500;
    res.status(status).json({ message: `Lỗi phân phối kết nối CSDL Node: ${error.message}` });
  }
};