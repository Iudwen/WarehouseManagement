import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'warehouse_super_secret_key_2026';

export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  // Giả lập check DB User (Có thể nâng cấp query bảng nhan_vien trong Postgres)
  if (username === 'admin' && password === '123456') {
    const token = jwt.sign(
      { id: 'NV001', username: 'admin', role: 'ADMIN', defaultWarehouse: 'ALL' },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: { id: 'NV001', username: 'admin', role: 'ADMIN', defaultWarehouse: 'ALL' }
    });
    return;
  }

  if (username === 'khor_hn' && password === '123456') {
    const token = jwt.sign(
      { id: 'NV002', username: 'khor_hn', role: 'STAFF', defaultWarehouse: 'HN01' },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: { id: 'NV002', username: 'khor_hn', role: 'STAFF', defaultWarehouse: 'HN01' }
    });
    return;
  }

  res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không chính xác' });
};