import { PoolClient } from 'pg';
import { InventoryItemInput } from '../types';

export interface ExportReceiptRecord {
  ma_phieu_xuat: string;
  ma_kho: string;
  ma_kh: string | null;
  ngay_xuat: Date;
  trang_thai: string;
}

export interface ExportDetailRecord {
  ma_phieu_xuat: string;
  ma_sp: string;
  so_luong: number;
  don_gia: number;
}

export const getExportReceiptForUpdate = async (
  client: PoolClient,
  maPhieuXuat: string
): Promise<ExportReceiptRecord | null> => {
  const result = await client.query(
    `
    SELECT ma_phieu_xuat, ma_kho, ma_kh, ngay_xuat, trang_thai
    FROM phieu_xuat
    WHERE ma_phieu_xuat = $1
    FOR UPDATE
    `,
    [maPhieuXuat]
  );

  return result.rows[0] ?? null;
};

export const getExportReceiptDetails = async (
  client: PoolClient,
  maPhieuXuat: string
): Promise<ExportDetailRecord[]> => {
  const result = await client.query(
    `
    SELECT ma_phieu_xuat, ma_sp, so_luong, don_gia
    FROM ct_phieu_xuat
    WHERE ma_phieu_xuat = $1
    ORDER BY ma_sp
    `,
    [maPhieuXuat]
  );

  return result.rows;
};

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
  maKh: string,
  trangThai: string = 'CHO_DUYET'
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
    VALUES ($1, $2, $3, NOW(), $4)
    `,
    [maPhieuXuat, maKho, maKh, trangThai]
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

export const updateExportReceiptStatus = async (
  client: PoolClient,
  maPhieuXuat: string,
  trangThai: string
): Promise<void> => {
  await client.query(
    `
    UPDATE phieu_xuat
    SET trang_thai = $1
    WHERE ma_phieu_xuat = $2
    `,
    [trangThai, maPhieuXuat]
  );
};

export const replaceExportReceiptDetails = async (
  client: PoolClient,
  maPhieuXuat: string,
  items: InventoryItemInput[]
): Promise<void> => {
  await client.query(
    `DELETE FROM ct_phieu_xuat WHERE ma_phieu_xuat = $1`,
    [maPhieuXuat]
  );

  for (const item of items) {
    await insertExportDetail(client, maPhieuXuat, item);
  }
};

export const decreaseStock = async (
  client: PoolClient,
  maKho: string,
  item: { ma_sp: string; so_luong: number }
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
  item: { ma_sp: string; so_luong: number }
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

export const insertStockLedger = async (
  client: PoolClient,
  maKho: string,
  maSp: string,
  soLuong: number,
  maChungTu: string,
  nguoiThucHien?: string,
  ghiChu?: string
): Promise<void> => {
  const soLuongThayDoi = -Math.abs(soLuong);
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
    VALUES ($1, $2, 'XUAT', $3, $4, $5, NOW(), $6, $7)
    `,
    [maKho, maSp, soLuong, soLuongThayDoi, maChungTu, nguoiThucHien || null, ghiChu || null]
  );
};

export interface ExportReceiptListItem {
  ma_phieu_xuat: string;
  ma_kho: string;
  ma_kh: string | null;
  ten_kh: string | null;
  ngay_xuat: Date;
  trang_thai: string;
  tong_so_luong: number;
  tong_tien: number;
  items: Array<{
    ma_sp: string;
    ten_sp: string | null;
    don_vi: string | null;
    so_luong: number;
    don_gia: number;
  }>;
}

export const getExportReceiptsList = async (
  client: PoolClient,
  maKho?: string,
  trangThai?: string
): Promise<ExportReceiptListItem[]> => {
  const whereClauses: string[] = [];
  const params: any[] = [];

  if (maKho && maKho !== 'CENTRAL') {
    params.push(maKho);
    whereClauses.push(`px.ma_kho = $${params.length}`);
  }

  if (trangThai) {
    params.push(trangThai);
    whereClauses.push(`px.trang_thai = $${params.length}`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const sql = `
    SELECT
      px.ma_phieu_xuat,
      px.ma_kho,
      px.ma_kh,
      kh.ten_kh,
      px.ngay_xuat,
      px.trang_thai,
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
    FROM phieu_xuat px
    LEFT JOIN khach_hang kh ON px.ma_kh = kh.ma_kh
    LEFT JOIN ct_phieu_xuat ct ON px.ma_phieu_xuat = ct.ma_phieu_xuat
    LEFT JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
    ${whereSql}
    GROUP BY px.ma_phieu_xuat, px.ma_kho, px.ma_kh, kh.ten_kh, px.ngay_xuat, px.trang_thai
    ORDER BY px.ngay_xuat DESC
  `;

  const result = await client.query(sql, params);

  return result.rows.map((row) => ({
    ma_phieu_xuat: row.ma_phieu_xuat,
    ma_kho: row.ma_kho,
    ma_kh: row.ma_kh,
    ten_kh: row.ten_kh,
    ngay_xuat: row.ngay_xuat,
    trang_thai: row.trang_thai,
    tong_so_luong: Number(row.tong_so_luong),
    tong_tien: Number(row.tong_tien),
    items: Array.isArray(row.items) ? row.items : [],
  }));
};