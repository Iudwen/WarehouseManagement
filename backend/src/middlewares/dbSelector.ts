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

    // Trích xuất mã kho được yêu cầu từ query, body, params, header hoặc URL
    let requestedKho =
      (req.query?.ma_kho as string) ||
      (req.body?.ma_kho as string) ||
      (req.params?.ma_kho as string) ||
      (req.headers['x-warehouse-id'] as string);

    if (!requestedKho && req.originalUrl) {
      const match = req.originalUrl.match(/(?:PN|PX|DC)_([A-Za-z0-9]+)_/i);
      if (match && match[1]) {
        requestedKho = match[1];
      }
    }

    if (centralRoles.includes(vai_tro)) {
      if (requestedKho && requestedKho.trim().toUpperCase() !== 'CENTRAL') {
        req.dbPool = getDbPool(requestedKho);
        req.maKhoContext = requestedKho.trim().toUpperCase();
      } else {
        req.dbPool = getDbPool('CENTRAL');
        req.maKhoContext = 'CENTRAL';
      }

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