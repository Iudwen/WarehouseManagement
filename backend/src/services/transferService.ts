import { getDbPool } from '../config/postgresql';
import { logTransferEvent } from './eventLogger';

export interface TransferPayload {
  ma_phieu_dc: string;
  kho_xuat: string;
  kho_nhap: string;
  items: Array<{ ma_sp: string; so_luong: number }>;
}

export const processTransfer = async (payload: TransferPayload) => {
  const { ma_phieu_dc, kho_xuat, kho_nhap, items } = payload;
  
  const poolExport = getDbPool(kho_xuat);
  const poolImport = getDbPool(kho_nhap);

  const clientExport = await poolExport.connect();
  const clientImport = await poolImport.connect();

  try {
    // Phase 1: Mở Transaction TRÊN CẢ 2 NODE cùng lúc
    await clientExport.query('BEGIN');
    await clientImport.query('BEGIN');

    // 1. Kiểm tra & Trừ kho tại Node Xuất (Lock dòng với FOR UPDATE)
    for (const item of items) {
      const res = await clientExport.query(
        `SELECT so_luong FROM ton_kho WHERE ma_kho = $1 AND ma_sp = $2 FOR UPDATE`,
        [kho_xuat, item.ma_sp]
      );
      const currentStock = res.rows[0]?.so_luong || 0;
      if (currentStock < item.so_luong) {
        throw new Error(`Kho xuất ${kho_xuat} không đủ hàng ${item.ma_sp} (Hiện có: ${currentStock})`);
      }

      await clientExport.query(
        `UPDATE ton_kho SET so_luong = so_luong - $1, cap_nhat_luc = NOW() 
         WHERE ma_kho = $2 AND ma_sp = $3`,
        [item.so_luong, kho_xuat, item.ma_sp]
      );

      await clientExport.query(
        `INSERT INTO lich_su_ton_kho (ma_kho, ma_sp, ngay, dieu_chuyen_ra) 
         VALUES ($1, $2, CURRENT_DATE, $3)
         ON CONFLICT (ma_kho, ma_sp, ngay) 
         DO UPDATE SET dieu_chuyen_ra = lich_su_ton_kho.dieu_chuyen_ra + EXCLUDED.dieu_chuyen_ra`,
        [kho_xuat, item.ma_sp, item.so_luong]
      );
    }

    await clientExport.query(
      `INSERT INTO phieu_dieu_chuyen (ma_phieu_dc, kho_xuat, kho_nhap, ngay_dieu_chuyen, trang_thai)
       VALUES ($1, $2, $3, NOW(), 'COMPLETED')`,
      [ma_phieu_dc, kho_xuat, kho_nhap]
    );

    for (const item of items) {
      await clientExport.query(
        `INSERT INTO ct_dieu_chuyen (ma_phieu_dc, ma_sp, so_luong) VALUES ($1, $2, $3)`,
        [ma_phieu_dc, item.ma_sp, item.so_luong]
      );
    }

    // 2. Cộng kho tại Node Nhập
    for (const item of items) {
      await clientImport.query(
        `INSERT INTO ton_kho (ma_kho, ma_sp, so_luong, cap_nhat_luc)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (ma_kho, ma_sp) 
         DO UPDATE SET so_luong = ton_kho.so_luong + EXCLUDED.so_luong, cap_nhat_luc = NOW()`,
        [kho_nhap, item.ma_sp, item.so_luong]
      );

      await clientImport.query(
        `INSERT INTO lich_su_ton_kho (ma_kho, ma_sp, ngay, dieu_chuyen_vao) 
         VALUES ($1, $2, CURRENT_DATE, $3)
         ON CONFLICT (ma_kho, ma_sp, ngay) 
         DO UPDATE SET dieu_chuyen_vao = lich_su_ton_kho.dieu_chuyen_vao + EXCLUDED.dieu_chuyen_vao`,
        [kho_nhap, item.ma_sp, item.so_luong]
      );
    }

    // Phase 2: Cả 2 Node OK mới tiến hành COMMIT
    await clientExport.query('COMMIT');
    await clientImport.query('COMMIT');

    // 3. Đẩy Event log sang Mongo
    logTransferEvent({ ma_phieu_dc, kho_xuat, kho_nhap, items });

    return { success: true, ma_phieu_dc };
  } catch (error) {
    // Nếu có bất kỳ lỗi nào, ROLLBACK CẢ 2 NODE an toàn 100%
    await clientExport.query('ROLLBACK');
    await clientImport.query('ROLLBACK');
    throw error;
  } finally {
    clientExport.release();
    clientImport.release();
  }
};