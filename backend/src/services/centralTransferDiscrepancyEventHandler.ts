import { getDbPool } from '../config/postgresql';

export interface TransferCompletedWithDiscrepancyPayload {
  saga_id: string;
  global_id: string;
  ma_phieu_dc: string;
  kho_xuat: string;
  kho_nhap: string;
  ma_sp: string;
  so_luong_yeu_cau: number;
  so_luong_thuc_nhan: number;
  so_luong_thieu: number;
  ly_do_thieu: string;
}

export interface DiscrepancyHandlerDependencies {
  getCentralClient: () => Promise<any>;
}

const getCentralClient = async (): Promise<any> => {
  const pool = getDbPool('CENTRAL');
  return pool.connect();
};

const defaultDependencies: DiscrepancyHandlerDependencies = {
  getCentralClient,
};

export async function handleCentralTransferCompletedWithDiscrepancy(
  payload: TransferCompletedWithDiscrepancyPayload,
  dependencies: DiscrepancyHandlerDependencies = defaultDependencies,
): Promise<void> {
  const client = await dependencies.getCentralClient();

  try {
    await client.query('BEGIN');

    const sagaRes = await client.query(
      `SELECT
         saga_id,
         current_state,
         status
       FROM saga_transaction
       WHERE saga_id = $1
       FOR UPDATE`,
      [payload.saga_id],
    );

    if (sagaRes.rows.length === 0) {
      console.error(
        `[DiscrepancyHandler] Saga ${payload.saga_id} không tồn tại`,
      );

      await client.query('ROLLBACK');
      return;
    }

    const saga = sagaRes.rows[0];

    // Idempotency:
    // Nếu event bị gửi lại sau khi đã xử lý thì bỏ qua.
    if (
      saga.current_state === 'COMPLETED_WITH_DISCREPANCY'
      || saga.current_state === 'COMPLETED'
    ) {
      console.log(
        `[DiscrepancyHandler] Saga ${payload.saga_id} đã được xử lý trước đó`,
      );

      await client.query('ROLLBACK');
      return;
    }

    // ========================================================
    // 1. CẬP NHẬT SAGA
    // ========================================================

    await client.query(
      `UPDATE saga_transaction
       SET current_state = 'COMPLETED_WITH_DISCREPANCY',
           status = 'SUCCESS',
           so_luong_thuc_nhan = $1,
           so_luong_chenh_lech = $2,
           ly_do_thieu = $3,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE saga_id = $4`,
      [
        payload.so_luong_thuc_nhan,
        payload.so_luong_thieu,
        payload.ly_do_thieu,
        payload.saga_id,
      ],
    );

    // ========================================================
    // 2. CẬP NHẬT PHIẾU ĐIỀU CHUYỂN CENTRAL
    // ========================================================

    await client.query(
      `UPDATE dieu_chuyen_central
       SET trang_thai = 'HOAN_THANH_THIEU'
       WHERE ma_phieu_dc = $1`,
      [payload.ma_phieu_dc],
    );

    // ========================================================
    // 3. CẬP NHẬT SAGA MONITORING
    // ========================================================

    await client.query(
      `UPDATE saga_monitoring
       SET current_state = 'COMPLETED_WITH_DISCREPANCY',
           status = 'SUCCESS',
           last_event_type = 'TRANSFER_COMPLETED_WITH_DISCREPANCY',
           last_event_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE ma_phieu_dc = $1`,
      [payload.ma_phieu_dc],
    );

    await client.query('COMMIT');

    console.log(
      `[DiscrepancyHandler] Xử lý thành công Discrepancy cho phiếu ${payload.ma_phieu_dc}`,
    );
  } catch (error) {
    await client.query('ROLLBACK');

    console.error(
      `[DiscrepancyHandler] Lỗi xử lý Discrepancy Event:`,
      error,
    );

    throw error;
  } finally {
    client.release();
  }
}