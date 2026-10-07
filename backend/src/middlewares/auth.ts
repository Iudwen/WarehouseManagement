import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CustomRequest, UserRole } from '../types';

const JWT_SECRET =
  process.env.JWT_SECRET || 'warehouse_super_secret_key_2026';

interface JwtPayload {
  ma_nguoi_dung: string;
  ho_ten: string;
  vai_tro: UserRole;
  ma_kho: string | null;
}

export const auth = (
  req: CustomRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Chưa đăng nhập' });
      return;
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    req.user = {
      ma_nguoi_dung: decoded.ma_nguoi_dung,
      ho_ten: decoded.ho_ten,
      vai_tro: decoded.vai_tro,
      ma_kho: decoded.ma_kho,
    };

    next();
  } catch {
    res.status(401).json({
      message: 'Token không hợp lệ hoặc đã hết hạn',
    });
  }
};