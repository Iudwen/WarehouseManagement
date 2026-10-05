import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationMessage } from '../messaging/messageBoundary';
import {
  ProcessedEventStore,
  TransferShippedPayload,
  handleTransferShippedEvent,
} from './centralTransferShippedEventHandler';

type QueryCall = { text: string; values: unknown[] };

class FakeClient {
  public readonly calls: QueryCall[] = [];
  public shouldFailUpdate = false;
  public mockSagaRow: any = null;

  public async query(text: string, values: unknown[] = []): Promise {
    this.calls.push({ text, values });

    if (text.includes('SELECT') && text.includes('FROM saga_transaction')) {
      if (!this.mockSagaRow) {
        return { rows: [] };
      }
      return { rows: [this.mockSagaRow] };
    }

    if (text.includes('UPDATE saga_transaction')) {
      if (this.shouldFailUpdate) {
        throw new Error('Database connection failed during UPDATE');
      }
      return { rowCount: 1 };
    }

    return { rows: [] };
  }

  public release(): void {}
}

class FakeCentralPool {
  public constructor(public readonly client: FakeClient) {}

  public async connect(): Promise {
    return this.client;
  }
}

class InMemoryProcessedEventStore implements ProcessedEventStore {
  public processedSet = new Set();

  public async isProcessed(eventId: string): Promise {
    return this.processedSet.has(eventId);
  }

  public async markProcessed(eventId: string): Promise {
    this.processedSet.add(eventId);
  }
}

const validPayload: TransferShippedPayload = {
  saga_id: '00000000-0000-0000-0000-000000000001',
  global_id: '00000000-0000-0000-0000-000000000002',
  ma_phieu_dc: 'DC_36_TEST',
  kho_xuat: 'HN01',
  kho_nhap: 'HCM01',
  ma_sp: 'SP001',
  so_luong: 50,
};

const validMessage: ApplicationMessage = {
  eventId: 'evt-36-001',
  messageType: 'TRANSFER_SHIPPED',
  aggregateId: 'DC_36_TEST',
  payload: validPayload,
};

const validSagaRow = {
  saga_id: '00000000-0000-0000-0000-000000000001',
  global_id: '00000000-0000-0000-0000-000000000002',
  ma_phieu_dc: 'DC_36_TEST',
  kho_xuat: 'HN01',
  kho_nhap: 'HCM01',
  ma_sp: 'SP001',
  so_luong_yeu_cau: 50,
  current_state: 'SOURCE_ACCEPTED',
  status: 'RUNNING',
};

test('successfully processes TRANSFER_SHIPPED event (SOURCE_ACCEPTED -> IN_TRANSIT)', async () => {
  const client = new FakeClient();
  client.mockSagaRow = { ...validSagaRow };
  const pool = new FakeCentralPool(client) as any;
  const eventStore = new InMemoryProcessedEventStore();

  await handleTransferShippedEvent(validMessage, { centralPool: pool, eventStore });

  assert.equal(client.calls[0].text, 'BEGIN');
  assert.equal(client.calls.at(-2)?.text.includes('UPDATE saga_monitoring'), true);
  assert.equal(client.calls.at(-1)?.text, 'COMMIT');
  assert.equal(await eventStore.isProcessed('evt-36-001'), true);
});

test('rejects message with invalid messageType', async () => {
  const client = new FakeClient();
  const pool = new FakeCentralPool(client) as any;
  const eventStore = new InMemoryProcessedEventStore();

  const invalidMsg = { ...validMessage, messageType: 'TRANSFER_ACCEPTED' };

  await assert.rejects(
    () => handleTransferShippedEvent(invalidMsg, { centralPool: pool, eventStore }),
    /Message type không hợp lệ/,
  );
});

test('rejects when Saga transaction does not exist', async () => {
  const client = new FakeClient();
  client.mockSagaRow = null;
  const pool = new FakeCentralPool(client) as any;
  const eventStore = new InMemoryProcessedEventStore();

  await assert.rejects(
    () => handleTransferShippedEvent(validMessage, { centralPool: pool, eventStore }),
    /Không tìm thấy Saga/,
  );
  assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
});

test('rejects when global_id mismatch', async () => {
  const client = new FakeClient();
  client.mockSagaRow = { ...validSagaRow, global_id: 'different-uuid' };
  const pool = new FakeCentralPool(client) as any;
  const eventStore = new InMemoryProcessedEventStore();

  await assert.rejects(
    () => handleTransferShippedEvent(validMessage, { centralPool: pool, eventStore }),
    /global_id không khớp/,
  );
  assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
});

test('rejects when warehouse mismatch (kho_xuat or kho_nhap)', async () => {
  const client = new FakeClient();
  client.mockSagaRow = { ...validSagaRow, kho_xuat: 'DN01' };
  const pool = new FakeCentralPool(client) as any;
  const eventStore = new InMemoryProcessedEventStore();

  await assert.rejects(
    () => handleTransferShippedEvent(validMessage, { centralPool: pool, eventStore }),
    /kho_xuat không khớp/,
  );
  assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
});

test('rejects when product or quantity mismatch', async () => {
  const client = new FakeClient();
  client.mockSagaRow = { ...validSagaRow, so_luong_yeu_cau: 100 };
  const pool = new FakeCentralPool(client) as any;
  const eventStore = new InMemoryProcessedEventStore();

  await assert.rejects(
    () => handleTransferShippedEvent(validMessage, { centralPool: pool, eventStore }),
    /so_luong không khớp/,
  );
  assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
});

test('rejects when Saga status is not RUNNING', async () => {
  const client = new FakeClient();
  client.mockSagaRow = { ...validSagaRow, status: 'CANCELLED' };
  const pool = new FakeCentralPool(client) as any;
  const eventStore = new InMemoryProcessedEventStore();

  await assert.rejects(
    () => handleTransferShippedEvent(validMessage, { centralPool: pool, eventStore }),
    /Saga status không phải RUNNING/,
  );
  assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
});

test('rejects when Saga current_state is not SOURCE_ACCEPTED', async () => {
  const client = new FakeClient();
  client.mockSagaRow = { ...validSagaRow, current_state: 'WAITING_SOURCE_CONFIRMATION' };
  const pool = new FakeCentralPool(client) as any;
  const eventStore = new InMemoryProcessedEventStore();

  await assert.rejects(
    () => handleTransferShippedEvent(validMessage, { centralPool: pool, eventStore }),
    /Saga state không phải SOURCE_ACCEPTED/,
  );
  assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
});

test('skips processing cleanly when eventId is already processed (Idempotency)', async () => {
  const client = new FakeClient();
  const pool = new FakeCentralPool(client) as any;
  const eventStore = new InMemoryProcessedEventStore();
  await eventStore.markProcessed('evt-36-001');

  await handleTransferShippedEvent(validMessage, { centralPool: pool, eventStore });

  assert.equal(client.calls.length, 0); // Không gọi bất kỳ query nào vào DB
});

test('rolls back and does NOT mark event processed on DB failure', async () => {
  const client = new FakeClient();
  client.mockSagaRow = { ...validSagaRow };
  client.shouldFailUpdate = true;
  const pool = new FakeCentralPool(client) as any;
  const eventStore = new InMemoryProcessedEventStore();

  await assert.rejects(
    () => handleTransferShippedEvent(validMessage, { centralPool: pool, eventStore }),
    /Database connection failed/,
  );

  assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
  assert.equal(await eventStore.isProcessed('evt-36-001'), false);
});














