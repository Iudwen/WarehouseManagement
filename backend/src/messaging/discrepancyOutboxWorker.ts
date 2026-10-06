import { Pool } from 'pg';
import { getDbPool } from '../config/postgresql';
import {
  handleCentralTransferCompletedWithDiscrepancy,
} from '../services/centralTransferDiscrepancyEventHandler';

type NodeCode = 'HN' | 'DN' | 'HCM';

interface OutboxEvent {
  event_id: string;
  saga_id: string | null;
  ma_giao_dich_global: string | null;
  event_type: string;
  aggregate_id: string;
  payload: unknown;
}

const NODE_CODES: NodeCode[] = ['HN', 'DN', 'HCM'];

const getNodePool = (node: NodeCode): Pool => {
  const warehouseByNode: Record<NodeCode, string> = {
    HN: 'HN01',
    DN: 'DN01',
    HCM: 'HCM01',
  };

  return getDbPool(warehouseByNode[node]);
};

const processOneNode = async (node: NodeCode): Promise<boolean> => {
  const pool = getNodePool(node);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT
         event_id,
         saga_id,
         ma_giao_dich_global,
         event_type,
         aggregate_id,
         payload
       FROM outbox_event
       WHERE status = 'PENDING'
         AND event_type = 'TRANSFER_COMPLETED_WITH_DISCREPANCY'
       ORDER BY created_at ASC, event_id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );

    const event = result.rows[0] as OutboxEvent | undefined;

    if (!event) {
      await client.query('COMMIT');
      return false;
    }

    // Đánh dấu PROCESSING trước khi xử lý
    await client.query(
      `UPDATE outbox_event
       SET status = 'PROCESSING'
       WHERE event_id = $1
         AND status = 'PENDING'`,
      [event.event_id],
    );

    await client.query('COMMIT');

    try {
      const payload =
        typeof event.payload === 'string'
          ? JSON.parse(event.payload)
          : event.payload;

      // Gửi event vào Central Handler
      await handleCentralTransferCompletedWithDiscrepancy(
        payload as any,
      );

      // Central xử lý thành công -> đánh dấu event đã xử lý
      await client.query(
        `UPDATE outbox_event
         SET status = 'PROCESSED',
             processed_at = CURRENT_TIMESTAMP,
             error_message = NULL
         WHERE event_id = $1
           AND status = 'PROCESSING'`,
        [event.event_id],
      );

      console.log(
        `[OUTBOX] ${node} -> CENTRAL: processed discrepancy event ${event.event_id}`,
      );

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      // Nếu Central xử lý lỗi -> cho event quay lại PENDING
      // để lần polling sau retry
      await client.query(
        `UPDATE outbox_event
         SET status = 'PENDING',
             retry_count = retry_count + 1,
             error_message = $2
         WHERE event_id = $1
           AND status = 'PROCESSING'`,
        [event.event_id, message],
      );

      console.error(
        `[OUTBOX] ${node} discrepancy event ${event.event_id} failed:`,
        message,
      );

      return false;
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const processPendingDiscrepancyEvents =
  async (): Promise<void> => {
    for (const node of NODE_CODES) {
      try {
        await processOneNode(node);
      } catch (error) {
        console.error(
          `[OUTBOX] Error polling ${node} outbox:`,
          error,
        );
      }
    }
  };

export const startDiscrepancyOutboxWorker =
  (): NodeJS.Timeout => {
    const intervalMs = Number(
      process.env.OUTBOX_POLL_INTERVAL_MS || 3000,
    );

    // Chạy ngay một lần khi backend start
    void processPendingDiscrepancyEvents();

    // Sau đó polling mỗi 3 giây
    return setInterval(() => {
      void processPendingDiscrepancyEvents();
    }, intervalMs);
  };