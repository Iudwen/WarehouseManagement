import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool, PoolClient } from 'pg';
import { ApplicationMessage } from '../messaging/messageBoundary';
import {
  CentralTransferCompletedHandlerDependencies,
  ProcessedEventStore,
  TransferCompletedPayload,
  handleTransferCompletedEvent,
} from './centralTransferCompletedEventHandler';

class FakeProcessedEventStore implements ProcessedEventStore {
  public processedEvents = new Set();

  public async isProcessed(eventId: string): Promise {
    return this.processedEvents.has(eventId);
  }

  public async markProcessed(eventId: string): Promise {
    this.processedEvents.add(eventId);
  }
}

class FakeClient {
  public queries: Array<{ text: string; values?: unknown[] }> = [];
  public inTransaction = false;
  public isReleased = false;
  public failOnQuery = false;

  public sagaRow: any = {
    saga_id: '00000000-0000-0000-0000-000000000101',
    global_id: '00000000-0000-0000-0000-000000000102',
    ma_phieu_dc: 'DC_TASK_38',
    kho_xuat: 'HN01',
    kho_nhap: 'HCM01',
    ma_sp: 'SP001',
    so_luong_yeu_cau: 20,
    current_state: 'IN_TRANSIT',
    status: 'RUNNING',
  };

  async query(text: string, values?: unknown[]): Promise {
    this.queries.push({ text, values });

    if (this.failOnQuery && text !== 'ROLLBACK') {
      throw new Error('Database connection failed during update');
    }

    if (text === 'BEGIN') {
      this.inTransaction = true;
      return { rows: [] };
    }
    if (text === 'COMMIT' || text === 'ROLLBACK') {
      this.inTransaction = false;
      return { rows: [] };
    }

    if (text.includes('SELECT') && text.includes('FROM saga_transaction')) {
      if (this.sagaRow === null) {
        return { rows: [] };
      }
      return { rows: [this.sagaRow] };
    }

    if (
      text.includes('UPDATE saga_transaction') ||
      text.includes('UPDATE saga_monitoring') ||
      text.includes('UPDATE dieu_chuyen_central')
    ) {
      return { rowCount: 1 };
    }

    return { rows: [] };
  }

  release() {
    this.isReleased = true;
  }
}

class FakePool {
  constructor(public client: FakeClient) {}
  async connect(): Promise {
    return this.client as unknown as PoolClient;
  }
}

const defaultPayload: TransferCompletedPayload = {
  saga_id: '00000000-0000-0000-0000-000000000101',
  global_id: '00000000-0000-0000-0000-000000000102',
  ma_phieu_dc: 'DC_TASK_38',
  kho_xuat: 'HN01',
  kho_nhap: 'HCM01',
  ma_sp: 'SP001',
  so_luong: 20,
};

const defaultMessage: ApplicationMessage = {
  messageId: 'MSG_001',
  eventId: 'EVT_COMPLETED_001',
  messageType: 'TRANSFER_COMPLETED',
  payload: defaultPayload,
  occurredAt: new Date().toISOString(),
};

test('successfully processes TRANSFER_COMPLETED event (IN_TRANSIT -> COMPLETED, RUNNING -> SUCCESS)', async () => {
  const client = new FakeClient();
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  await handleTransferCompletedEvent(defaultMessage, { centralPool: pool, eventStore });

  assert.equal(client.isReleased, true);
  assert.ok(eventStore.processedEvents.has('EVT_COMPLETED_001'));

  const updateSagaTx = client.queries.find((q) => q.text.includes('UPDATE saga_transaction'));
  assert.ok(updateSagaTx);
  assert.ok(updateSagaTx.text.includes("current_state = 'COMPLETED'"));
  assert.ok(updateSagaTx.text.includes("status = 'SUCCESS'"));

  const updateSagaMon = client.queries.find((q) => q.text.includes('UPDATE saga_monitoring'));
  assert.ok(updateSagaMon);
  assert.ok(updateSagaMon.text.includes("current_state = 'COMPLETED'"));
  assert.ok(updateSagaMon.text.includes("status = 'SUCCESS'"));
  assert.ok(updateSagaMon.text.includes("last_event_type = 'TRANSFER_COMPLETED'"));

  const updateCentral = client.queries.find((q) => q.text.includes('UPDATE dieu_chuyen_central'));
  assert.ok(updateCentral);
  assert.ok(updateCentral.text.includes("trang_thai = 'HOAN_THANH'"));
});

