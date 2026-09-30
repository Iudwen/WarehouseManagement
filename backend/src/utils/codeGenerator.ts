import { PoolClient } from 'pg';

/**
 * Helper sinh mã phiếu giao dịch tự tăng theo ngày chuẩn WMS
 * Quy tắc: [PREFIX]_[MA_KHO]_[YYMMDD]_[4_SỐ_TỰ_TĂNG]
 * Ví dụ: PN_HN01_260918_0001 (Đúng 19 ký tự, an toàn cho VARCHAR(20))
 */
export const generateTransactionCode = async (
  client: PoolClient,
  prefix: 'PN' | 'PX' | 'DC',
  maKho: string
): Promise<string> => {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  
  const tableName = prefix === 'PN' ? 'phieu_nhap' : prefix === 'PX' ? 'phieu_xuat' : 'phieu_dieu_chuyen';
  const dateField = prefix === 'PN' ? 'ngay_nhap' : prefix === 'PX' ? 'ngay_xuat' : 'ngay_dieu_chuyen';

  const query = `
    SELECT COUNT(*) AS total 
    FROM ${tableName} 
    WHERE ma_kho = $1 AND ${dateField}::date = CURRENT_DATE
  `;
  
  const res = await client.query(query, [maKho]);
  const count = parseInt(res.rows[0].total, 10) + 1;
  const sequenceStr = count.toString().padStart(4, '0');

  return `${prefix}_${maKho}_${dateStr}_${sequenceStr}`;
};