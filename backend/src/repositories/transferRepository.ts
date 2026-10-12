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
  transfer: TransferRecord
): Promise<{
  saga_id: string;
  global_id: string;
}> => {
  const result = await client.query(
    `
    INSERT INTO saga_transaction (
      ma_giao_dich_global,
      ma_phieu_dc,
      kho_xuat,
      kho_nhap,
      ma_sp,
      so_luong_yeu_cau,
      source_node,
      destination_node,
      current_state,
      status
    )
    SELECT
      gen_random_uuid(),
      $1::varchar,
      $2::varchar,
      $3::varchar,
      $4::varchar,
      $5::int,
      (SELECT node_name FROM kho WHERE ma_kho = $2::varchar),
      (SELECT node_name FROM kho WHERE ma_kho = $3::varchar),
      'WAITING_SOURCE_CONFIRMATION',
      'RUNNING'
    RETURNING saga_id, ma_giao_dich_global
    `,
    [
      transfer.ma_phieu_dc,
      transfer.kho_xuat,
      transfer.kho_nhap,
      transfer.ma_sp,
      transfer.so_luong
    ]
  );

  if (!result.rows[0]) {
    throw new Error(
      `Lỗi khi tạo Saga cho phiếu ${transfer.ma_phieu_dc}`
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

export interface TransferListItem {
  id: string;
  ma_phieu_dc: string;
  kho_xuat: string;
  ten_kho_xuat: string | null;
  kho_nhap: string;
  ten_kho_nhap: string | null;
  ma_sp: string;
  ten_sp: string | null;
  don_vi: string | null;
  so_luong: number;
  trang_thai: string;
  created_at: Date;
  ngay_dieu_chuyen: Date | null;
  saga_id: string | null;
  saga_state: string | null;
  saga_status: string | null;
  so_luong_da_xuat: number | null;
  so_luong_thuc_nhan: number | null;
  error_message: string | null;
}

export const getTransferReceiptsList = async (
  pool: Pool,
  filters?: {
    kho_xuat?: string;
    kho_nhap?: string;
    trang_thai?: string;
    ma_kho?: string; // Hỗ trợ lọc phiếu liên quan đến kho (kho_xuat hoặc kho_nhap)
  }
): Promise<TransferListItem[]> => {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.kho_xuat) {
    params.push(filters.kho_xuat.trim().toUpperCase());
    conditions.push(`dc.kho_xuat = $${params.length}`);
  }

  if (filters?.kho_nhap) {
    params.push(filters.kho_nhap.trim().toUpperCase());
    conditions.push(`dc.kho_nhap = $${params.length}`);
  }

  if (filters?.trang_thai) {
    params.push(filters.trang_thai.trim().toUpperCase());
    conditions.push(`dc.trang_thai = $${params.length}`);
  }

  if (filters?.ma_kho) {
    params.push(filters.ma_kho.trim().toUpperCase());
    conditions.push(`(dc.kho_xuat = $${params.length} OR dc.kho_nhap = $${params.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT
      dc.id,
      dc.ma_phieu_dc,
      dc.kho_xuat,
      kx.ten_kho AS ten_kho_xuat,
      dc.kho_nhap,
      kn.ten_kho AS ten_kho_nhap,
      dc.ma_sp,
      sp.ten_sp,
      sp.don_vi,
      dc.so_luong,
      dc.trang_thai,
      dc.created_at,
      dc.ngay_dieu_chuyen,
      s.saga_id,
      s.current_state AS saga_state,
      s.status AS saga_status,
      s.so_luong_da_xuat,
      s.so_luong_thuc_nhan,
      s.error_message
    FROM dieu_chuyen_central dc
    LEFT JOIN san_pham sp ON dc.ma_sp = sp.ma_sp
    LEFT JOIN kho kx ON dc.kho_xuat = kx.ma_kho
    LEFT JOIN kho kn ON dc.kho_nhap = kn.ma_kho
    LEFT JOIN saga_transaction s ON dc.ma_phieu_dc = s.ma_phieu_dc
    ${whereClause}
    ORDER BY dc.created_at DESC
  `;

  const result = await pool.query(sql, params);
  return result.rows;
};