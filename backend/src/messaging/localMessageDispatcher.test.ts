import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationMessage } from './messageBoundary';
import { InMemoryMessageTransport } from './inMemoryTransport';
import { registerCentralTransferEventHandler } from '../services/centralTransferEventHandler';

const message = (messageType: string, eventId: string): ApplicationMessage => ({
  messageType,
  aggregateId: 'DC_TASK_34',
  eventId,
  sagaId: '00000000-0000-0000-0000-000000000401',
  globalTransactionId: '00000000-0000-0000-0000-000000000402',
  payload: {},
});

test('publishes TRANSFER_ACCEPTED to the registered Central handler', async () => {
  const transport = new InMemoryMessageTransport();
  const received: ApplicationMessage[] = [];
  registerCentralTransferEventHandler(transport, async (receivedMessage) => {
    received.push(receivedMessage);
  });

  await transport.publish(message('TRANSFER_ACCEPTED', 'event-accepted-1'));

  assert.equal(received.length, 1);
  assert.equal(received[0].eventId, 'event-accepted-1');
});

test('does not call the Central handler for an unknown message type', async () => {
  const transport = new InMemoryMessageTransport();
  let calls = 0;
  registerCentralTransferEventHandler(transport, async () => {
    calls += 1;
  });

  await transport.publish(message('UNKNOWN_EVENT', 'event-unknown-1'));

  assert.equal(calls, 0);
});

test('propagates handler errors to the publish caller', async () => {
  const transport = new InMemoryMessageTransport();
  registerCentralTransferEventHandler(transport, async () => {
    throw new Error('Central handler failed');
  });

  await assert.rejects(
    () => transport.publish(message('TRANSFER_ACCEPTED', 'event-failure-1')),
    /Central handler failed/,
  );
});

test('successful handler completion resolves publish', async () => {
  const transport = new InMemoryMessageTransport();
  let calls = 0;
  registerCentralTransferEventHandler(transport, async () => {
    calls += 1;
  });

  await transport.publish(message('TRANSFER_ACCEPTED', 'event-success-1'));

  assert.equal(calls, 1);
});

test('duplicate event follows handler idempotency semantics', async () => {
  const transport = new InMemoryMessageTransport();
  const processed = new Set<string>();
  const results: string[] = [];
  registerCentralTransferEventHandler(transport, async (receivedMessage) => {
    if (processed.has(receivedMessage.eventId || '')) {
      results.push('DUPLICATE');
      return;
    }

    processed.add(receivedMessage.eventId || '');
    results.push('PROCESSED');
  });

  await transport.publish(message('TRANSFER_ACCEPTED', 'event-duplicate-1'));
  await transport.publish(message('TRANSFER_ACCEPTED', 'event-duplicate-1'));

  assert.deepEqual(results, ['PROCESSED', 'DUPLICATE']);
});

test('multiple message types dispatch only to matching handlers', async () => {
  const transport = new InMemoryMessageTransport();
  const received: string[] = [];
  transport.subscribe('TRANSFER_ACCEPTED', async () => {
    received.push('accepted');
  });
  transport.subscribe('OTHER_EVENT', async () => {
    received.push('other');
  });

  await transport.publish(message('TRANSFER_ACCEPTED', 'event-multi-1'));
  await transport.publish(message('OTHER_EVENT', 'event-multi-2'));

  assert.deepEqual(received, ['accepted', 'other']);
});
