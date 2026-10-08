import { Pool, PoolClient } from 'pg';

export interface TransferRecord {
  ma_phieu_dc: string;
  kho_xuat: string;
  kho_nhap: string;
  ma_sp: string;
  so_luong: number;
  ngay_dieu_chuyen: Date | null;
  trang_thai: string;
  source_node: string | null;
  created_at: Date;
}

export const findTransferById = async (
  pool: Pool,
  maPhieuDc: string
): Promise<TransferRecord | null> => {
  const result = await pool.query(
    `
    SELECT
      ma_phieu_dc,
      kho_xuat,
      kho_nhap,
      ma_sp,
      so_luong,
      ngay_dieu_chuyen,
      trang_thai,
      source_node,
      created_at
    FROM dieu_chuyen_central
    WHERE ma_phieu_dc = $1
    LIMIT 1
    `,
    [maPhieuDc]
  );

  return result.rows[0] ?? null;
};

export const createTransfer = async (
  pool: Pool,
  payload: {
    ma_phieu_dc: string;
    kho_xuat: string;
    kho_nhap: string;
    ma_sp: string;
    so_luong: number;
    trang_thai?: string;
    source_node?: string | null;
  }
): Promise<TransferRecord> => {
  const result = await pool.query(
    `
    INSERT INTO dieu_chuyen_central (
      ma_phieu_dc,
      kho_xuat,
      kho_nhap,
      ma_sp,
      so_luong,
      ngay_dieu_chuyen,
      trang_thai,
      source_node
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      CURRENT_TIMESTAMP,
      $6,
      $7
    )
    RETURNING
      ma_phieu_dc,
      kho_xuat,
      kho_nhap,
      ma_sp,
      so_luong,
      ngay_dieu_chuyen,
      trang_thai,
      source_node,
      created_at
    `,
    [
      payload.ma_phieu_dc,
      payload.kho_xuat,
      payload.kho_nhap,
      payload.ma_sp,
      payload.so_luong,
      payload.trang_thai ?? 'PENDING',
      payload.source_node ?? null,
    ]
  );

  return result.rows[0] as TransferRecord;
};

export const updateTransferStatus = async (
  client: PoolClient,
  maPhieuDc: string,
  trangThai: string
): Promise<TransferRecord> => {
  const result = await client.query(
    `
    UPDATE dieu_chuyen_central
    SET trang_thai = $1
    WHERE ma_phieu_dc = $2
    RETURNING
      ma_phieu_dc,
      kho_xuat,
      kho_nhap,
      ma_sp,
      so_luong,
      ngay_dieu_chuyen,
      trang_thai,
      source_node,
      created_at
    `,
    [trangThai, maPhieuDc]
  );

  if (result.rows.length === 0) {
    throw new Error(
      `Không tìm thấy phiếu điều chuyển: ${maPhieuDc}`
    );
  }

  return result.rows[0] as TransferRecord;
};

export const createSaga = async (
  client: PoolClient,
  maPhieuDc: string
): Promise<{
  saga_id: string;
  global_id: string;
}> => {
  const result = await client.query(
    `
    SELECT
      saga_id,
      ma_giao_dich_global
    FROM saga_transaction
    WHERE ma_phieu_dc = $1
    LIMIT 1
    `,
    [maPhieuDc]
  );

  if (!result.rows[0]) {
    throw new Error(
      `Không tìm thấy Saga cho phiếu ${maPhieuDc}`
    );
  }

  return {
    saga_id: result.rows[0].saga_id,
    global_id: result.rows[0].ma_giao_dich_global,
  };
};

export const getSagaByTransferId = async (
  pool: Pool,
  maPhieuDc: string
) => {
  const result = await pool.query(
    `
    SELECT
      saga_id,
      ma_giao_dich_global,
      ma_phieu_dc,
      kho_xuat,
      kho_nhap,
      ma_sp,
      so_luong_yeu_cau,
      so_luong_da_xuat,
      so_luong_thuc_nhan,
      so_luong_chenh_lech,
      current_state,
      status,
      source_node,
      destination_node,
      created_at,
      updated_at
    FROM saga_transaction
    WHERE ma_phieu_dc = $1
    LIMIT 1
    `,
    [maPhieuDc]
  );

  return result.rows[0] ?? null;
};