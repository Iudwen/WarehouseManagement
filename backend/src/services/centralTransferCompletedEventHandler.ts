import { Pool, PoolClient } from 'pg';
import { ApplicationMessage } from '../messaging/messageBoundary';

export interface TransferCompletedPayload {
  saga_id: string;
  global_id: string;
  ma_phieu_dc: string;
  kho_xuat: string;
  kho_nhap: string;
  ma_sp: string;
  so_luong: number;
}

export interface ProcessedEventStore {
  isProcessed(eventId: string): Promise;
  markProcessed(eventId: string): Promise;
}

export interface CentralTransferCompletedHandlerDependencies {
  centralPool: Pool;
  eventStore: ProcessedEventStore;
}

/**
 * Central Handler xử lý sự kiện TRANSFER_COMPLETED khi kho nhận (Destination Node) đã hoàn tất nhập kho.
 * Hoàn tất chu trình Saga Happy Path: IN_TRANSIT -> COMPLETED và status RUNNING -> SUCCESS.
 */
export const handleTransferCompletedEvent = async (
  message: ApplicationMessage,
  dependencies: CentralTransferCompletedHandlerDependencies,
): Promise => {
  // BƯỚC 1: Kiểm tra loại Message
  if (message.messageType !== 'TRANSFER_COMPLETED') {
    throw new Error(
      `Message type không hợp lệ: ${message.messageType}, kỳ vọng TRANSFER_COMPLETED`,
    );
  }

  const eventId = message.eventId || (message.payload as any)?.event_id;

  // BƯỚC 2: Kiểm tra Idempotency
  if (eventId && (await dependencies.eventStore.isProcessed(eventId))) {
    return;
  }

  const payload = message.payload as TransferCompletedPayload;

  // BƯỚC 3: Validate tính đầy đủ của Payload
  if (
    !payload ||
    !payload.saga_id ||
    !payload.global_id ||
    !payload.ma_phieu_dc ||
    !payload.kho_xuat ||
    !payload.kho_nhap ||
    !payload.ma_sp ||
    !payload.so_luong
  ) {
    throw new Error('TRANSFER_COMPLETED payload thiếu thông tin bắt buộc');
  }

  const client: PoolClient = await dependencies.centralPool.connect();

  try {
    await client.query('BEGIN');

    // BƯỚC 4: Lock dòng Saga trong Central DB
    const sagaResult = await client.query(
      `SELECT
         saga_id,
         ma_giao_dich_global AS global_id,
         ma_phieu_dc,
         kho_xuat,
         kho_nhap,
         ma_sp,
         so_luong_yeu_cau,
         current_state,
         status
       FROM saga_transaction
       WHERE ma_phieu_dc = $1
       FOR UPDATE`,
      [payload.ma_phieu_dc],
    );

    if (sagaResult.rows.length === 0) {
      throw new Error(`Không tìm thấy Saga cho phiếu ${payload.ma_phieu_dc}`);
    }

    const saga = sagaResult.rows[0];

    // BƯỚC 5: Đối chiếu dữ liệu Identity
    if (saga.saga_id !== payload.saga_id) {
      throw new Error(`saga_id không khớp: \({payload.saga_id} vs\){saga.saga_id}`);
    }

    if (saga.global_id !== payload.global_id) {
      throw new Error(`global_id không khớp: \({payload.global_id} vs\){saga.global_id}`);
    }

    if (saga.kho_xuat.toUpperCase() !== payload.kho_xuat.toUpperCase()) {
      throw new Error(`kho_xuat không khớp: \({payload.kho_xuat} vs\){saga.kho_xuat}`);
    }

    if (saga.kho_nhap.toUpperCase() !== payload.kho_nhap.toUpperCase()) {
      throw new Error(`kho_nhap không khớp: \({payload.kho_nhap} vs\){saga.kho_nhap}`);
    }

    if (saga.ma_sp !== payload.ma_sp) {
      throw new Error(`ma_sp không khớp: \({payload.ma_sp} vs\){saga.ma_sp}`);
    }

    if (Number(saga.so_luong_yeu_cau) !== Number(payload.so_luong)) {
      throw new Error(
        `so_luong không khớp: \({payload.so_luong} vs\){saga.so_luong_yeu_cau}`,
      );
    }

    // BƯỚC 6: Validate Trạng thái Saga (Kỳ vọng RUNNING và IN_TRANSIT)
    if (saga.status !== 'RUNNING') {
      throw new Error(
        `Saga status không phải RUNNING (trạng thái hiện tại: ${saga.status})`,
      );
    }

    if (saga.current_state !== 'IN_TRANSIT') {
      throw new Error(
        `Saga state không phải IN_TRANSIT (state hiện tại: ${saga.current_state})`,
      );
    }

    // BƯỚC 7: Cập nhật Central saga_transaction (current_state: COMPLETED, status: SUCCESS)
    await client.query(
      `UPDATE saga_transaction
       SET current_state = 'COMPLETED',
           status = 'SUCCESS',
           updated_at = CURRENT_TIMESTAMP
       WHERE ma_phieu_dc = $1`,
      [payload.ma_phieu_dc],
    );

    // BƯỚC 8: Cập nhật nhật ký saga_monitoring
    await client.query(
      `UPDATE saga_monitoring
       SET current_state = 'COMPLETED',
           status = 'SUCCESS',
           last_event_type = 'TRANSFER_COMPLETED',
           last_event_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE ma_phieu_dc = $1`,
      [payload.ma_phieu_dc],
    );

    // BƯỚC 9: Cập nhật trạng thái nghiệp vụ phiếu dieu_chuyen_central sang HOAN_THANH
    await client.query(
      `UPDATE dieu_chuyen_central
       SET trang_thai = 'HOAN_THANH'
       WHERE ma_phieu_dc = $1`,
      [payload.ma_phieu_dc],
    );

    await client.query('COMMIT');

    // BƯỚC 10: Đánh dấu event đã xử lý sau khi COMMIT thành công
    if (eventId) {
      await dependencies.eventStore.markProcessed(eventId);
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};