import { PoolClient } from 'pg';
import { InventoryItemInput } from '../types';

export const insertImportReceipt = async (
  client: PoolClient,
  maPhieuNhap: string,
  maKho: string,
  maNcc: string
): Promise<void> => {
  await client.query(
    `
    INSERT INTO phieu_nhap (
      ma_phieu_nhap,
      ma_kho,
      ma_ncc,
      ngay_nhap,
      trang_thai
    )
    VALUES ($1, $2, $3, NOW(), 'COMPLETED')
    `,
    [maPhieuNhap, maKho, maNcc]
  );
};

export const insertImportDetail = async (
  client: PoolClient,
  maPhieuNhap: string,
  item: InventoryItemInput
): Promise<void> => {
  await client.query(
    `
    INSERT INTO ct_phieu_nhap (
      ma_phieu_nhap,
      ma_sp,
      so_luong,
      don_gia
    )
    VALUES ($1, $2, $3, $4)
    `,
    [
      maPhieuNhap,
      item.ma_sp,
      item.so_luong,
      item.don_gia,
    ]
  );
};

export const increaseStock = async (
  client: PoolClient,
  maKho: string,
  item: InventoryItemInput
): Promise<void> => {
  await client.query(
    `
    INSERT INTO ton_kho (
      ma_kho,
      ma_sp,
      so_luong,
      cap_nhat_luc
    )
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (ma_kho, ma_sp)
    DO UPDATE SET
      so_luong = ton_kho.so_luong + EXCLUDED.so_luong,
      cap_nhat_luc = NOW()
    `,
    [maKho, item.ma_sp, item.so_luong]
  );
};

export const increaseImportHistory = async (
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
      nhap
    )
    VALUES ($1, $2, CURRENT_DATE, $3)
    ON CONFLICT (ma_kho, ma_sp, ngay)
    DO UPDATE SET
      nhap = lich_su_ton_kho.nhap + EXCLUDED.nhap
    `,
    [maKho, item.ma_sp, item.so_luong]
  );
};  