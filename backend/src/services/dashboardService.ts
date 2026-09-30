import { getDbPool } from '../config/postgresql';

export const getAggregatedStock = async (ma_kho?: string) => {
  const allNodes = [
    { code: 'HN01', name: 'Kho Hà Nội' },
    { code: 'DN01', name: 'Kho Đà Nẵng' },
    { code: 'HCM01', name: 'Kho TP.HCM' }
  ];

  // Nếu Frontend truyền ma_kho cụ thể thì chỉ quét Node đó, ngược lại quét tất cả
  const normalizedKho = ma_kho?.trim().toUpperCase();
  const targetNodes = normalizedKho
    ? allNodes.filter((node) => node.code === normalizedKho)
    : allNodes;

  if (normalizedKho && targetNodes.length === 0) {
    throw new Error(`Mã kho không hợp lệ: ${ma_kho}`);
  }

  const stockData: any[] = [];

  for (const node of targetNodes) {
    try {
      const pool = getDbPool(node.code);
      const query = `
        SELECT t.ma_kho, k.ten_kho, t.ma_sp, sp.ten_sp, t.so_luong, t.cap_nhat_luc
        FROM ton_kho t
        JOIN san_pham sp ON t.ma_sp = sp.ma_sp
        JOIN kho k ON t.ma_kho = k.ma_kho
        ${normalizedKho ? 'WHERE t.ma_kho = $1' : ''}
      `;
      const res = await pool.query(query, normalizedKho ? [normalizedKho] : []);
      stockData.push(...res.rows);
    } catch (err) {
      console.error(`Không thể kết nối tới Node ${node.code}:`, err);
    }
  }

  return stockData;
};