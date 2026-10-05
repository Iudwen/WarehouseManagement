import {
  ApplicationMessage,
  MessageTransport,
  TransactionClient,
} from './messageBoundary';

export interface OutboxConnection extends TransactionClient {
  release(): void;
}

export interface OutboxDatabase {
  connect(): Promise<OutboxConnection>;
}

export interface OutboxEventRow {
  event_id: string;
  saga_id: string | null;
  ma_giao_dich_global: string | null;
  event_type: string;
  aggregate_id: string;
  payload: unknown;
  status: 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
  retry_count: number;
  created_at: Date | string;
  processed_at: Date | string | null;
  error_message: string | null;
}

export type RelayResult =
  | { status: 'EMPTY' }
  | { status: 'PROCESSED'; eventId: string }
  | { status: 'RETRYABLE'; eventId: string; error: string };

type QueryResult<T> = { rows: T[] };

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const toApplicationMessage = (event: OutboxEventRow): ApplicationMessage => ({
  messageType: event.event_type,
  aggregateId: event.aggregate_id,
  payload:
    typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
  eventId: event.event_id,
  sagaId: event.saga_id || undefined,
  globalTransactionId: event.ma_giao_dich_global || undefined,
});

export class OutboxRelay {
  public constructor(
    private readonly database: OutboxDatabase,
    private readonly transport: MessageTransport,
  ) {}

  public async processNext(): Promise<RelayResult> {
    const client = await this.database.connect();

    try {
      await client.query('BEGIN');

      const result = (await client.query(`
        SELECT
          event_id,
          saga_id,
          ma_giao_dich_global,
          event_type,
          aggregate_id,
          payload,
          status,
          retry_count,
          created_at
        FROM outbox_event
        WHERE status = 'PENDING'
        ORDER BY created_at ASC, event_id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `)) as QueryResult<OutboxEventRow>;

      const event = result.rows[0];
      if (!event) {
        await client.query('COMMIT');
        return { status: 'EMPTY' };
      }

      await client.query(
        `UPDATE outbox_event
         SET status = 'PROCESSING'
         WHERE event_id = $1 AND status = 'PENDING'`,
        [event.event_id],
      );

      try {
        await this.transport.publish(toApplicationMessage(event));
        await client.query(
          `UPDATE outbox_event
           SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP, error_message = NULL
           WHERE event_id = $1 AND status = 'PROCESSING'`,
          [event.event_id],
        );
        await client.query('COMMIT');
        return { status: 'PROCESSED', eventId: event.event_id };
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        await client.query(
          `UPDATE outbox_event
           SET status = 'PENDING', retry_count = retry_count + 1, error_message = $2
           WHERE event_id = $1 AND status = 'PROCESSING'`,
          [event.event_id, errorMessage],
        );
        await client.query('COMMIT');
        return { status: 'RETRYABLE', eventId: event.event_id, error: errorMessage };
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
