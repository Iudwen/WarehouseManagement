/**
 * types.ts
 * Định nghĩa interfaces và kiểu dữ liệu cho Outbox Relay Worker.
 * Đối chiếu chính xác với schema outbox_event và các stored procedure.
 */

export type OutboxEventStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export type OutboxEventType =
  | 'TRANSFER_SHIPPED'
  | 'TRANSFER_RECEIVED'
  | 'TRANSFER_ACCEPTED'
  | 'TRANSFER_REJECTED';

/**
 * Cấu trúc bản ghi outbox_event từ PostgreSQL của Node DB.
 */
export interface OutboxEvent<T = Record<string, any>> {
  event_id: string; // UUID (Primary Key, Stable)
  saga_id: string | null; // UUID
  ma_giao_dich_global: string | null; // UUID
  event_type: OutboxEventType;
  aggregate_id: string; // ma_phieu_dc
  payload: T; // JSONB
  status: OutboxEventStatus;
  version: number; // INT (OCC)
  retry_count: number;
  max_retry_count: number;
  created_at: Date;
  last_retry_at: Date | null;
  next_retry_at: Date;
  processed_at: Date | null;
  error_message: string | null;
}

/**
 * Payload sự kiện TRANSFER_SHIPPED do sp_ship_transfer sinh ra.
 */
export interface TransferShippedPayload {
  saga_id: string;
  ma_giao_dich_global: string;
  ma_phieu_dc: string;
  ma_kho: string; // Kho xuất
  ma_sp: string;
  so_luong: number;
  ton_truoc: number;
  ton_sau: number;
  event_time: string;
  kho_xuat?: string; // Bổ sung chuẩn hóa khi relay sang Central SP
}

/**
 * Payload sự kiện TRANSFER_RECEIVED do sp_receive_transfer sinh ra.
 */
export interface TransferReceivedPayload {
  saga_id: string;
  ma_giao_dich_global: string;
  ma_phieu_dc: string;
  ma_kho: string; // Kho nhập
  ma_sp: string;
  so_luong_thuc_nhan: number;
  ton_truoc: number;
  ton_sau: number;
  event_time: string;
  kho_nhap?: string; // Bổ sung chuẩn hóa khi relay sang Central SP
}

/**
 * Phân loại kết quả và lỗi khi relay tới Central SP.
 */
export type RelayErrorType =
  | 'PAYLOAD_CONFLICT_U0003' // SQLSTATE U0003: Payload bất nhất (Poison message)
  | 'MISSING_VWH_U0004'      // SQLSTATE U0004: Event có nhưng VWH thiếu
  | 'RETRYABLE_NETWORK'      // Mất kết nối, timeout, deadlock
  | 'BUSINESS_ERROR'         // Số lượng không hợp lệ, Saga không ở trạng thái RUNNING
  | 'OCC_LOST_OWNERSHIP'     // Mất quyền claim hoặc version không khớp khi cập nhật Outbox
  | 'UNKNOWN';

export interface RelayResult {
  eventId: string;
  eventType: OutboxEventType;
  success: boolean;
  vwhId?: number | string;
  errorType?: RelayErrorType;
  errorMessage?: string;
  sqlState?: string;
  isIdempotentReplay?: boolean;
  occSuccess?: boolean;
}

/**
 * Cấu hình thực thi Worker.
 */
export interface WorkerConfig {
  nodeName: string;
  batchSize: number;
  pollIntervalMs: number;
  dryRun: boolean;
  once: boolean;
  whitelistEventIds?: string[];
  requireWhitelist?: boolean;
  /** @deprecated Không còn cần thiết khi các sự kiện cũ đã được cách ly qua quarantine (next_retry_at = 2099) */
  allowUnsafeAllPending?: boolean;
  /** @deprecated Bộ lọc createdAfter đã được loại bỏ khỏi luồng chọn sự kiện chuẩn sau khi cách ly dữ liệu cũ (Quarantine) */
  createdAfter?: Date;
  leaseTimeoutSeconds?: number;
  maxShutdownWaitMs?: number;
}
