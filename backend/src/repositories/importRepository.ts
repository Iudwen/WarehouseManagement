import { PoolClient } from 'pg';
import { InventoryItemInput } from '../types';

export interface ImportReceiptRecord {
  ma_phieu_nhap: string;
  ma_kho: string;
  ma_ncc: string | null;
  ngay_nhap: Date;
  trang_thai: string;
}

export interface ImportDetailRecord {
  ma_phieu_nhap: string;
  ma_sp: string;
  so_luong: number;
  don_gia: number;
}

export const checkSupplierExists = async (
  client: PoolClient,
  maNcc: string
): Promise<boolean> => {
  const result = await client.query(
    `SELECT 1 FROM nha_cung_cap WHERE ma_ncc = $1`,
    [maNcc]
  );
  return result.rows.length > 0;
};

export const checkProductExists = async (
  client: PoolClient,
  maSp: string
): Promise<boolean> => {
  const result = await client.query(
    `SELECT 1 FROM san_pham WHERE ma_sp = $1`,
    [maSp]
  );
  return result.rows.length > 0;
};

export const getImportReceiptForUpdate = async (
  client: PoolClient,
  maPhieuNhap: string
): Promise<ImportReceiptRecord | null> => {
  const result = await client.query(
    `
    SELECT ma_phieu_nhap, ma_kho, ma_ncc, ngay_nhap, trang_thai
    FROM phieu_nhap
    WHERE ma_phieu_nhap = $1
    FOR UPDATE
    `,
    [maPhieuNhap]
  );

  return result.rows[0] ?? null;
};

export const getImportReceiptDetails = async (
  client: PoolClient,
  maPhieuNhap: string
): Promise<ImportDetailRecord[]> => {
  const result = await client.query(
    `
    SELECT ma_phieu_nhap, ma_sp, so_luong, don_gia
    FROM ct_phieu_nhap
    WHERE ma_phieu_nhap = $1
    ORDER BY ma_sp
    `,
    [maPhieuNhap]
  );

  return result.rows;
};

