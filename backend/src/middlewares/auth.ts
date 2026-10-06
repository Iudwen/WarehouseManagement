import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CustomRequest, UserPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'warehouse_super_secret_key_2026';

/**
 * 1. Middleware xác thực JWT Token
 */
export const verifyToken = (req: CustomRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Yêu cầu token xác thực (Bearer Token)' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

/**
 * 2. Middleware kiểm soát kho
 */
export const branchGuard = (req: CustomRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ message: 'Chưa xác thực nguồn truy cập' });
    return;
  }

  if (req.user.vai_tro === 'ADMIN') {
    next();
    return;
  }

  const requestedKho = (
    req.query?.ma_kho ||
    req.body?.ma_kho ||
    req.body?.kho_xuat
  ) as string | undefined;

  if (
    requestedKho &&
    req.user.ma_kho &&
    requestedKho.toUpperCase() !== req.user.ma_kho.toUpperCase()
  ) {
    res.status(403).json({
      message: `Tài khoản thuộc kho ${req.user.ma_kho}, không có quyền thao tác trên kho ${requestedKho}`,
    });
    return;
  }

  next();
};

/**
 * 3. Middleware phân quyền vai trò
 */
export const verifyRole = (allowedRoles: string[]) => {
  return (req: CustomRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Chưa xác thực người thực hiện thao tác' });
      return;
    }

    if (!allowedRoles.includes(req.user.vai_tro)) {
      res.status(403).json({
        message: `Vai trò ${req.user.vai_tro} không có quyền thực hiện thao tác này`,
      });
      return;
    }

    next();
  };
};
