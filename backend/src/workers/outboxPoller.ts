/**
 * outboxPoller.ts
 * Module Claiming Engine độc lập cho Outbox Worker.
 * Thực hiện claim hai pha: Transaction ngắn với SELECT ... FOR UPDATE SKIP LOCKED
 * và cập nhật OCC version + status = 'PROCESSING'.
 */

import { Pool } from 'pg';
import { OutboxEvent } from './types';

export interface ClaimOptions {
  limit?: number;
  whitelistEventIds?: string[];
  requireWhitelist?: boolean;
  allowedEventTypes?: string[];
  /** @deprecated Đã loại bỏ khỏi luồng chọn sự kiện chuẩn sau khi hoàn tất quarantine dữ liệu cũ */
  createdAfter?: Date;
}

/**
 * Claim một batch outbox events sẵn sàng xử lý.
 * Bắt buộc có whitelistEventIds trong chế độ kiểm thử để bảo vệ dữ liệu tồn đọng.
 */
export async function claimEvents(
  pool: Pool,
  options: ClaimOptions = {}
): Promise<OutboxEvent[]> {
  const requireWhitelist = options.requireWhitelist === true;
  const whitelist = options.whitelistEventIds;
  const allowedTypes = options.allowedEventTypes || ['TRANSFER_SHIPPED', 'TRANSFER_RECEIVED'];

  // Bảo vệ bắt buộc: Nếu chế độ whitelist được bật nhưng không cung cấp ID -> Từ chối claim
  if (requireWhitelist) {
    if (!whitelist || !Array.isArray(whitelist) || whitelist.length === 0) {
      throw new Error(
        'Claim bị từ chối: Bắt buộc cung cấp whitelistEventIds hợp lệ để bảo vệ dữ liệu tồn đọng.'
      );
    }
  }

  const client = await pool.connect();
  const limit = options.limit && options.limit > 0 ? options.limit : 10;

  try {
    await client.query('BEGIN');

    // 1. SELECT ... FOR UPDATE SKIP LOCKED trong transaction ngắn
    let selectQuery: string;
    let queryParams: any[];

    if (whitelist && whitelist.length > 0) {
      selectQuery = `
        SELECT event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id,
               payload, status, version, retry_count, max_retry_count, created_at,
               last_retry_at, next_retry_at, processed_at, error_message
        FROM outbox_event
        WHERE status = 'PENDING'
          AND next_retry_at <= CURRENT_TIMESTAMP
          AND event_id = ANY($1::uuid[])
          AND event_type = ANY($2::varchar[])
        ORDER BY created_at ASC
        LIMIT $3
        FOR UPDATE SKIP LOCKED;
      `;
      queryParams = [whitelist, allowedTypes, limit];
    } else {
      selectQuery = `
        SELECT event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id,
               payload, status, version, retry_count, max_retry_count, created_at,
               last_retry_at, next_retry_at, processed_at, error_message
        FROM outbox_event
        WHERE status = 'PENDING'
          AND next_retry_at <= CURRENT_TIMESTAMP
          AND event_type = ANY($1::varchar[])
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED;
      `;
      queryParams = [allowedTypes, limit];
    }

    const selectRes = await client.query(selectQuery, queryParams);
    const claimed = selectRes.rows as OutboxEvent[];

    if (claimed.length === 0) {
      await client.query('COMMIT');
      return [];
    }

    // 2. Cập nhật OCC: Tăng version, gán status='PROCESSING', ghi last_retry_at
    const eventIds = claimed.map((e) => e.event_id);
    const expectedVersions = claimed.map((e) => e.version);

    const updateQuery = `
      UPDATE outbox_event o
      SET status = 'PROCESSING',
          version = o.version + 1,
          last_retry_at = CURRENT_TIMESTAMP
      FROM (
        SELECT unnest($1::uuid[]) AS event_id, unnest($2::int[]) AS expected_version
      ) c
      WHERE o.event_id = c.event_id
        AND o.version = c.expected_version
        AND o.status = 'PENDING';
    `;

    const updateRes = await client.query(updateQuery, [eventIds, expectedVersions]);

    // Kiểm tra tính nhất quán: Số dòng cập nhật phải khớp số dòng đã khóa
    if (updateRes.rowCount !== claimed.length) {
      await client.query('ROLLBACK');
      throw new Error(
        `Xung đột Optimistic Concurrency: Đã chọn ${claimed.length} dòng nhưng chỉ cập nhật được ${updateRes.rowCount} dòng. Đã rollback toàn bộ.`
      );
    }

    await client.query('COMMIT');

    // Trả về danh sách event với trạng thái đã được cập nhật
    return claimed.map((e) => ({
      ...e,
      status: 'PROCESSING' as const,
      version: e.version + 1,
      last_retry_at: new Date(),
    }));
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Bỏ qua lỗi rollback nếu kết nối đã bị đóng
    }
    throw err;
  } finally {
    client.release();
  }
}