export const insertImportReceipt = async (
  client: PoolClient,
  maPhieuNhap: string,
  maKho: string,
  maNcc: string,
  trangThai: string = 'CHO_DUYET'
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
    VALUES ($1, $2, $3, NOW(), $4)
    `,
    [maPhieuNhap, maKho, maNcc, trangThai]
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

export const updateImportReceiptStatus = async (
  client: PoolClient,
  maPhieuNhap: string,
  trangThai: string
): Promise<void> => {
  await client.query(
    `
    UPDATE phieu_nhap
    SET trang_thai = $1
    WHERE ma_phieu_nhap = $2
    `,
    [trangThai, maPhieuNhap]
  );
};

export const updateImportDetailQuantity = async (
  client: PoolClient,
  maPhieuNhap: string,
  maSp: string,
  soLuongMoi: number
): Promise<void> => {
  await client.query(
    `
    UPDATE ct_phieu_nhap
    SET so_luong = $1
    WHERE ma_phieu_nhap = $2
      AND ma_sp = $3
    `,
    [soLuongMoi, maPhieuNhap, maSp]
  );
};

export const replaceImportReceiptDetails = async (
  client: PoolClient,
  maPhieuNhap: string,
  items: InventoryItemInput[]
): Promise<void> => {
  await client.query(
    `DELETE FROM ct_phieu_nhap WHERE ma_phieu_nhap = $1`,
    [maPhieuNhap]
  );

  for (const item of items) {
    await insertImportDetail(client, maPhieuNhap, item);
  }
};

export const increaseStock = async (
  client: PoolClient,
  maKho: string,
  item: { ma_sp: string; so_luong: number }
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
  item: { ma_sp: string; so_luong: number }
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

export const insertStockLedgerImport = async (
  client: PoolClient,
  maKho: string,
  maSp: string,
  soLuong: number,
  maChungTu: string,
  nguoiThucHien?: string,
  ghiChu?: string
): Promise<void> => {
  const soLuongThayDoi = Math.abs(soLuong);
  await client.query(
    `
    INSERT INTO stock_ledger (
      ma_kho,
      ma_sp,
      loai_giao_dich,
      so_luong,
      so_luong_thay_doi,
      ma_chung_tu,
      thoi_gian,
      nguoi_thuc_hien,
      ghi_chu
    )
    VALUES ($1, $2, 'NHAP', $3, $4, $5, NOW(), $6, $7)
    `,
    [maKho, maSp, soLuong, soLuongThayDoi, maChungTu, nguoiThucHien || null, ghiChu || null]
  );
};

export const getImportedQuantitiesFromLedger = async (
  client: PoolClient,
  maPhieuNhap: string
): Promise<Record<string, number>> => {
  const result = await client.query(
    `
    SELECT ma_sp, COALESCE(SUM(so_luong), 0)::int as tong_da_nhap
    FROM stock_ledger
    WHERE ma_chung_tu = $1
      AND loai_giao_dich = 'NHAP'
    GROUP BY ma_sp
    `,
    [maPhieuNhap]
  );

  const map: Record<string, number> = {};
  for (const row of result.rows) {
    map[row.ma_sp] = Number(row.tong_da_nhap);
  }
  return map;
};

export interface ImportReceiptListItem {
  ma_phieu_nhap: string;
  ma_kho: string;
  ma_ncc: string | null;
  ten_ncc: string | null;
  ngay_nhap: Date;
  trang_thai: string;
  tong_so_luong: number;
  tong_tien: number;
  items: Array<{
    ma_sp: string;
    ten_sp: string | null;
    don_vi: string | null;
    so_luong: number;
    don_gia: number;
    da_nhap?: number;
  }>;
}

export const getImportReceiptsList = async (
  client: PoolClient,
  maKho?: string,
  trangThai?: string
): Promise<ImportReceiptListItem[]> => {
  const params: any[] = [];
  const whereClauses: string[] = [];

  if (maKho && maKho !== 'CENTRAL') {
    params.push(maKho);
    whereClauses.push(`pn.ma_kho = $${params.length}`);
  }

  if (trangThai) {
    params.push(trangThai);
    whereClauses.push(`pn.trang_thai = $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT
      pn.ma_phieu_nhap,
      pn.ma_kho,
      pn.ma_ncc,
      ncc.ten_ncc,
      pn.ngay_nhap,
      pn.trang_thai,
      COALESCE(
        json_agg(
          json_build_object(
            'ma_sp', ct.ma_sp,
            'ten_sp', sp.ten_sp,
            'don_vi', sp.don_vi,
            'so_luong', ct.so_luong,
            'don_gia', ct.don_gia
          )
        ) FILTER (WHERE ct.ma_sp IS NOT NULL),
        '[]'::json
      ) AS items,
      COALESCE(SUM(ct.so_luong), 0)::int AS tong_so_luong,
      COALESCE(SUM(ct.so_luong * ct.don_gia), 0)::numeric AS tong_tien
    FROM phieu_nhap pn
    LEFT JOIN nha_cung_cap ncc ON pn.ma_ncc = ncc.ma_ncc
    LEFT JOIN ct_phieu_nhap ct ON pn.ma_phieu_nhap = ct.ma_phieu_nhap
    LEFT JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
    ${whereSql}
    GROUP BY pn.ma_phieu_nhap, pn.ma_kho, pn.ma_ncc, ncc.ten_ncc, pn.ngay_nhap, pn.trang_thai
    ORDER BY pn.ngay_nhap DESC
  `;

  const result = await client.query(sql, params);

  return result.rows.map((row) => ({
    ma_phieu_nhap: row.ma_phieu_nhap,
    ma_kho: row.ma_kho,
    ma_ncc: row.ma_ncc,
    ten_ncc: row.ten_ncc,
    ngay_nhap: row.ngay_nhap,
    trang_thai: row.trang_thai,
    tong_so_luong: Number(row.tong_so_luong),
    tong_tien: Number(row.tong_tien),
    items: Array.isArray(row.items) ? row.items : [],
  }));
};