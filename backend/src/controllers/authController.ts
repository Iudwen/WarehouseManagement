import { Request, Response } from 'express';

import { loginUser } from '../services/authService';

export const login = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        message: 'Vui lòng nhập tên đăng nhập và mật khẩu',
      });
      return;
    }

    const result = await loginUser(username, password);

    res.json({
      message: 'Đăng nhập thành công',
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'ACCOUNT_INACTIVE') {
        res.status(403).json({
          message: 'Tài khoản đã bị khóa hoặc không còn hoạt động',
        });
        return;
      }

      if (error.message === 'INVALID_CREDENTIALS') {
        res.status(401).json({
          message: 'Tài khoản hoặc mật khẩu không chính xác',
        });
        return;
      }
    }

    console.error('Login controller error:', error);

    res.status(500).json({
      message: 'Lỗi hệ thống khi đăng nhập',
    });
  }
};