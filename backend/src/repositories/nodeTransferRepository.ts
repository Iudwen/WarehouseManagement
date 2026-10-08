import { Pool } from 'pg';

export interface NodeTransferContext {
  saga_id: string;
  global_id: string;
  ma_phieu_dc: string;
  ma_kho: string;
  ma_sp: string;
  so_luong?: number;
  so_luong_thuc_nhan?: number;
}

/**
 * Kho nguồn xác nhận có thể thực hiện điều chuyển.
 * Node sẽ kiểm tra tồn khả dụng và tạo reservation.
 */
export const acceptTransfer = async (
  pool: Pool,
  data: Required<Pick<NodeTransferContext,
    'saga_id' |
    'global_id' |
    'ma_phieu_dc' |
    'ma_kho' |
    'ma_sp' |
    'so_luong'
  >>
): Promise<void> => {
  await pool.query(
    `
    SELECT sp_accept_transfer(
      $1::uuid,
      $2::uuid,
      $3::varchar,
      $4::varchar,
      $5::varchar,
      $6::int
    )
    `,
    [
      data.saga_id,
      data.global_id,
      data.ma_phieu_dc,
      data.ma_kho,
      data.ma_sp,
      data.so_luong,
    ]
  );
};

/**
 * Kho nguồn thực hiện xuất hàng.
 * Node tự:
 * - trừ ton_kho
 * - ghi stock_ledger
 * - ghi lich_su_ton_kho
 * - consume reservation
 * - tạo OUTBOX TRANSFER_SHIPPED
 */
export const shipTransfer = async (
  pool: Pool,
  data: Required<Pick<NodeTransferContext,
    'saga_id' |
    'global_id' |
    'ma_phieu_dc' |
    'ma_kho' |
    'ma_sp'
  >>
): Promise<void> => {
  await pool.query(
    `
    SELECT sp_ship_transfer(
      $1::uuid,
      $2::uuid,
      $3::varchar,
      $4::varchar,
      $5::varchar
    )
    `,
    [
      data.saga_id,
      data.global_id,
      data.ma_phieu_dc,
      data.ma_kho,
      data.ma_sp,
    ]
  );
};

/**
 * Kho đích nhận hàng.
 * Node tự:
 * - cộng ton_kho
 * - ghi stock_ledger
 * - ghi lich_su_ton_kho
 * - tạo OUTBOX TRANSFER_RECEIVED
 */
export const receiveTransfer = async (
  pool: Pool,
  data: Required<Pick<NodeTransferContext,
    'saga_id' |
    'global_id' |
    'ma_phieu_dc' |
    'ma_kho' |
    'ma_sp' |
    'so_luong_thuc_nhan'
  >>
): Promise<void> => {
  await pool.query(
    `
    SELECT sp_receive_transfer(
      $1::uuid,
      $2::uuid,
      $3::varchar,
      $4::varchar,
      $5::varchar,
      $6::int
    )
    `,
    [
      data.saga_id,
      data.global_id,
      data.ma_phieu_dc,
      data.ma_kho,
      data.ma_sp,
      data.so_luong_thuc_nhan,
    ]
  );
};