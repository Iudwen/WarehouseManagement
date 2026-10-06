import { getCentralClient } from '../config/postgresql';

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
  getCentralClient: () => Promise;
}

const defaultDependencies: DiscrepancyHandlerDependencies = {
  getCentralClient,
};

export async function handleCentralTransferCompletedWithDiscrepancy(
  payload: TransferCompletedWithDiscrepancyPayload,
  dependencies: DiscrepancyHandlerDependencies = defaultDependencies,
): Promise {
  const client = await dependencies.getCentralClient();

  try {
    await client.query('BEGIN');

    // 1. Lock dòng saga_transaction để kiểm tra
    const sagaRes = await client.query(
      `SELECT saga_id, current_state, status 
       FROM saga_transaction 
       WHERE saga_id = $1 FOR UPDATE`,
      [payload.saga_id]
    );

    if (sagaRes.rows.length === 0) {
      console.error(`[DiscrepancyHandler] Saga ${payload.saga_id} không tồn tại`);
      await client.query('ROLLBACK');
      return;
    }

    const saga = sagaRes.rows[0];

    // Idempotency check: Nếu đã hoàn thành thì bỏ qua
    if (saga.current_state === 'COMPLETED_WITH_DISCREPANCY') {
      console.log(`[DiscrepancyHandler] Saga ${payload.saga_id} đã ở trạng thái COMPLETED_WITH_DISCREPANCY`);
      await client.query('ROLLBACK');
      return;
    }

    // 2. Cập nhật saga_transaction sang state COMPLETED_WITH_DISCREPANCY và lưu vết chênh lệch
    await client.query(
      `UPDATE saga_transaction
       SET current_state = 'COMPLETED_WITH_DISCREPANCY',
           status = 'SUCCESS',
           so_luong_thuc_nhan = $1,
           ly_do_thieu = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE saga_id = $3`,
      [payload.so_luong_thuc_nhan, payload.ly_do_thieu, payload.saga_id]
    );

    // 3. Cập nhật bảng dieu_chuyen_central sang trang_thai HOAN_THANH_THIEU
    await client.query(
      `UPDATE dieu_chuyen_central
       SET trang_thai = 'HOAN_THANH_THIEU'
       WHERE ma_phieu_dc = $1`,
      [payload.ma_phieu_dc]
    );

    // 4. Cập nhật saga_monitoring
    await client.query(
      `UPDATE saga_monitoring
       SET current_state = 'COMPLETED_WITH_DISCREPANCY',
           status = 'SUCCESS',
           last_event_type = 'TRANSFER_COMPLETED_WITH_DISCREPANCY',
           last_event_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE ma_phieu_dc = $1`,
      [payload.ma_phieu_dc]
    );

    await client.query('COMMIT');
    console.log(`[DiscrepancyHandler] Xử lý thành công Discrepancy cho phiếu ${payload.ma_phieu_dc}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[DiscrepancyHandler] Lỗi xử lý Discrepancy Event:`, error);
    throw error;
  } finally {
    client.release();
  }
}