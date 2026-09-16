import { getDbPool } from '../config/postgresql';

export const getLowStockAlerts = async () => {
  const nodes = ['HN01', 'DN01', 'HCM01'];
  const alerts: any[] = [];

  for (const node of nodes) {
    try {
      const pool = getDbPool(node);
      const res = await pool.query(`
        SELECT t.ma_kho, k.ten_kho, t.ma_sp, sp.ten_sp, t.so_luong, sp.ton_toi_thieu, sp.ton_an_toan
        FROM ton_kho t
        JOIN san_pham sp ON t.ma_sp = sp.ma_sp
        JOIN kho k ON t.ma_kho = k.ma_kho
        WHERE t.so_luong <= sp.ton_toi_thieu
      `);
      alerts.push(...res.rows);
    } catch (err) {
      console.error(`Không thể quét cảnh báo tại Node ${node}:`, err);
    }
  }

  return alerts;
};