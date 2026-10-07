import { Pool } from 'pg';

export interface UserRecord {
  ma_nguoi_dung: string;
  ten_dang_nhap: string;
  mat_khau: string;
  ho_ten: string;
  vai_tro: string;
  ma_kho: string | null;
  trang_thai: string;
}

export const findUserByUsername = async (
  pool: Pool,
  username: string
): Promise<UserRecord | null> => {
  const result = await pool.query(
    `
    SELECT
      ma_nguoi_dung,
      ten_dang_nhap,
      mat_khau,
      ho_ten,
      vai_tro,
      ma_kho,
      trang_thai
    FROM nguoi_dung
    WHERE ten_dang_nhap = $1
    LIMIT 1
    `,
    [username]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as UserRecord;
};