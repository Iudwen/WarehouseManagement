import { getDbPool } from '../config/postgresql';

export const getLowStockAlerts = async (ma_kho?: string) => {
  const allNodes = ['HN01', 'DN01', 'HCM01'];
  const normalizedKho = ma_kho?.trim().toUpperCase();
  const targetNodes = normalizedKho
    ? allNodes.filter((node) => node === normalizedKho)
    : allNodes;

  if (normalizedKho && targetNodes.length === 0) {
    throw new Error(`Mã kho không hợp lệ: ${ma_kho}`);
  }

  const alerts: any[] = [];

  for (const node of targetNodes) {
    try {
      const pool = getDbPool(node);
      const query = `
        SELECT t.ma_kho, k.ten_kho, t.ma_sp, sp.ten_sp, t.so_luong, sp.ton_toi_thieu, sp.ton_an_toan
        FROM ton_kho t
        JOIN san_pham sp ON t.ma_sp = sp.ma_sp
        JOIN kho k ON t.ma_kho = k.ma_kho
        WHERE t.so_luong <= sp.ton_toi_thieu
        ${normalizedKho ? 'AND t.ma_kho = $1' : ''}
      `;
      const res = await pool.query(query, normalizedKho ? [normalizedKho] : []);
      alerts.push(...res.rows);
    } catch (err) {
      console.error(`Không thể quét cảnh báo tại Node ${node}:`, err);
    }
  }

  return alerts;
};