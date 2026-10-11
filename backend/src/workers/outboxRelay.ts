/**
 * outboxRelay.ts
 * Module chuyển tiếp (Relay) sự kiện từ Outbox Node sang Central Database.
 * Đảm bảo Idempotency với event_id ổn định và payload chuẩn hóa tất định.
 */

import { Pool } from 'pg';
import {
  OutboxEvent,
  RelayResult,
  RelayErrorType,
  TransferShippedPayload,
  TransferReceivedPayload,
} from './types';

/**
 * Chuẩn hóa payload tất định trong bộ nhớ trước khi gửi sang Central.
 * Tuyệt đối không thay đổi payload gốc trong database của Node.
 */
export function normalizePayloadForCentral(event: OutboxEvent): Record<string, any> {
  let raw = event.payload || {};
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  const normalized: Record<string, any> = { ...raw };

  // Đồng bộ các định danh cốt lõi từ bản ghi event vào payload nếu payload còn thiếu
  // để bảo đảm khớp hoàn toàn với tham số gọi Stored Procedure của Central (ngăn lỗi U0003 giả)
  if (!normalized.saga_id && event.saga_id) {
    normalized.saga_id = event.saga_id;
  }
  if (!normalized.ma_giao_dich_global && event.ma_giao_dich_global) {
    normalized.ma_giao_dich_global = event.ma_giao_dich_global;
  }
  if (!normalized.ma_phieu_dc && event.aggregate_id) {
    normalized.ma_phieu_dc = event.aggregate_id;
  }

  if (event.event_type === 'TRANSFER_SHIPPED') {
    // Ánh xạ ma_kho sang kho_xuat theo schema của sp_create_vwh_transfer
    if (!normalized.kho_xuat && normalized.ma_kho) {
      normalized.kho_xuat = normalized.ma_kho;
    }
  } else if (event.event_type === 'TRANSFER_RECEIVED') {
    // Ánh xạ ma_kho sang kho_nhap theo schema của sp_process_transfer_received
    if (!normalized.kho_nhap && normalized.ma_kho) {
      normalized.kho_nhap = normalized.ma_kho;
    }
  }

  return normalized;
}

/**
 * Phân loại lỗi từ PostgreSQL hoặc Network để quyết định chiến lược retry.
 */
export function classifyRelayError(err: any): { errorType: RelayErrorType; sqlState?: string } {
  const code = err?.code;
  const message = err?.message || String(err || '');

  if (code === 'U0003') {
    return { errorType: 'PAYLOAD_CONFLICT_U0003', sqlState: 'U0003' };
  }
  if (code === 'U0004') {
    return { errorType: 'MISSING_VWH_U0004', sqlState: 'U0004' };
  }

  // Lỗi mạng, connection pool, socket drop hoặc timeout tạm thời
  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EHOSTUNREACH' ||
    code === '57P01' || // admin_shutdown
    code === '57P03' || // cannot_connect_now
    code === '08006' || // connection_failure
    code === '08001' || // sqlclient_unable_to_establish_sqlconnection
    code === '08003' || // connection_does_not_exist
    code === '08000' || // connection_exception
    code === '40001' || // serialization_failure
    code === '40P01' || // deadlock_detected
    code === '53300' || // too_many_connections
    message.includes('timeout') ||
    message.includes('Connection terminated') ||
    message.includes('socket hang up')
  ) {
    return { errorType: 'RETRYABLE_NETWORK', sqlState: code };
  }

  // Lỗi kiểm tra tính hợp lệ dữ liệu (validation error - poison payload)
  if (
    message.includes('Số lượng xuất không hợp lệ') ||
    message.includes('Số lượng thực nhận không hợp lệ') ||
    message.includes('Thiếu định danh bắt buộc')
  ) {
    return { errorType: 'BUSINESS_ERROR', sqlState: code };
  }

  // Lỗi nghiệp vụ từ Stored Procedure (RAISE EXCEPTION mặc định trả về P0001)
  if (code === 'P0001' || code === '23503' || code === '23514') {
    return { errorType: 'BUSINESS_ERROR', sqlState: code };
  }

  return { errorType: 'UNKNOWN', sqlState: code };
}

/**
 * Relay một sự kiện duy nhất sang Central và cập nhật trạng thái Outbox trên Node.
 */
