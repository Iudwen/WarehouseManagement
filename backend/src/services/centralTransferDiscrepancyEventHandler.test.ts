import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleCentralTransferCompletedWithDiscrepancy,
  TransferCompletedWithDiscrepancyPayload,
} from './centralTransferDiscrepancyEventHandler';

type QueryCall = { text: string; values?: unknown[] };

class FakeCentralClient {
  public readonly calls: QueryCall[] = [];
  public sagaRow: { saga_id: string; current_state: string; status: string } | null = null;
  public shouldFailQuery = false;
  public released = false;

  public async query(text: string, values?: unknown[]): Promise<{ rows: any[] }> {
    this.calls.push({ text, values });

    if (this.shouldFailQuery && !text.includes('ROLLBACK')) {
      throw new Error('Database connection failed');
    }

    if (text.includes('SELECT saga_id, current_state')) {
      return { rows: this.sagaRow ? [this.sagaRow] : [] };
    }

    return { rows: [] };
  }

  public release(): void {
    this.released = true;
  }
}

const mockPayload: TransferCompletedWithDiscrepancyPayload = {
  saga_id: '00000000-0000-0000-0000-000000000999',
  global_id: '00000000-0000-0000-0000-000000000888',
  ma_phieu_dc: 'DC_DISCREPANCY_TEST',
  kho_xuat: 'HN01',
  kho_nhap: 'HCM01',
  ma_sp: 'SP001',
  so_luong_yeu_cau: 20,
  so_luong_thuc_nhan: 18,
  so_luong_thieu: 2,
  ly_do_thieu: 'Hàng bị vỡ trong quá trình vận chuyển',
};

test('successfully handles discrepancy event and updates all central tables (Happy Path)', async () => {
  const fakeClient = new FakeCentralClient();
  fakeClient.sagaRow = {
    saga_id: mockPayload.saga_id,
    current_state: 'IN_TRANSIT',
    status: 'RUNNING',
  };

  await handleCentralTransferCompletedWithDiscrepancy(mockPayload, {
    getCentralClient: async () => fakeClient as any,
  });

  assert.equal(fakeClient.calls[0].text, 'BEGIN');

  // Kiểm tra lock saga_transaction
  const selectCall = fakeClient.calls.find((c) => c.text.includes('FOR UPDATE'));
  assert.deepEqual(selectCall?.values, [mockPayload.saga_id]);

  // Kiểm tra UPDATE saga_transaction
  const updateSagaCall = fakeClient.calls.find((c) => c.text.includes('UPDATE saga_transaction'));
  assert.deepEqual(updateSagaCall?.values, [18, 'Hàng bị vỡ trong quá trình vận chuyển', mockPayload.saga_id]);

  // Kiểm tra UPDATE dieu_chuyen_central sang HOAN_THANH_THIEU
  const updateCentralCall = fakeClient.calls.find((c) => c.text.includes('UPDATE dieu_chuyen_central'));
  assert.deepEqual(updateCentralCall?.values, [mockPayload.ma_phieu_dc]);

  // Kiểm tra UPDATE saga_monitoring
  const updateMonitoringCall = fakeClient.calls.find((c) => c.text.includes('UPDATE saga_monitoring'));
  assert.deepEqual(updateMonitoringCall?.values, [mockPayload.ma_phieu_dc]);

  // Kiểm tra COMMIT và Release client
  assert.equal(fakeClient.calls.at(-1)?.text, 'COMMIT');
  assert.equal(fakeClient.released, true);
});

test('skips update and rolls back when saga is already COMPLETED_WITH_DISCREPANCY (Idempotency)', async () => {
  const fakeClient = new FakeCentralClient();
  fakeClient.sagaRow = {
    saga_id: mockPayload.saga_id,
    current_state: 'COMPLETED_WITH_DISCREPANCY',
    status: 'SUCCESS',
  };

  await handleCentralTransferCompletedWithDiscrepancy(mockPayload, {
    getCentralClient: async () => fakeClient as any,
  });

  assert.equal(fakeClient.calls[0].text, 'BEGIN');
  assert.equal(fakeClient.calls.at(-1)?.text, 'ROLLBACK');
  assert.equal(fakeClient.calls.some((c) => c.text.includes('UPDATE saga_transaction')), false);
  assert.equal(fakeClient.released, true);
});

test('rolls back and returns early when saga_id is not found', async () => {
  const fakeClient = new FakeCentralClient();
  fakeClient.sagaRow = null;

  await handleCentralTransferCompletedWithDiscrepancy(mockPayload, {
    getCentralClient: async () => fakeClient as any,
  });

  assert.equal(fakeClient.calls[0].text, 'BEGIN');
  assert.equal(fakeClient.calls.at(-1)?.text, 'ROLLBACK');
  assert.equal(fakeClient.calls.some((c) => c.text.includes('UPDATE saga_transaction')), false);
  assert.equal(fakeClient.released, true);
});

test('rolls back, rethrows error, and releases client when DB query fails', async () => {
  const fakeClient = new FakeCentralClient();
  fakeClient.sagaRow = {
    saga_id: mockPayload.saga_id,
    current_state: 'IN_TRANSIT',
    status: 'RUNNING',
  };
  fakeClient.shouldFailQuery = true;

  await assert.rejects(
    () =>
      handleCentralTransferCompletedWithDiscrepancy(mockPayload, {
        getCentralClient: async () => fakeClient as any,
      }),
    /Database connection failed/
  );

  assert.equal(fakeClient.calls[0].text, 'BEGIN');
  assert.equal(fakeClient.calls.at(-1)?.text, 'ROLLBACK');
  assert.equal(fakeClient.released, true);
});