import { getPostgresPool } from '../config/database';

export interface ProductPriceResult {
  gia_nhap: number;
  gia_ban: number;
}

/**
 * Lấy đơn giá niêm yết chuẩn từ CSDL của Node Postgres tương ứng
 */
export const getProductPrice = async (
  maKho: string, 
  maSp: string, 
  isImport: boolean = true
): Promise<number> => {
  const pool = getPostgresPool(maKho);
  const query = `
    SELECT gia_nhap, gia_ban 
    FROM san_pham 
    WHERE ma_sp = $1 AND trang_thai = 'ACTIVE';
  `;
  
  const result = await pool.query(query, [maSp]);
  
  if (result.rows.length === 0) {
    throw new Error(`Sản phẩm ${maSp} không tồn tại hoặc đã bị khóa trên Node ${maKho}`);
  }

  const row = result.rows[0];
  return isImport ? parseFloat(row.gia_nhap) : parseFloat(row.gia_ban);
};