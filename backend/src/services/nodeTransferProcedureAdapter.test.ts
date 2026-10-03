import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AcceptTransferCommand,
  ShipTransferCommand,
  TransferProcedureClient,
  TransferProcedurePool,
  acceptTransferAtNode,
  shipTransferAtNode,
} from './nodeTransferProcedureAdapter';

type QueryCall = { text: string; values: unknown[] };

class FakeNodeClient implements TransferProcedureClient {
  public readonly calls: QueryCall[] = [];
  public reservationCreated = false;
  public shipped = false;
  public outboxEvent: string | null = null;
  public shouldFailProcedure = false;

  public async query(text: string, values: unknown[] = []): Promise {
    this.calls.push({ text, values });

    if (text.includes('sp_accept_transfer')) {
      if (this.shouldFailProcedure) {
        throw new Error('sp_accept_transfer failed');
      }

      this.reservationCreated = true;
      this.outboxEvent = 'TRANSFER_ACCEPTED';
    }

    if (text.includes('sp_ship_transfer')) {
      if (this.shouldFailProcedure) {
        throw new Error('sp_ship_transfer failed');
      }

      this.shipped = true;
      this.outboxEvent = 'TRANSFER_SHIPPED';
    }

    return { rows: [] };
  }

  public release(): void {}
}

class FakeNodePool implements TransferProcedurePool {
  public constructor(public readonly client: FakeNodeClient) {}

  public async connect(): Promise {
    return this.client;
  }
}

const acceptCommand: AcceptTransferCommand = {
  saga_id: '00000000-0000-0000-0000-000000000101',
  global_id: '00000000-0000-0000-0000-000000000102',
  ma_phieu_dc: 'DC_TASK_31',
  ma_kho: 'HCM01',
  ma_sp: 'SP001',
  so_luong: 20,
};

const shipCommand: ShipTransferCommand = {
  saga_id: '00000000-0000-0000-0000-000000000101',
  global_id: '00000000-0000-0000-0000-000000000102',
  ma_phieu_dc: 'DC_TASK_35',
  ma_kho: 'HN01',
  ma_sp: 'SP001',
  so_luong: 20,
};

// --- TESTS FOR acceptTransferAtNode ---

test('routes to the owner node and passes all six procedure parameters for acceptTransferAtNode', async () => {
  const client = new FakeNodeClient();
  const pool = new FakeNodePool(client);
  let selectedWarehouse = '';

  await acceptTransferAtNode(acceptCommand, (maKho) => {
    selectedWarehouse = maKho;
    return pool;
  });

  const procedureCall = client.calls.find((call) => call.text.includes('sp_accept_transfer'));
  assert.equal(selectedWarehouse, 'HCM01');
  assert.deepEqual(procedureCall?.values, [
    acceptCommand.saga_id,
    acceptCommand.global_id,
    acceptCommand.ma_phieu_dc,
    acceptCommand.ma_kho,
    acceptCommand.ma_sp,
    acceptCommand.so_luong,
  ]);
  assert.equal(client.calls[0].text, 'BEGIN');
  assert.equal(client.calls.at(-1)?.text, 'COMMIT');
  assert.equal(client.reservationCreated, true);
  assert.equal(client.outboxEvent, 'TRANSFER_ACCEPTED');
  assert.equal(client.calls.some((call) => call.text.includes('sp_ship_transfer')), false);
});

test('rolls back and rethrows when acceptTransferAtNode procedure fails', async () => {
  const client = new FakeNodeClient();
  client.shouldFailProcedure = true;
  const pool = new FakeNodePool(client);

  await assert.rejects(
    () => acceptTransferAtNode(acceptCommand, () => pool),
    /sp_accept_transfer failed/,
  );

  assert.equal(client.calls[0].text, 'BEGIN');
  assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
  assert.equal(client.calls.some((call) => call.text === 'COMMIT'), false);
  assert.equal(client.reservationCreated, false);
  assert.equal(client.outboxEvent, null);
});

// --- TESTS FOR shipTransferAtNode ---

test('routes to the owner node and passes all six procedure parameters for shipTransferAtNode', async () => {
  const client = new FakeNodeClient();
  const pool = new FakeNodePool(client);
  let selectedWarehouse = '';

  await shipTransferAtNode(shipCommand, (maKho) => {
    selectedWarehouse = maKho;
    return pool;
  });

  const procedureCall = client.calls.find((call) => call.text.includes('sp_ship_transfer'));
  assert.equal(selectedWarehouse, 'HN01');
  assert.deepEqual(procedureCall?.values, [
    shipCommand.saga_id,
    shipCommand.global_id,
    shipCommand.ma_phieu_dc,
    shipCommand.ma_kho,
    shipCommand.ma_sp,
    shipCommand.so_luong,
  ]);
  assert.equal(client.calls[0].text, 'BEGIN');
  assert.equal(client.calls.at(-1)?.text, 'COMMIT');
  assert.equal(client.shipped, true);
  assert.equal(client.outboxEvent, 'TRANSFER_SHIPPED');
  assert.equal(client.calls.some((call) => call.text.includes('sp_accept_transfer')), false);
  assert.equal(client.calls.some((call) => call.text.includes('sp_receive_transfer')), false);
});

test('rolls back and rethrows when shipTransferAtNode procedure fails', async () => {
  const client = new FakeNodeClient();
  client.shouldFailProcedure = true;
  const pool = new FakeNodePool(client);

  await assert.rejects(
    () => shipTransferAtNode(shipCommand, () => pool),
    /sp_ship_transfer failed/,
  );

  assert.equal(client.calls[0].text, 'BEGIN');
  assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
  assert.equal(client.calls.some((call) => call.text === 'COMMIT'), false);
  assert.equal(client.shipped, false);
  assert.equal(client.outboxEvent, null);
});