test('rejects message with invalid messageType', async () => {
  const client = new FakeClient();
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  const invalidMsg = { ...defaultMessage, messageType: 'TRANSFER_SHIPPED' as any };

  await assert.rejects(
    () => handleTransferCompletedEvent(invalidMsg, { centralPool: pool, eventStore }),
    /Message type không hợp lệ/,
  );
});

test('rejects message when payload fields are missing', async () => {
  const client = new FakeClient();
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  const invalidMsg = { ...defaultMessage, payload: { ...defaultPayload, saga_id: '' } };

  await assert.rejects(
    () => handleTransferCompletedEvent(invalidMsg, { centralPool: pool, eventStore }),
    /TRANSFER_COMPLETED payload thiếu thông tin bắt buộc/,
  );
});

test('rejects when Saga transaction does not exist', async () => {
  const client = new FakeClient();
  client.sagaRow = null;
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  await assert.rejects(
    () => handleTransferCompletedEvent(defaultMessage, { centralPool: pool, eventStore }),
    /Không tìm thấy Saga cho phiếu/,
  );
});

test('rejects when saga_id mismatch', async () => {
  const client = new FakeClient();
  client.sagaRow.saga_id = '00000000-0000-0000-0000-999999999999';
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  await assert.rejects(
    () => handleTransferCompletedEvent(defaultMessage, { centralPool: pool, eventStore }),
    /saga_id không khớp/,
  );
});

test('rejects when global_id mismatch', async () => {
  const client = new FakeClient();
  client.sagaRow.global_id = '00000000-0000-0000-0000-999999999999';
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  await assert.rejects(
    () => handleTransferCompletedEvent(defaultMessage, { centralPool: pool, eventStore }),
    /global_id không khớp/,
  );
});

test('rejects when warehouse mismatch (kho_xuat or kho_nhap)', async () => {
  const client = new FakeClient();
  client.sagaRow.kho_nhap = 'DN01';
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  await assert.rejects(
    () => handleTransferCompletedEvent(defaultMessage, { centralPool: pool, eventStore }),
    /kho_nhap không khớp/,
  );
});

test('rejects when product or quantity mismatch', async () => {
  const client = new FakeClient();
  client.sagaRow.so_luong_yeu_cau = 50;
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  await assert.rejects(
    () => handleTransferCompletedEvent(defaultMessage, { centralPool: pool, eventStore }),
    /so_luong không khớp/,
  );
});

test('rejects when Saga status is not RUNNING', async () => {
  const client = new FakeClient();
  client.sagaRow.status = 'CANCELLED';
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  await assert.rejects(
    () => handleTransferCompletedEvent(defaultMessage, { centralPool: pool, eventStore }),
    /Saga status không phải RUNNING/,
  );
});

test('rejects when Saga current_state is not IN_TRANSIT', async () => {
  const client = new FakeClient();
  client.sagaRow.current_state = 'SOURCE_ACCEPTED';
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  await assert.rejects(
    () => handleTransferCompletedEvent(defaultMessage, { centralPool: pool, eventStore }),
    /Saga state không phải IN_TRANSIT/,
  );
});

test('skips processing cleanly when eventId is already processed (Idempotency)', async () => {
  const client = new FakeClient();
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();
  eventStore.processedEvents.add('EVT_COMPLETED_001');

  await handleTransferCompletedEvent(defaultMessage, { centralPool: pool, eventStore });

  assert.equal(client.queries.length, 0);
  assert.equal(client.isReleased, false);
});

test('rolls back and does NOT mark event processed on DB failure', async () => {
  const client = new FakeClient();
  client.failOnQuery = true;
  const pool = new FakePool(client) as unknown as Pool;
  const eventStore = new FakeProcessedEventStore();

  await assert.rejects(
    () => handleTransferCompletedEvent(defaultMessage, { centralPool: pool, eventStore }),
    /Database connection failed during update/,
  );

  assert.ok(!eventStore.processedEvents.has('EVT_COMPLETED_001'));
  assert.equal(client.isReleased, true);
});