import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { getDbPool } from '../config/postgresql';
import {
  findUserByUsername,
  UserRecord,
} from '../repositories/userRepository';
import { UserRole } from '../types';

const JWT_SECRET =
  process.env.JWT_SECRET || 'warehouse_super_secret_key_2026';

export interface LoginResult {
  token: string;
  user: {
    ma_nguoi_dung: string;
    ho_ten: string;
    vai_tro: UserRole;
    ma_kho: string | null;
  };
}

export const loginUser = async (
  username: string,
  password: string
): Promise<LoginResult> => {
  const pool = getDbPool('CENTRAL');

  const user: UserRecord | null =
    await findUserByUsername(pool, username);

  if (!user) {
    throw new Error('INVALID_CREDENTIALS');
  }

  if (user.trang_thai !== 'ACTIVE') {
    throw new Error('ACCOUNT_INACTIVE');
  }

  let passwordValid = false;

  // Hỗ trợ cả mật khẩu đã hash bcrypt ($2a$, $2b$) lẫn chuỗi thường (plaintext trong seed SQL)
  if (user.mat_khau && (user.mat_khau.startsWith('$2a$') || user.mat_khau.startsWith('$2b$'))) {
    passwordValid = await bcrypt.compare(password, user.mat_khau);
    // Hỗ trợ demo thuận tiện: nếu là admin và nhập admin123 hoặc 123456
    if (!passwordValid && user.ten_dang_nhap === 'admin') {
      passwordValid = (password === 'admin123' || password === '123456');
    }
  } else {
    // So sánh trực tiếp chuỗi thường (hỗ trợ cả admin123 và 123456 cho tài khoản admin)
    passwordValid = (password === user.mat_khau) || (user.ten_dang_nhap === 'admin' && (password === 'admin123' || password === '123456'));
  }

  if (!passwordValid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const payload = {
    ma_nguoi_dung: String(user.ma_nguoi_dung),
    ho_ten: user.ho_ten,
    vai_tro: user.vai_tro as UserRole,
    ma_kho: user.ma_kho,
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: '1d',
  });

  return {
    token,
    user: payload,
  };
};