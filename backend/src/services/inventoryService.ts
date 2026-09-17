import { Pool } from 'pg';
import { ImportPayload, ExportPayload } from '../types';
import { logInventoryEvent } from './eventLogger';

export const processImport = async (pool: Pool, payload: ImportPayload) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { ma_phieu_nhap, ma_kho, ma_ncc, items } = payload;

    // 1. Thêm Phiếu Nhập
    await client.query(
      `INSERT INTO phieu_nhap (ma_phieu_nhap, ma_kho, ma_ncc, ngay_nhap, trang_thai) 
       VALUES ($1, $2, $3, NOW(), 'COMPLETED')`,
      [ma_phieu_nhap, ma_kho, ma_ncc]
    );

    // 2. Chi tiết & Cập nhật Tồn Kho (UPSERT)
    for (const item of items) {
      await client.query(
        `INSERT INTO ct_phieu_nhap (ma_phieu_nhap, ma_sp, so_luong, don_gia) 
         VALUES ($1, $2, $3, $4)`,
        [ma_phieu_nhap, item.ma_sp, item.so_luong, item.don_gia]
      );

      await client.query(
        `INSERT INTO ton_kho (ma_kho, ma_sp, so_luong, cap_nhat_luc)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (ma_kho, ma_sp) 
         DO UPDATE SET so_luong = ton_kho.so_luong + EXCLUDED.so_luong, cap_nhat_luc = NOW()`,
        [ma_kho, item.ma_sp, item.so_luong]
      );

      // UPSERT Lịch sử Tồn kho (Cộng dồn số lượng nhập trong ngày)
      await client.query(
        `INSERT INTO lich_su_ton_kho (ma_kho, ma_sp, ngay, nhap) 
         VALUES ($1, $2, CURRENT_DATE, $3)
         ON CONFLICT (ma_kho, ma_sp, ngay) 
         DO UPDATE SET nhap = lich_su_ton_kho.nhap + EXCLUDED.nhap`,
        [ma_kho, item.ma_sp, item.so_luong]
      );
    }

    await client.query('COMMIT');

    // 3. Đẩy Event sang MongoDB
    logInventoryEvent({ type: 'IMPORT', ma_kho, ma_phieu: ma_phieu_nhap, items });

    return { success: true, ma_phieu_nhap };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const processExport = async (pool: Pool, payload: ExportPayload) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { ma_phieu_xuat, ma_kho, ma_kh, items } = payload;

    // 1. Kiểm tra số lượng tồn kho thực tế (Lock dòng với FOR UPDATE)
    for (const item of items) {
      const res = await client.query(
        `SELECT so_luong FROM ton_kho WHERE ma_kho = $1 AND ma_sp = $2 FOR UPDATE`,
        [ma_kho, item.ma_sp]
      );
      const currentStock = res.rows[0]?.so_luong || 0;
      if (currentStock < item.so_luong) {
        throw new Error(`Sản phẩm ${item.ma_sp} không đủ tồn kho (Hiện có: ${currentStock}, Cần xuất: ${item.so_luong})`);
      }
    }

    // 2. Thêm Phiếu Xuất
    await client.query(
      `INSERT INTO phieu_xuat (ma_phieu_xuat, ma_kho, ma_kh, ngay_xuat, trang_thai) 
       VALUES ($1, $2, $3, NOW(), 'COMPLETED')`,
      [ma_phieu_xuat, ma_kho, ma_kh]
    );

    // 3. Trừ tồn kho & Ghi lịch sử
    for (const item of items) {
      await client.query(
        `INSERT INTO ct_phieu_xuat (ma_phieu_xuat, ma_sp, so_luong, don_gia) 
         VALUES ($1, $2, $3, $4)`,
        [ma_phieu_xuat, item.ma_sp, item.so_luong, item.don_gia]
      );

      await client.query(
        `UPDATE ton_kho SET so_luong = so_luong - $1, cap_nhat_luc = NOW() 
         WHERE ma_kho = $2 AND ma_sp = $3`,
        [item.so_luong, ma_kho, item.ma_sp]
      );

      // UPSERT Lịch sử Tồn kho (Cộng dồn số lượng xuất trong ngày)
      await client.query(
        `INSERT INTO lich_su_ton_kho (ma_kho, ma_sp, ngay, xuat) 
         VALUES ($1, $2, CURRENT_DATE, $3)
         ON CONFLICT (ma_kho, ma_sp, ngay) 
         DO UPDATE SET xuat = lich_su_ton_kho.xuat + EXCLUDED.xuat`,
        [ma_kho, item.ma_sp, item.so_luong]
      );
    }

    await client.query('COMMIT');

    logInventoryEvent({ type: 'EXPORT', ma_kho, ma_phieu: ma_phieu_xuat, items });

    return { success: true, ma_phieu_xuat };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};