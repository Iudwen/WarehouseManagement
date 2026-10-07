import { Response, NextFunction } from 'express';
import { CustomRequest, UserRole } from '../types';

export const roleGuard = (...allowedRoles: UserRole[]) => {
  return (
    req: CustomRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Chưa đăng nhập' });
      return;
    }

    if (!allowedRoles.includes(req.user.vai_tro)) {
      res.status(403).json({
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
      return;
    }

    next();
  };
};