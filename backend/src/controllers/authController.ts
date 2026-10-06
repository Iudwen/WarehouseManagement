import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDbPool } from '../config/postgresql';

const JWT_SECRET =
  process.env.JWT_SECRET || 'warehouse_super_secret_key_2026';

const CENTRAL_ROLES = ['ADMIN', 'DATA_ANALYST', 'DIEU_PHOI'];
const WAREHOUSE_ROLES = ['MANAGER', 'STAFF'];

export const login = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { username, email, password, ma_kho } = req.body;
  const loginIdentifier = email || username;

  if (!loginIdentifier || !password) {
    res.status(400).json({
      message: 'Vui lòng nhập Email/Mã người dùng và Mật khẩu',
    });
    return;
  }

  try {
    let user: any = null;

    // Tài khoản trung tâm: ADMIN / DATA_ANALYST / DIEU_PHOI
    if (!ma_kho) {
      const centralPool = getDbPool('CENTRAL');

      const result = await centralPool.query(
        `
          SELECT
            ma_nguoi_dung,
            ma_kho,
            ho_ten,
            email,
            mat_khau,
            vai_tro,
            trang_thai
          FROM nguoi_dung
          WHERE email = $1 OR ma_nguoi_dung = $1
        `,
        [loginIdentifier],
      );

      if (result.rows.length === 0) {
        res.status(401).json({
          message: 'Tài khoản không tồn tại trên hệ thống',
        });
        return;
      }

      user = result.rows[0];

      if (!CENTRAL_ROLES.includes(user.vai_tro)) {
        res.status(400).json({
          message:
            'Tài khoản MANAGER/STAFF phải cung cấp mã kho để đăng nhập',
        });
        return;
      }
    } else {
      // Tài khoản kho: MANAGER / STAFF
      const requestedKho = String(ma_kho).trim().toUpperCase();
      const warehousePool = getDbPool(requestedKho);

      const result = await warehousePool.query(
        `
          SELECT
            ma_nguoi_dung,
            ma_kho,
            ho_ten,
            email,
            mat_khau,
            vai_tro,
            trang_thai
          FROM nguoi_dung
          WHERE email = $1 OR ma_nguoi_dung = $1
        `,
        [loginIdentifier],
      );

      if (result.rows.length === 0) {
        res.status(401).json({
          message: 'Tài khoản không tồn tại trên hệ thống',
        });
        return;
      }

      user = result.rows[0];

      if (!WAREHOUSE_ROLES.includes(user.vai_tro)) {
        res.status(403).json({
          message: 'Tài khoản này không thuộc nhóm vai trò của kho',
        });
        return;
      }

      if (
        !user.ma_kho ||
        user.ma_kho.toUpperCase() !== requestedKho
      ) {
        res.status(403).json({
          message: 'Tài khoản không thuộc node kho đăng nhập',
        });
        return;
      }
    }

    // Kiểm tra trạng thái tài khoản
    if (user.trang_thai !== 'ACTIVE') {
      res.status(403).json({
        message: 'Tài khoản của bạn không ở trạng thái hoạt động',
      });
      return;
    }

    // Kiểm tra mật khẩu
    let isMatch = false;

    if (
      user.mat_khau.startsWith('$2b$') ||
      user.mat_khau.startsWith('$2a$')
    ) {
      isMatch = await bcrypt.compare(
        password,
        user.mat_khau,
      );
    } else {
      // Giữ hỗ trợ plaintext cho môi trường dev hiện tại
      isMatch = user.mat_khau === password;
    }

    if (!isMatch) {
      res.status(401).json({
        message: 'Mật khẩu không chính xác',
      });
      return;
    }

    // JWT dùng cho authorization
    const tokenPayload = {
      ma_nguoi_dung: user.ma_nguoi_dung,
      email: user.email,
      ho_ten: user.ho_ten,
      vai_tro: user.vai_tro,
      ma_kho: user.ma_kho,
    };

    const token = jwt.sign(
      tokenPayload,
      JWT_SECRET,
      { expiresIn: '1d' },
    );

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: tokenPayload,
    });
  } catch (error: any) {
    console.error('Lỗi đăng nhập:', error);

    res.status(500).json({
      message:
        error.message || 'Lỗi máy chủ khi đăng nhập',
    });
  }
};