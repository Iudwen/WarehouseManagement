import { PoolClient } from 'pg';
import { InventoryItemInput } from '../types';

export const getCurrentStockForUpdate = async (
  client: PoolClient,
  maKho: string,
  maSp: string
): Promise<number> => {
  const result = await client.query(
    `
    SELECT so_luong
    FROM ton_kho
    WHERE ma_kho = $1
      AND ma_sp = $2
    FOR UPDATE
    `,
    [maKho, maSp]
  );

  return result.rows[0]?.so_luong ?? 0;
};

export const insertExportReceipt = async (
  client: PoolClient,
  maPhieuXuat: string,
  maKho: string,
  maKh: string
): Promise<void> => {
  await client.query(
    `
    INSERT INTO phieu_xuat (
      ma_phieu_xuat,
      ma_kho,
      ma_kh,
      ngay_xuat,
      trang_thai
    )
    VALUES ($1, $2, $3, NOW(), 'COMPLETED')
    `,
    [maPhieuXuat, maKho, maKh]
  );
};

export const insertExportDetail = async (
  client: PoolClient,
  maPhieuXuat: string,
  item: InventoryItemInput
): Promise<void> => {
  await client.query(
    `
    INSERT INTO ct_phieu_xuat (
      ma_phieu_xuat,
      ma_sp,
      so_luong,
      don_gia
    )
    VALUES ($1, $2, $3, $4)
    `,
    [
      maPhieuXuat,
      item.ma_sp,
      item.so_luong,
      item.don_gia,
    ]
  );
};

export const decreaseStock = async (
  client: PoolClient,
  maKho: string,
  item: InventoryItemInput
): Promise<void> => {
  await client.query(
    `
    UPDATE ton_kho
    SET
      so_luong = so_luong - $1,
      cap_nhat_luc = NOW()
    WHERE ma_kho = $2
      AND ma_sp = $3
    `,
    [item.so_luong, maKho, item.ma_sp]
  );
};

export const increaseExportHistory = async (
  client: PoolClient,
  maKho: string,
  item: InventoryItemInput
): Promise<void> => {
  await client.query(
    `
    INSERT INTO lich_su_ton_kho (
      ma_kho,
      ma_sp,
      ngay,
      xuat
    )
    VALUES ($1, $2, CURRENT_DATE, $3)
    ON CONFLICT (ma_kho, ma_sp, ngay)
    DO UPDATE SET
      xuat = lich_su_ton_kho.xuat + EXCLUDED.xuat
    `,
    [maKho, item.ma_sp, item.so_luong]
  );
};