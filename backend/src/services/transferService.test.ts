import assert from 'node:assert/strict';
import test from 'node:test';
import { AcceptTransferCommand } from './nodeTransferProcedureAdapter';
import { confirmSourceTransfer, SagaTransferContext } from './transferService';

const sagaContext: SagaTransferContext = {
  saga_id: '00000000-0000-0000-0000-000000000201',
  global_id: '00000000-0000-0000-0000-000000000202',
  ma_phieu_dc: 'DC_TASK_32',
  kho_xuat: 'HN01',
  ma_sp: 'SP001',
  so_luong_yeu_cau: 20,
  current_state: 'WAITING_SOURCE_CONFIRMATION',
  status: 'RUNNING',
};

const manager = {
  ma_nguoi_dung: 'QL_HN',
  vai_tro: 'MANAGER' as const,
  ma_kho: 'HN01',
};

test('source confirmation loads Saga context and calls node accept adapter', async () => {
  let receivedCommand: AcceptTransferCommand | undefined;

  const result = await confirmSourceTransfer('DC_TASK_32', manager, {
    loadSagaContext: async () => sagaContext,
    acceptTransfer: async (command) => {
      receivedCommand = command;
    },
  });

  assert.deepEqual(receivedCommand, {
    saga_id: sagaContext.saga_id,
    global_id: sagaContext.global_id,
    ma_phieu_dc: sagaContext.ma_phieu_dc,
    ma_kho: sagaContext.kho_xuat,
    ma_sp: sagaContext.ma_sp,
    so_luong: sagaContext.so_luong_yeu_cau,
  });
  assert.equal(result.event_type, 'TRANSFER_ACCEPTED');
  assert.equal(result.global_id, sagaContext.global_id);
});

test('source confirmation fails when Saga context is missing', async () => {
  let adapterCalled = false;

  await assert.rejects(
    () =>
      confirmSourceTransfer('MISSING', manager, {
        loadSagaContext: async () => null,
        acceptTransfer: async () => {
          adapterCalled = true;
        },
      }),
    /Không tìm thấy Saga/,
  );

  assert.equal(adapterCalled, false);
});

test('source confirmation fails when actor does not own source warehouse', async () => {
  let adapterCalled = false;

  await assert.rejects(
    () =>
      confirmSourceTransfer(
        sagaContext.ma_phieu_dc,
        { ...manager, ma_kho: 'HCM01' },
        {
          loadSagaContext: async () => sagaContext,
          acceptTransfer: async () => {
            adapterCalled = true;
          },
        },
      ),
    /không có quyền xác nhận kho nguồn/,
  );

  assert.equal(adapterCalled, false);
});

test('source confirmation fails instead of inventing a missing global id', async () => {
  const contextWithoutGlobalId = { ...sagaContext, global_id: null };
  let adapterCalled = false;

  await assert.rejects(
    () =>
      confirmSourceTransfer(sagaContext.ma_phieu_dc, manager, {
        loadSagaContext: async () => contextWithoutGlobalId,
        acceptTransfer: async () => {
          adapterCalled = true;
        },
      }),
    /thiếu ma_giao_dich_global/,
  );

  assert.equal(adapterCalled, false);
});
