import { getDbPool } from '../config/postgresql';
import { logTransferEvent } from './eventLogger';

export interface TransferPayload {
  ma_phieu_dc: string;
  kho_xuat: string;
  kho_nhap: string;
  items: Array<{ ma_sp: string; so_luong: number }>;
}

export const processTransfer = async (payload: TransferPayload, userKho?: string, userRole?: string) => {
  const { ma_phieu_dc, kho_xuat, kho_nhap, items } = payload;

  // 1. Validation Logic
  if (!items || items.length === 0) {
    throw new Error('Danh sách hàng hóa điều chuyển không được để rỗng');
  }

  if (kho_xuat.toUpperCase() === kho_nhap.toUpperCase()) {
    throw new Error('Kho xuất và Kho nhập không được trùng nhau');
  }

  // Vá lỗ hổng Security: Kiểm tra quyền sở hữu kho xuất tại Service
  if (userRole !== 'ADMIN' && userKho && userKho.toUpperCase() !== kho_xuat.toUpperCase()) {
    throw new Error(`Tài khoản thuộc kho ${userKho}, không có quyền xuất hàng từ kho ${kho_xuat}`);
  }

  const poolExport = getDbPool(kho_xuat);
  const poolImport = getDbPool(kho_nhap);

  const clientExport = await poolExport.connect();
  const clientImport = await poolImport.connect();

  let isExportCommitted = false;

  try {
    // Phase 1: Mở Transaction trên cả 2 Node
    await clientExport.query('BEGIN');
    await clientImport.query('BEGIN');

    // Trừ kho tại Node Xuất (Lock dòng bằng FOR UPDATE)
    for (const item of items) {
      const res = await clientExport.query(
        `SELECT so_luong FROM ton_kho WHERE ma_kho = $1 AND ma_sp = $2 FOR UPDATE`,
        [kho_xuat, item.ma_sp]
      );
      
      const currentStock = res.rows[0]?.so_luong || 0;
      if (currentStock < item.so_luong) {
        throw new Error(`Kho xuất ${kho_xuat} không đủ sản phẩm ${item.ma_sp} (Tồn hiện tại: ${currentStock})`);
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

    // Ghi nhận chứng từ phiếu điều chuyển tại Node Xuất
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

    // Cộng kho tại Node Nhập
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

    // Phase 2: An toàn 2PC - COMMIT Node Nhập trước, Node Xuất sau
    await clientImport.query('COMMIT');
    
    try {
      await clientExport.query('COMMIT');
      isExportCommitted = true;
    } catch (exportCommitErr) {
      // Trường hợp hiếm: Node Nhập đã Commit nhưng Node Xuất sập mạng lúc Commit
      console.error('CRITICAL: Node Nhập đã Commit nhưng Node Xuất thất bại!', exportCommitErr);
      throw new Error('Lỗi đồng bộ nghiêm trọng giữa các chi nhánh. Cần kiểm tra log thủ công.');
    }

    // Ghi Log lịch sử ra MongoDB
    logTransferEvent({ ma_phieu_dc, kho_xuat, kho_nhap, items });

    return { success: true, ma_phieu_dc };

  } catch (error) {
    // Chỉ ROLLBACK Node Xuất nếu nó chưa COMMIT thành công
    if (!isExportCommitted) {
      await clientExport.query('ROLLBACK').catch(() => {});
    }
    await clientImport.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    clientExport.release();
    clientImport.release();
  }
};