export async function relaySingleEvent(
  nodePool: Pool,
  centralPool: Pool,
  event: OutboxEvent
): Promise<RelayResult> {
  // 1. Chỉ chấp nhận relay TRANSFER_SHIPPED và TRANSFER_RECEIVED
  if (event.event_type !== 'TRANSFER_SHIPPED' && event.event_type !== 'TRANSFER_RECEIVED') {
    return {
      eventId: event.event_id,
      eventType: event.event_type,
      success: false,
      errorType: 'BUSINESS_ERROR',
      errorMessage: `Sự kiện ${event.event_type} không thuộc phạm vi relay lên Central. Bỏ qua có kiểm soát.`,
    };
  }

  const normalizedPayload = normalizePayloadForCentral(event);
  const sagaId = event.saga_id || normalizedPayload.saga_id;
  const globalId = event.ma_giao_dich_global || normalizedPayload.ma_giao_dich_global;
  const maPhieuDc = event.aggregate_id || normalizedPayload.ma_phieu_dc;

  if (!sagaId || !globalId || !maPhieuDc) {
    const errorMsg = `Thiếu định danh bắt buộc: saga_id=${sagaId}, global_id=${globalId}, ma_phieu_dc=${maPhieuDc}`;
    const occUpdated = await markOutboxFailed(nodePool, event.event_id, event.version, errorMsg);
    if (!occUpdated) {
      return {
        eventId: event.event_id,
        eventType: event.event_type,
        success: false,
        errorType: 'OCC_LOST_OWNERSHIP',
        errorMessage: `Mất quyền sở hữu claim khi xác thực định danh: event_id=${event.event_id}, claimedVersion=${event.version}. Bản ghi đã bị thay đổi. Lỗi gốc: ${errorMsg}`,
        occSuccess: false,
      };
    }
    return {
      eventId: event.event_id,
      eventType: event.event_type,
      success: false,
      errorType: 'BUSINESS_ERROR',
      errorMessage: errorMsg,
      occSuccess: true,
    };
  }

  try {
    let vwhId: number | string | undefined;

    // 2. Gọi Central Stored Procedure tương ứng với overload 6 tham số
    if (event.event_type === 'TRANSFER_SHIPPED') {
      const soLuongXuat = Number(normalizedPayload.so_luong);
      if (isNaN(soLuongXuat) || soLuongXuat <= 0) {
        throw new Error(`Số lượng xuất không hợp lệ trong payload: ${normalizedPayload.so_luong}`);
      }

      const res = await centralPool.query(
        `SELECT sp_create_vwh_transfer($1::uuid, $2::jsonb, $3::uuid, $4::uuid, $5::varchar, $6::int) AS vwh_id`,
        [event.event_id, JSON.stringify(normalizedPayload), sagaId, globalId, maPhieuDc, soLuongXuat]
      );
      vwhId = res.rows[0]?.vwh_id;
    } else if (event.event_type === 'TRANSFER_RECEIVED') {
      const soLuongThucNhan = Number(normalizedPayload.so_luong_thuc_nhan);
      if (isNaN(soLuongThucNhan) || soLuongThucNhan <= 0) {
        throw new Error(
          `Số lượng thực nhận không hợp lệ trong payload: ${normalizedPayload.so_luong_thuc_nhan}`
        );
      }

      await centralPool.query(
        `SELECT sp_process_transfer_received($1::uuid, $2::jsonb, $3::uuid, $4::uuid, $5::varchar, $6::int)`,
        [event.event_id, JSON.stringify(normalizedPayload), sagaId, globalId, maPhieuDc, soLuongThucNhan]
      );
    }

    // 3. Central xác nhận thành công -> Cập nhật Outbox trên Node thành PROCESSED với OCC
    const occUpdated = await markOutboxProcessed(nodePool, event.event_id, event.version);
    if (!occUpdated) {
      return {
        eventId: event.event_id,
        eventType: event.event_type,
        success: false,
        vwhId,
        errorType: 'OCC_LOST_OWNERSHIP',
        errorMessage: `Mất quyền sở hữu claim: event_id=${event.event_id}, claimedVersion=${event.version}. Bản ghi đã bị thay đổi hoặc reclaim.`,
        occSuccess: false,
      };
    }

    return {
      eventId: event.event_id,
      eventType: event.event_type,
      success: true,
      vwhId,
      occSuccess: true,
    };
  } catch (err: any) {
    const classification = classifyRelayError(err);
    const errorMessage = err?.message || String(err);

    // 4. Xử lý cập nhật Outbox dựa trên loại lỗi với OCC
    let occUpdated = false;
    if (
      classification.errorType === 'PAYLOAD_CONFLICT_U0003' ||
      classification.errorType === 'MISSING_VWH_U0004' ||
      classification.errorType === 'BUSINESS_ERROR'
    ) {
      // Lỗi bất biến / Fatal: Chuyển FAILED ngay lập tức, không retry vô hạn
      occUpdated = await markOutboxFailed(nodePool, event.event_id, event.version, errorMessage);
    } else if (classification.errorType === 'RETRYABLE_NETWORK') {
      // Lỗi mạng tạm thời: Giữ khả năng retry (tăng retry_count, tính next_retry_at)
      occUpdated = await markOutboxRetry(
        nodePool,
        event.event_id,
        event.version,
        event.retry_count,
        event.max_retry_count,
        errorMessage
      );
    } else {
      // Lỗi không xác định: Nếu quá số lần retry thì FAILED, ngược lại PENDING
      occUpdated = await markOutboxRetry(
        nodePool,
        event.event_id,
        event.version,
        event.retry_count,
        event.max_retry_count,
        errorMessage
      );
    }

    if (!occUpdated) {
      return {
        eventId: event.event_id,
        eventType: event.event_type,
        success: false,
        errorType: 'OCC_LOST_OWNERSHIP',
        errorMessage: `Mất quyền sở hữu claim khi xử lý lỗi (${classification.errorType}): event_id=${event.event_id}, claimedVersion=${event.version}. Bản ghi đã bị thay đổi. Lỗi gốc: ${errorMessage}`,
        sqlState: classification.sqlState,
        occSuccess: false,
      };
    }

    return {
      eventId: event.event_id,
      eventType: event.event_type,
      success: false,
      errorType: classification.errorType,
      errorMessage,
      sqlState: classification.sqlState,
      occSuccess: true,
    };
  }
}

