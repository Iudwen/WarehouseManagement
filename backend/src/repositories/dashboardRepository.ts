import { Pool } from 'pg';

export const getStockByNode = async (pool: Pool) => {
  const result = await pool.query(`
    SELECT
      t.ma_kho,
      k.ten_kho,
      t.ma_sp,
      sp.ten_sp,
      t.so_luong,
      t.cap_nhat_luc
    FROM ton_kho t
    JOIN san_pham sp
      ON t.ma_sp = sp.ma_sp
    JOIN kho k
      ON t.ma_kho = k.ma_kho
  `);

  return result.rows;
};