import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDbPool } from '../config/postgresql';

const JWT_SECRET = process.env.JWT_SECRET || 'warehouse_super_secret_key_2026';

export const login = async (req: Request, res: Response): Promise<void> => {
  const { username, email, password, ma_kho } = req.body;
  const loginIdentifier = email || username;

  if (!loginIdentifier || !password) {
    res.status(400).json({ message: 'Vui lòng nhập Email/Mã người dùng và Mật khẩu' });
    return;
  }

  try {
    // Kết nối CSDL để kiểm tra tài khoản (Query qua node HN01 hoặc kho chỉ định)
    const requestedKho = String(ma_kho || 'HN01').trim().toUpperCase();
    const pool = getDbPool(requestedKho);

    const query = `
      SELECT ma_nguoi_dung, ma_kho, ho_ten, email, mat_khau, vai_tro, trang_thai 
      FROM nguoi_dung 
      WHERE email = $1 OR ma_nguoi_dung = $1
    `;
    const result = await pool.query(query, [loginIdentifier]);

    if (result.rows.length === 0) {
      res.status(401).json({ message: 'Tài khoản không tồn tại trên hệ thống' });
      return;
    }

    const user = result.rows[0];

    if (user.trang_thai !== 'ACTIVE') {
      res.status(403).json({ message: 'Tài khoản của bạn không ở trạng thái hoạt động' });
      return;
    }

    if (
      user.vai_tro !== 'ADMIN' &&
      (!user.ma_kho || user.ma_kho.toUpperCase() !== requestedKho)
    ) {
      res.status(403).json({ message: 'Tài khoản không thuộc node kho đăng nhập' });
      return;
    }

    // So sánh mật khẩu (Tự động nhận biết chuỗi Hash Bcrypt hoặc chuỗi thường khi dev)
    let isMatch = false;
    if (user.mat_khau.startsWith('$2b$') || user.mat_khau.startsWith('$2a$')) {
      isMatch = await bcrypt.compare(password, user.mat_khau);
    } else {
      isMatch = user.mat_khau === password;
    }

    if (!isMatch) {
      res.status(401).json({ message: 'Mật khẩu không chính xác' });
      return;
    }

    // Tạo JWT Token chứa Payload phân quyền đồng bộ với Auth Middleware
    const tokenPayload = {
      ma_nguoi_dung: user.ma_nguoi_dung,
      email: user.email,
      ho_ten: user.ho_ten,
      vai_tro: user.vai_tro,
      ma_kho: user.ma_kho,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1d' });

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: tokenPayload,
    });
  } catch (error: any) {
    console.error('Lỗi đăng nhập:', error);
    res.status(500).json({ message: error.message || 'Lỗi máy chủ khi đăng nhập' });
  }
};