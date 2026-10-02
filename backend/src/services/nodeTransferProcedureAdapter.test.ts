import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AcceptTransferCommand,
  TransferProcedureClient,
  TransferProcedurePool,
  acceptTransferAtNode,
} from './nodeTransferProcedureAdapter';

type QueryCall = { text: string; values: unknown[] };

class FakeNodeClient implements TransferProcedureClient {
  public readonly calls: QueryCall[] = [];
  public reservationCreated = false;
  public outboxEvent: string | null = null;
  public shouldFailProcedure = false;

  public async query(text: string, values: unknown[] = []): Promise<unknown> {
    this.calls.push({ text, values });

    if (text.includes('sp_accept_transfer')) {
      if (this.shouldFailProcedure) {
        throw new Error('sp_accept_transfer failed');
      }

      this.reservationCreated = true;
      this.outboxEvent = 'TRANSFER_ACCEPTED';
    }

    return { rows: [] };
  }

  public release(): void {}
}

class FakeNodePool implements TransferProcedurePool {
  public constructor(public readonly client: FakeNodeClient) {}

  public async connect(): Promise<TransferProcedureClient> {
    return this.client;
  }
}

const command: AcceptTransferCommand = {
  saga_id: '00000000-0000-0000-0000-000000000101',
  global_id: '00000000-0000-0000-0000-000000000102',
  ma_phieu_dc: 'DC_TASK_31',
  ma_kho: 'HCM01',
  ma_sp: 'SP001',
  so_luong: 20,
};

test('routes to the owner node and passes all six procedure parameters', async () => {
  const client = new FakeNodeClient();
  const pool = new FakeNodePool(client);
  let selectedWarehouse = '';

  await acceptTransferAtNode(command, (maKho) => {
    selectedWarehouse = maKho;
    return pool;
  });

  const procedureCall = client.calls.find((call) => call.text.includes('sp_accept_transfer'));
  assert.equal(selectedWarehouse, 'HCM01');
  assert.deepEqual(procedureCall?.values, [
    command.saga_id,
    command.global_id,
    command.ma_phieu_dc,
    command.ma_kho,
    command.ma_sp,
    command.so_luong,
  ]);
  assert.equal(client.calls[0].text, 'BEGIN');
  assert.equal(client.calls.at(-1)?.text, 'COMMIT');
  assert.equal(client.reservationCreated, true);
  assert.equal(client.outboxEvent, 'TRANSFER_ACCEPTED');
  assert.equal(client.calls.some((call) => call.text.includes('sp_ship_transfer')), false);
});

test('rolls back and rethrows when the node procedure fails', async () => {
  const client = new FakeNodeClient();
  client.shouldFailProcedure = true;
  const pool = new FakeNodePool(client);

  await assert.rejects(
    () => acceptTransferAtNode(command, () => pool),
    /sp_accept_transfer failed/,
  );

  assert.equal(client.calls[0].text, 'BEGIN');
  assert.equal(client.calls.at(-1)?.text, 'ROLLBACK');
  assert.equal(client.calls.some((call) => call.text === 'COMMIT'), false);
  assert.equal(client.reservationCreated, false);
  assert.equal(client.outboxEvent, null);
});