/**
 * Cập nhật Outbox thành PROCESSED với điều kiện OCC theo claimedVersion.
 * Trả về true nếu cập nhật thành công (rowCount === 1), false nếu mất quyền sở hữu (rowCount === 0).
 */
export async function markOutboxProcessed(
  pool: Pool,
  eventId: string,
  claimedVersion: number
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE outbox_event
     SET status = 'PROCESSED',
         version = version + 1,
         processed_at = CURRENT_TIMESTAMP,
         error_message = NULL
     WHERE event_id = $1
       AND version = $2
       AND status = 'PROCESSING'`,
    [eventId, claimedVersion]
  );
  return res.rowCount === 1;
}

/**
 * Cập nhật Outbox thành FAILED khi gặp lỗi không thể retry với điều kiện OCC theo claimedVersion.
 * Trả về true nếu cập nhật thành công (rowCount === 1), false nếu mất quyền sở hữu (rowCount === 0).
 */
export async function markOutboxFailed(
  pool: Pool,
  eventId: string,
  claimedVersion: number,
  errorMsg: string
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE outbox_event
     SET status = 'FAILED',
         version = version + 1,
         error_message = $3
     WHERE event_id = $1
       AND version = $2
       AND status = 'PROCESSING'`,
    [eventId, claimedVersion, errorMsg]
  );
  return res.rowCount === 1;
}

/**
 * Cập nhật Outbox để thử lại (Exponential Backoff) khi gặp lỗi mạng với điều kiện OCC theo claimedVersion.
 * Trả về true nếu cập nhật thành công (rowCount === 1), false nếu mất quyền sở hữu (rowCount === 0).
 */
export async function markOutboxRetry(
  pool: Pool,
  eventId: string,
  claimedVersion: number,
  currentRetryCount: number,
  maxRetryCount: number,
  errorMsg: string
): Promise<boolean> {
  const newRetryCount = currentRetryCount + 1;
  const isExceeded = newRetryCount >= maxRetryCount;
  const newStatus = isExceeded ? 'FAILED' : 'PENDING';

  const res = await pool.query(
    `UPDATE outbox_event
     SET status = $3,
         version = version + 1,
         retry_count = $4,
         last_retry_at = CURRENT_TIMESTAMP,
         next_retry_at = CURRENT_TIMESTAMP + (INTERVAL '1 second' * POWER(2, LEAST($4::int, 5))),
         error_message = $5
     WHERE event_id = $1
       AND version = $2
       AND status = 'PROCESSING'`,
    [eventId, claimedVersion, newStatus, newRetryCount, errorMsg]
  );
  return res.rowCount === 1;
}

