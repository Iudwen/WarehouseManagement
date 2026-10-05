import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationMessage } from '../messaging/messageBoundary';
import {
  CentralEventClient,
  CentralTransferEventHandler,
  CentralTransferEventHandlerDependencies,
  InMemoryProcessedEventStore,
  SagaTransferRow,
} from './centralTransferEventHandler';

type QueryCall = { text: string; values: unknown[] };

class FakeCentralClient implements CentralEventClient {
  public readonly calls: QueryCall[] = [];
  public saga: SagaTransferRow | null;
  public failSagaUpdate = false;

  public constructor(saga: SagaTransferRow | null) {
    this.saga = saga;
  }

  public async query(text: string, values: unknown[] = []): Promise<unknown> {
    this.calls.push({ text, values });

    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return { rows: [] };
    }

    if (text.includes('FROM saga_transaction')) {
      return { rows: this.saga ? [this.saga] : [] };
    }

    if (text.includes('UPDATE saga_transaction')) {
      if (this.failSagaUpdate) throw new Error('Central Saga update failed');
      if (this.saga) this.saga.current_state = 'SOURCE_ACCEPTED';
      return { rows: [] };
    }

    if (text.includes('UPDATE saga_monitoring')) {
      return { rows: [] };
    }

    return { rows: [] };
  }

  public release(): void {}
}

class FakeCentralDatabase {
  public constructor(public readonly client: FakeCentralClient) {}

  public async connect(): Promise<CentralEventClient> {
    return this.client;
  }
}

const saga: SagaTransferRow = {
  saga_id: '00000000-0000-0000-0000-000000000301',
  global_id: '00000000-0000-0000-0000-000000000302',
  ma_phieu_dc: 'DC_TASK_33',
  kho_xuat: 'HN01',
  ma_sp: 'SP001',
  so_luong_yeu_cau: 20,
  current_state: 'WAITING_SOURCE_CONFIRMATION',
  status: 'RUNNING',
};

const createMessage = (): ApplicationMessage => ({
  messageType: 'TRANSFER_ACCEPTED',
  eventId: '00000000-0000-0000-0000-000000000303',
  sagaId: saga.saga_id,
  globalTransactionId: saga.global_id,
  aggregateId: saga.ma_phieu_dc,
  payload: {
    ma_phieu_dc: saga.ma_phieu_dc,
    ma_kho: saga.kho_xuat,
    ma_sp: saga.ma_sp,
    so_luong: saga.so_luong_yeu_cau,
    ma_giao_dich_global: saga.global_id,
  },
});

const createHandler = (client: FakeCentralClient) => {
  const dependencies: CentralTransferEventHandlerDependencies = {
    database: new FakeCentralDatabase(client),
    processedEvents: new InMemoryProcessedEventStore(),
  };
  return new CentralTransferEventHandler(dependencies);
};

test('processes a valid TRANSFER_ACCEPTED event and updates Saga state', async () => {
  const client = new FakeCentralClient({ ...saga });
  const handler = createHandler(client);

  const result = await handler.handle(createMessage());

  assert.equal(result.status, 'PROCESSED');
  assert.equal(client.saga?.current_state, 'SOURCE_ACCEPTED');
  assert.equal(client.calls.some((call) => call.text.includes('UPDATE saga_monitoring')), true);
  assert.equal(client.calls.some((call) => call.text === 'COMMIT'), true);
});

test('rejects an unsupported event type', async () => {
  const client = new FakeCentralClient({ ...saga });
  const handler = createHandler(client);
  const message = { ...createMessage(), messageType: 'TRANSFER_SHIPPED' };

  await assert.rejects(() => handler.handle(message), /Event không được hỗ trợ/);
  assert.equal(client.calls.length, 0);
});

test('rejects an event when the Saga does not exist', async () => {
  const client = new FakeCentralClient(null);
  const handler = createHandler(client);

  await assert.rejects(() => handler.handle(createMessage()), /Không tìm thấy Saga/);
  assert.equal(client.calls.some((call) => call.text === 'ROLLBACK'), true);
});

test('rejects an event that belongs to another source warehouse', async () => {
  const client = new FakeCentralClient({ ...saga, kho_xuat: 'HCM01' });
  const handler = createHandler(client);

  await assert.rejects(
    () => handler.handle(createMessage()),
    /không thuộc đúng Saga\/source transfer/,
  );
});

test('does not process the same event_id successfully twice', async () => {
  const client = new FakeCentralClient({ ...saga });
  const handler = createHandler(client);
  const message = createMessage();

  const first = await handler.handle(message);
  const second = await handler.handle(message);

  assert.equal(first.status, 'PROCESSED');
  assert.equal(second.status, 'DUPLICATE');
  assert.equal(
    client.calls.filter((call) => call.text.includes('UPDATE saga_transaction')).length,
    1,
  );
});

test('rejects an event when Saga state is not waiting for source confirmation', async () => {
  const client = new FakeCentralClient({ ...saga, current_state: 'IN_TRANSIT' });
  const handler = createHandler(client);

  await assert.rejects(() => handler.handle(createMessage()), /Saga đang ở state IN_TRANSIT/);
});

test('keeps the event retryable when Central update fails', async () => {
  const client = new FakeCentralClient({ ...saga });
  client.failSagaUpdate = true;
  const handler = createHandler(client);

  await assert.rejects(() => handler.handle(createMessage()), /Central Saga update failed/);
  assert.equal(client.calls.some((call) => call.text === 'ROLLBACK'), true);
});
