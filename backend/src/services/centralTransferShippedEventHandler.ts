import { Pool, PoolClient } from 'pg';
import { ApplicationMessage } from '../messaging/messageBoundary';

export interface TransferShippedPayload {
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

export interface CentralTransferShippedHandlerDependencies {
  centralPool: Pool;
  eventStore: ProcessedEventStore;
}

export const handleTransferShippedEvent = async (
  message: ApplicationMessage,
  dependencies: CentralTransferShippedHandlerDependencies,
): Promise => {
  // 1. Validate Message Type
  if (message.messageType !== 'TRANSFER_SHIPPED') {
    throw new Error(`Message type không hợp lệ: ${message.messageType}, kỳ vọng TRANSFER_SHIPPED`);
  }

  const eventId = message.eventId || (message.payload as any)?.event_id;

  // 2. Idempotency Check
  if (eventId && (await dependencies.eventStore.isProcessed(eventId))) {
    return;
  }

  const payload = message.payload as TransferShippedPayload;

  // 3. Validate Payload Contract
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
    throw new Error('TRANSFER_SHIPPED payload thiếu thông tin bắt buộc');
  }

  const client: PoolClient = await dependencies.centralPool.connect();

  try {
    await client.query('BEGIN');

    // 4. Lock Saga Transaction FOR UPDATE
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

    // 5. Validate Identity / Contracts
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
      throw new Error(`so_luong không khớp: \({payload.so_luong} vs\){saga.so_luong_yeu_cau}`);
    }

    // 6. Validate Saga State & Status
    if (saga.status !== 'RUNNING') {
      throw new Error(`Saga status không phải RUNNING (trạng thái hiện tại: ${saga.status})`);
    }

    if (saga.current_state !== 'SOURCE_ACCEPTED') {
      throw new Error(
        `Saga state không phải SOURCE_ACCEPTED (state hiện tại: ${saga.current_state})`,
      );
    }

    // 7. Update Central Saga State -> IN_TRANSIT
    await client.query(
      `UPDATE saga_transaction
       SET current_state = 'IN_TRANSIT',
           updated_at = CURRENT_TIMESTAMP
       WHERE ma_phieu_dc = $1`,
      [payload.ma_phieu_dc],
    );

    // 8. Update Saga Monitoring
    await client.query(
      `UPDATE saga_monitoring
       SET current_state = 'IN_TRANSIT',
           last_event_type = 'TRANSFER_SHIPPED',
           last_event_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE ma_phieu_dc = $1`,
      [payload.ma_phieu_dc],
    );

    await client.query('COMMIT');

    // 9. Mark Processed Idempotency
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