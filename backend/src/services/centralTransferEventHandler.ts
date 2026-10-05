import { Pool } from 'pg';
import {
  ApplicationMessage,
  MessageHandler,
  MessageTransport,
} from '../messaging/messageBoundary';
import { pools } from '../config/postgresql';

export interface CentralEventClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
  release(): void;
}

export interface CentralDatabase {
  connect(): Promise<CentralEventClient>;
}

export interface ProcessedEventStore {
  has(eventId: string): Promise<boolean>;
  mark(eventId: string): Promise<void>;
}

export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private readonly processedEventIds = new Set<string>();

  public async has(eventId: string): Promise<boolean> {
    return this.processedEventIds.has(eventId);
  }

  public async mark(eventId: string): Promise<void> {
    this.processedEventIds.add(eventId);
  }
}

export interface SagaTransferRow {
  saga_id: string;
  global_id: string;
  ma_phieu_dc: string;
  kho_xuat: string;
  ma_sp: string;
  so_luong_yeu_cau: number;
  current_state: string;
  status: string;
}

export interface CentralTransferEventHandlerDependencies {
  database: CentralDatabase;
  processedEvents: ProcessedEventStore;
}

export type CentralTransferEventResult =
  | { status: 'PROCESSED'; eventId: string; sagaId: string }
  | { status: 'DUPLICATE'; eventId: string };

type QueryResult<T> = { rows: T[]; rowCount?: number };
type TransferAcceptedPayload = {
  ma_phieu_dc?: unknown;
  ma_kho?: unknown;
  ma_sp?: unknown;
  so_luong?: unknown;
  ma_giao_dich_global?: unknown;
};

const defaultDatabase: CentralDatabase = {
  connect: (): Promise<CentralEventClient> => pools.CENTRAL.connect(),
};

const defaultDependencies: CentralTransferEventHandlerDependencies = {
  database: defaultDatabase,
  processedEvents: new InMemoryProcessedEventStore(),
};

const asPayload = (payload: unknown): TransferAcceptedPayload => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('TRANSFER_ACCEPTED payload không hợp lệ');
  }

  return payload as TransferAcceptedPayload;
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`TRANSFER_ACCEPTED thiếu ${field}`);
  }

  return value;
};

const requirePositiveNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`TRANSFER_ACCEPTED có ${field} không hợp lệ`);
  }

  return value;
};

export class CentralTransferEventHandler {
  private readonly inFlight = new Map<
    string,
    Promise<CentralTransferEventResult>
  >();

  public constructor(
    private readonly dependencies: CentralTransferEventHandlerDependencies = defaultDependencies,
  ) {}

  public async handle(
    message: ApplicationMessage,
  ): Promise<CentralTransferEventResult> {
    const eventId = requireString(message.eventId, 'event_id');

    if (message.messageType !== 'TRANSFER_ACCEPTED') {
      throw new Error(`Event không được hỗ trợ: ${message.messageType}`);
    }

    const existing = this.inFlight.get(eventId);
    if (existing) return existing;

    if (await this.dependencies.processedEvents.has(eventId)) {
      return { status: 'DUPLICATE', eventId };
    }

    const processing = this.process(message, eventId)
      .then(async (result) => {
        await this.dependencies.processedEvents.mark(eventId);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(eventId);
      });

    this.inFlight.set(eventId, processing);
    return processing;
  }

  private async process(
    message: ApplicationMessage,
    eventId: string,
  ): Promise<CentralTransferEventResult> {
    const sagaId = requireString(message.sagaId, 'saga_id');
    const globalId = requireString(message.globalTransactionId, 'global_id');
    const transferId = requireString(message.aggregateId, 'aggregate_id');
    const payload = asPayload(message.payload);
    const payloadTransferId = requireString(payload.ma_phieu_dc, 'ma_phieu_dc');
    const sourceWarehouse = requireString(payload.ma_kho, 'ma_kho');
    const productId = requireString(payload.ma_sp, 'ma_sp');
    const quantity = requirePositiveNumber(payload.so_luong, 'so_luong');

    if (payloadTransferId !== transferId) {
      throw new Error('TRANSFER_ACCEPTED không khớp aggregate_id');
    }

    if (
      payload.ma_giao_dich_global !== undefined &&
      payload.ma_giao_dich_global !== globalId
    ) {
      throw new Error('TRANSFER_ACCEPTED không khớp global_id');
    }

    const client = await this.dependencies.database.connect();

    try {
      await client.query('BEGIN');
      const result = (await client.query(
        `SELECT
           saga_id,
           ma_giao_dich_global AS global_id,
           ma_phieu_dc,
           kho_xuat,
           ma_sp,
           so_luong_yeu_cau,
           current_state,
           status
         FROM saga_transaction
         WHERE saga_id = $1
         FOR UPDATE`,
        [sagaId],
      )) as QueryResult<SagaTransferRow>;

      const saga = result.rows[0];
      if (!saga) {
        throw new Error(`Không tìm thấy Saga ${sagaId}`);
      }

      if (
        saga.global_id !== globalId ||
        saga.ma_phieu_dc !== transferId ||
        saga.kho_xuat.toUpperCase() !== sourceWarehouse.toUpperCase() ||
        saga.ma_sp !== productId ||
        saga.so_luong_yeu_cau !== quantity
      ) {
        throw new Error('TRANSFER_ACCEPTED không thuộc đúng Saga/source transfer');
      }

      if (saga.status !== 'RUNNING') {
        throw new Error(`Saga đang ở trạng thái ${saga.status}`);
      }

      if (saga.current_state === 'SOURCE_ACCEPTED') {
        await client.query('COMMIT');
        return { status: 'DUPLICATE', eventId };
      }

      if (saga.current_state !== 'WAITING_SOURCE_CONFIRMATION') {
        throw new Error(`Saga đang ở state ${saga.current_state}`);
      }

      await client.query(
        `UPDATE saga_transaction
         SET current_state = 'SOURCE_ACCEPTED', updated_at = CURRENT_TIMESTAMP
         WHERE saga_id = $1 AND current_state = 'WAITING_SOURCE_CONFIRMATION'`,
        [sagaId],
      );

      await client.query(
        `UPDATE saga_monitoring
         SET current_state = 'SOURCE_ACCEPTED',
             last_event_type = 'TRANSFER_ACCEPTED',
             last_event_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             error_message = NULL
         WHERE saga_id = $1`,
        [sagaId],
      );

      await client.query('COMMIT');
      return { status: 'PROCESSED', eventId, sagaId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export const registerCentralTransferEventHandler = (
  transport: Pick<MessageTransport, 'subscribe'>,
  handler: MessageHandler,
): (() => void) =>
  transport.subscribe('TRANSFER_ACCEPTED', handler);
