/**
 * Helper sinh mã phiếu giao dịch chuẩn quy chuẩn WMS
 * Quy tắc: [PREFIX]_[MA_KHO]_[YYYYMMDD]_[4_KÝ_TỰ_RANDOM]
 * Ví dụ: PN_HN01_20260917_A8F2
 */
export const generateTransactionCode = (prefix: 'PN' | 'PX' | 'DC', maKho: string): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}_${maKho}_${dateStr}_${randomSuffix}`;
};