export interface ReapOptions {
  leaseTimeoutSeconds?: number;
  limit?: number;
  whitelistEventIds?: string[];
  requireWhitelist?: boolean;
  /** @deprecated Đã loại bỏ khỏi luồng chọn sự kiện chuẩn sau khi hoàn tất quarantine dữ liệu cũ */
  createdAfter?: Date;
}

export interface ReapResult {
  reclaimedCount: number;
  reclaimedEventIds: string[];
}

/**
 * Thu hồi các event bị treo ở trạng thái PROCESSING do Worker crash hoặc lease hết hạn.
 * Chuyển PROCESSING -> PENDING, tăng version (OCC) và đặt next_retry_at = CURRENT_TIMESTAMP.
 * Transaction ngắn, SELECT ... FOR UPDATE SKIP LOCKED để tránh deadlock và xung đột giữa nhiều Reaper.
 */
export async function reapExpiredLeases(
  pool: Pool,
  options: ReapOptions = {}
): Promise<ReapResult> {
  const requireWhitelist = options.requireWhitelist === true;
  const whitelist = options.whitelistEventIds;
  const leaseTimeoutSeconds = options.leaseTimeoutSeconds && options.leaseTimeoutSeconds > 0
    ? options.leaseTimeoutSeconds
    : 300; // Mặc định 5 phút (300s)
  const limit = options.limit && options.limit > 0 ? options.limit : 50;

  // Bảo vệ bắt buộc trong chế độ test: Từ chối nếu requireWhitelist = true mà không có whitelist
  if (requireWhitelist) {
    if (!whitelist || !Array.isArray(whitelist) || whitelist.length === 0) {
      throw new Error(
        'Reaper bị từ chối: Bắt buộc cung cấp whitelistEventIds hợp lệ để bảo vệ dữ liệu tồn đọng.'
      );
    }
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Khóa và chọn các event PROCESSING đã hết hạn lease bằng SELECT ... FOR UPDATE SKIP LOCKED
    let selectQuery: string;
    let queryParams: any[];

    if (whitelist && whitelist.length > 0) {
      selectQuery = `
        SELECT event_id, version
        FROM outbox_event
        WHERE status = 'PROCESSING'
          AND COALESCE(last_retry_at, created_at) < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 second')
          AND event_id = ANY($2::uuid[])
        ORDER BY last_retry_at ASC
        LIMIT $3
        FOR UPDATE SKIP LOCKED;
      `;
      queryParams = [leaseTimeoutSeconds, whitelist, limit];
    } else {
      selectQuery = `
        SELECT event_id, version
        FROM outbox_event
        WHERE status = 'PROCESSING'
          AND COALESCE(last_retry_at, created_at) < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 second')
        ORDER BY last_retry_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED;
      `;
      queryParams = [leaseTimeoutSeconds, limit];
    }

    const selectRes = await client.query(selectQuery, queryParams);
    const expiredEvents = selectRes.rows as { event_id: string; version: number }[];

    if (expiredEvents.length === 0) {
      await client.query('COMMIT');
      return { reclaimedCount: 0, reclaimedEventIds: [] };
    }

    // 2. Cập nhật OCC: Tăng version, chuyển về PENDING, đặt next_retry_at = CURRENT_TIMESTAMP
    const eventIds = expiredEvents.map((e) => e.event_id);
    const expectedVersions = expiredEvents.map((e) => e.version);

    const updateQuery = `
      UPDATE outbox_event o
      SET status = 'PENDING',
          version = o.version + 1,
          next_retry_at = CURRENT_TIMESTAMP,
          error_message = 'Reclaimed by reaper: lease expired'
      FROM (
        SELECT unnest($1::uuid[]) AS event_id, unnest($2::int[]) AS expected_version
      ) c
      WHERE o.event_id = c.event_id
        AND o.version = c.expected_version
        AND o.status = 'PROCESSING';
    `;

    const updateRes = await client.query(updateQuery, [eventIds, expectedVersions]);

    if (updateRes.rowCount !== expiredEvents.length) {
      await client.query('ROLLBACK');
      throw new Error(
        `Xung đột OCC Reaper: Đã khóa ${expiredEvents.length} dòng nhưng chỉ cập nhật được ${updateRes.rowCount} dòng. Đã rollback.`
      );
    }

    await client.query('COMMIT');

    return {
      reclaimedCount: updateRes.rowCount,
      reclaimedEventIds: eventIds,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Bỏ qua lỗi rollback
    }
    throw err;
  } finally {
    client.release();
  }
}

