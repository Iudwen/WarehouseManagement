import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { getDbPool } from '../config/postgresql';

export const dbSelector = (req: CustomRequest, res: Response, next: NextFunction): void => {
  try {
    // Ưu tiên lấy mã kho từ Query (GET), Body (POST), Header, hoặc User (khi có Auth)
    const maKho = (
      req.query?.ma_kho || 
      req.body?.ma_kho || 
      req.headers['x-warehouse-id'] || 
      req.user?.ma_kho
    ) as string | undefined;

    // Gán DB Pool tương ứng
    req.dbPool = getDbPool(maKho);
    
    // Nếu maKho có giá trị thì chuẩn hóa chữ hoa, nếu không gán mặc định 'HN01'
    req.maKhoContext = maKho ? maKho.trim().toUpperCase() : 'HN01';

    next();
  } catch (error: any) {
    res.status(500).json({ message: `Lỗi phân phối kết nối CSDL Node: ${error.message}` });
  }
};