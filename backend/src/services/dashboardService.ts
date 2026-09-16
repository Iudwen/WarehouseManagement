import { getDbPool } from '../config/postgresql';

export const getAggregatedStock = async () => {
  const nodes = [
    { code: 'HN01', name: 'Kho Hà Nội' },
    { code: 'DN01', name: 'Kho Đà Nẵng' },
    { code: 'HCM01', name: 'Kho TP.HCM' }
  ];

  const stockData: any[] = [];

  for (const node of nodes) {
    try {
      const pool = getDbPool(node.code);
      const res = await pool.query(`
        SELECT t.ma_kho, k.ten_kho, t.ma_sp, sp.ten_sp, t.so_luong, t.cap_nhat_luc
        FROM ton_kho t
        JOIN san_pham sp ON t.ma_sp = sp.ma_sp
        JOIN kho k ON t.ma_kho = k.ma_kho
      `);
      stockData.push(...res.rows);
    } catch (err) {
      console.error(`Không thể kết nối tới Node ${node.code}:`, err);
    }
  }

  return stockData;
};