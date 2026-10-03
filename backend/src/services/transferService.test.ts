import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AcceptTransferCommand,
  ShipTransferCommand,
} from './nodeTransferProcedureAdapter';
import {
  SagaTransferContext,
  confirmSourceTransfer,
  shipSourceTransfer,
} from './transferService';

const confirmSagaContext: SagaTransferContext = {
  saga_id: '00000000-0000-0000-0000-000000000201',
  global_id: '00000000-0000-0000-0000-000000000202',
  ma_phieu_dc: 'DC_TASK_32',
  kho_xuat: 'HN01',
  ma_sp: 'SP001',
  so_luong_yeu_cau: 20,
  current_state: 'WAITING_SOURCE_CONFIRMATION',
  status: 'RUNNING',
};

const shipSagaContext: SagaTransferContext = {
  saga_id: '00000000-0000-0000-0000-000000000301',
  global_id: '00000000-0000-0000-0000-000000000302',
  ma_phieu_dc: 'DC_TASK_35',
  kho_xuat: 'HN01',
  ma_sp: 'SP001',
  so_luong_yeu_cau: 20,
  current_state: 'SOURCE_ACCEPTED',
  status: 'RUNNING',
};

const manager = {
  ma_nguoi_dung: 'QL_HN',
  vai_tro: 'MANAGER' as const,
  ma_kho: 'HN01',
};

const admin = {
  ma_nguoi_dung: 'ADMIN_SYS',
  vai_tro: 'ADMIN' as const,
  ma_kho: 'ALL',
};

// --- TESTS FOR confirmSourceTransfer ---

test('source confirmation loads Saga context and calls node accept adapter', async () => {
  let receivedCommand: AcceptTransferCommand | undefined;

  const result = await confirmSourceTransfer('DC_TASK_32', manager, {
    loadSagaContext: async () => confirmSagaContext,
    acceptTransfer: async (command) => {
      receivedCommand = command;
    },
  });

  assert.deepEqual(receivedCommand, {
    saga_id: confirmSagaContext.saga_id,
    global_id: confirmSagaContext.global_id,
    ma_phieu_dc: confirmSagaContext.ma_phieu_dc,
    ma_kho: confirmSagaContext.kho_xuat,
    ma_sp: confirmSagaContext.ma_sp,
    so_luong: confirmSagaContext.so_luong_yeu_cau,
  });
  assert.equal(result.event_type, 'TRANSFER_ACCEPTED');
  assert.equal(result.global_id, confirmSagaContext.global_id);
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
        confirmSagaContext.ma_phieu_dc,
        { ...manager, ma_kho: 'HCM01' },
        {
          loadSagaContext: async () => confirmSagaContext,
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
  const contextWithoutGlobalId = { ...confirmSagaContext, global_id: null };
  let adapterCalled = false;

  await assert.rejects(
    () =>
      confirmSourceTransfer(confirmSagaContext.ma_phieu_dc, manager, {
        loadSagaContext: async () => contextWithoutGlobalId,
        acceptTransfer: async () => {
          adapterCalled = true;
        },
      }),
    /thiếu ma_giao_dich_global/,
  );

  assert.equal(adapterCalled, false);
});

// --- TESTS FOR shipSourceTransfer (Task 3.5) ---

test('source shipment loads Saga context and calls node ship adapter', async () => {
  let receivedCommand: ShipTransferCommand | undefined;

  const result = await shipSourceTransfer('DC_TASK_35', manager, {
    loadSagaContext: async () => shipSagaContext,
    shipTransfer: async (command) => {
      receivedCommand = command;
    },
  });

  assert.deepEqual(receivedCommand, {
    saga_id: shipSagaContext.saga_id,
    global_id: shipSagaContext.global_id,
    ma_phieu_dc: shipSagaContext.ma_phieu_dc,
    ma_kho: shipSagaContext.kho_xuat,
    ma_sp: shipSagaContext.ma_sp,
    so_luong: shipSagaContext.so_luong_yeu_cau,
  });
  assert.equal(result.event_type, 'TRANSFER_SHIPPED');
  assert.equal(result.global_id, shipSagaContext.global_id);
});

test('source shipment allows ADMIN user to ship regardless of warehouse', async () => {
  let receivedCommand: ShipTransferCommand | undefined;

  const result = await shipSourceTransfer('DC_TASK_35', admin, {
    loadSagaContext: async () => shipSagaContext,
    shipTransfer: async (command) => {
      receivedCommand = command;
    },
  });

  assert.equal(result.event_type, 'TRANSFER_SHIPPED');
  assert.ok(receivedCommand);
});

test('source shipment fails when Saga context is missing', async () => {
  let adapterCalled = false;

  await assert.rejects(
    () =>
      shipSourceTransfer('MISSING', manager, {
        loadSagaContext: async () => null,
        shipTransfer: async () => {
          adapterCalled = true;
        },
      }),
    /Không tìm thấy Saga/,
  );

  assert.equal(adapterCalled, false);
});

test('source shipment fails when Saga state is not SOURCE_ACCEPTED', async () => {
  const invalidStateContext = {
    ...shipSagaContext,
    current_state: 'WAITING_SOURCE_CONFIRMATION',
  };
  let adapterCalled = false;

  await assert.rejects(
    () =>
      shipSourceTransfer(shipSagaContext.ma_phieu_dc, manager, {
        loadSagaContext: async () => invalidStateContext,
        shipTransfer: async () => {
          adapterCalled = true;
        },
      }),
    /không thể thực hiện xuất hàng/,
  );

  assert.equal(adapterCalled, false);
});

test('source shipment fails when Saga status is not RUNNING', async () => {
  const invalidStatusContext = {
    ...shipSagaContext,
    status: 'COMPLETED',
  };
  let adapterCalled = false;

  await assert.rejects(
    () =>
      shipSourceTransfer(shipSagaContext.ma_phieu_dc, manager, {
        loadSagaContext: async () => invalidStatusContext,
        shipTransfer: async () => {
          adapterCalled = true;
        },
      }),
    /không thể thực hiện xuất hàng/,
  );

  assert.equal(adapterCalled, false);
});

test('source shipment fails when actor does not own source warehouse', async () => {
  let adapterCalled = false;

  await assert.rejects(
    () =>
      shipSourceTransfer(
        shipSagaContext.ma_phieu_dc,
        { ...manager, ma_kho: 'HCM01' },
        {
          loadSagaContext: async () => shipSagaContext,
          shipTransfer: async () => {
            adapterCalled = true;
          },
        },
      ),
    /không có quyền xuất hàng từ kho nguồn/,
  );

  assert.equal(adapterCalled, false);
});

test('source shipment fails when global_id is missing', async () => {
  const contextWithoutGlobalId = { ...shipSagaContext, global_id: null };
  let adapterCalled = false;

  await assert.rejects(
    () =>
      shipSourceTransfer(shipSagaContext.ma_phieu_dc, manager, {
        loadSagaContext: async () => contextWithoutGlobalId,
        shipTransfer: async () => {
          adapterCalled = true;
        },
      }),
    /thiếu ma_giao_dich_global/,
  );

  assert.equal(adapterCalled, false);
});