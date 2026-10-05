import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationMessage } from './messageBoundary';
import { InMemoryMessageTransport } from './inMemoryTransport';
import {
  OutboxConnection,
  OutboxDatabase,
  OutboxEventRow,
  OutboxRelay,
} from './outboxRelay';

type StoredEvent = OutboxEventRow;

class FakeOutboxDatabase implements OutboxDatabase {
  public locked = false;
  public readonly events: StoredEvent[];

  public constructor(events: StoredEvent[]) {
    this.events = events;
  }

  public async connect(): Promise<OutboxConnection> {
    return new FakeOutboxConnection(this);
  }
}

class FakeOutboxConnection implements OutboxConnection {
  public constructor(private readonly database: FakeOutboxDatabase) {}

  public async query(text: string, values: unknown[] = []): Promise<unknown> {
    const normalized = text.replace(/\s+/g, ' ').trim().toUpperCase();

    if (normalized === 'BEGIN') return { rows: [] };

    if (normalized === 'COMMIT' || normalized === 'ROLLBACK') {
      this.database.locked = false;
      return { rows: [] };
    }

    if (normalized.startsWith('SELECT') && normalized.includes('FROM OUTBOX_EVENT')) {
      if (this.database.locked) return { rows: [] };

      const event = this.database.events.find((item) => item.status === 'PENDING');
      if (!event) return { rows: [] };

      this.database.locked = true;
      return { rows: [event] };
    }

    const eventId = String(values[0]);
    const event = this.database.events.find((item) => item.event_id === eventId);
    if (!event) throw new Error(`Unknown event ${eventId}`);

    if (normalized.includes("SET STATUS = 'PROCESSING'")) {
      event.status = 'PROCESSING';
    } else if (normalized.includes("SET STATUS = 'PROCESSED'")) {
      event.status = 'PROCESSED';
      event.processed_at = new Date();
    } else if (normalized.includes("SET STATUS = 'PENDING'")) {
      event.status = 'PENDING';
      event.retry_count += 1;
      event.error_message = String(values[1]);
    }

    return { rows: [] };
  }

  public release(): void {}
}

const createEvent = (eventId: string): StoredEvent => ({
  event_id: eventId,
  saga_id: '00000000-0000-0000-0000-000000000001',
  ma_giao_dich_global: '00000000-0000-0000-0000-000000000002',
  event_type: 'TRANSFER_SHIPPED',
  aggregate_id: 'DC001',
  payload: { ma_kho: 'HN01', so_luong: 20 },
  status: 'PENDING',
  retry_count: 0,
  created_at: new Date(),
  processed_at: null,
  error_message: null,
});

const createRelay = (event: StoredEvent) => {
  const database = new FakeOutboxDatabase([event]);
  const transport = new InMemoryMessageTransport();
  return { database, transport, relay: new OutboxRelay(database, transport) };
};

test('PENDING event becomes PROCESSED after transport success', async () => {
  const event = createEvent('00000000-0000-0000-0000-000000000010');
  const { database, transport, relay } = createRelay(event);

  const result = await relay.processNext();

  assert.deepEqual(result, { status: 'PROCESSED', eventId: event.event_id });
  assert.equal(database.events[0].status, 'PROCESSED');
  assert.equal(transport.messages[0].eventId, event.event_id);
});

test('transport failure keeps event retryable and increments retry_count', async () => {
  const event = createEvent('00000000-0000-0000-0000-000000000011');
  const { database, transport, relay } = createRelay(event);
  transport.failuresRemaining = 1;

  const result = await relay.processNext();

  assert.equal(result.status, 'RETRYABLE');
  assert.equal(database.events[0].status, 'PENDING');
  assert.equal(database.events[0].retry_count, 1);
  assert.equal(database.events[0].error_message, 'In-memory transport failure');
});

test('concurrent relays do not process the same pending event twice', async () => {
  const event = createEvent('00000000-0000-0000-0000-000000000012');
  const { database, transport, relay } = createRelay(event);

  const results = await Promise.all([relay.processNext(), relay.processNext()]);

  assert.equal(results.filter((result) => result.status === 'PROCESSED').length, 1);
  assert.equal(transport.messages.length, 1);
  assert.equal(database.events[0].status, 'PROCESSED');
});

test('already processed event is not published again', async () => {
  const event = createEvent('00000000-0000-0000-0000-000000000013');
  const { database, transport, relay } = createRelay(event);

  await relay.processNext();
  const result = await relay.processNext();

  assert.deepEqual(result, { status: 'EMPTY' });
  assert.equal(database.events[0].status, 'PROCESSED');
  assert.equal(transport.messages.length, 1);
});
