const { pools, getDbPool } = require('../dist/config/postgresql');
const { relaySingleEvent, markOutboxProcessed } = require('../dist/workers/outboxRelay');
const { claimEvents, reapExpiredLeases } = require('../dist/workers/outboxPoller');
const { OutboxWorker } = require('../dist/workers/outboxWorker');

async function runVerification() {
  console.log('================================================================');
  console.log('KIỂM THỬ XÁC MINH TOÀN DIỆN: OUTBOX RELAY -> CENTRAL SAGA PIPELINE');
  console.log('================================================================\n');

  const hnPool = getDbPool('HN');
  const hcmPool = getDbPool('HCM');
  const centralPool = pools.CENTRAL;

  const testSagaId = 'a1111111-2222-3333-4444-555555555555';
  const testGlobalId = 'b1111111-2222-3333-4444-555555555555';
  const testMaPhieu = 'DC-TEST-ISO-99';
  const testShippedEventId = 'c1111111-2222-3333-4444-555555555555';
  const testReceivedEventId = 'd1111111-2222-3333-4444-555555555555';
  const testOccEventId = 'e1111111-2222-3333-4444-555555555555';

  try {
    // -------------------------------------------------------------
    // DỌN DẸP DỮ LIỆU CŨ NẾU TỒN TẠI TỪ TEST TRƯỚC
    // -------------------------------------------------------------
    await hnPool.query("DELETE FROM outbox_event WHERE event_id = ANY($1::uuid[])", [[testShippedEventId, testOccEventId]]);
    await hcmPool.query("DELETE FROM outbox_event WHERE event_id = $1::uuid", [testReceivedEventId]);
    await centralPool.query("DELETE FROM processed_event WHERE event_id = ANY($1::uuid[])", [[testShippedEventId, testReceivedEventId]]);
    await centralPool.query("DELETE FROM vwh_transfer WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM saga_monitoring WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM saga_transaction WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM dieu_chuyen_central WHERE ma_phieu_dc = $1", [testMaPhieu]);

    console.log('[CHUẨN BỊ] Tạo Saga cô lập trên Central DB...');
    await centralPool.query(`
      INSERT INTO dieu_chuyen_central (ma_phieu_dc, kho_xuat, kho_nhap, ma_sp, so_luong, trang_thai)
      VALUES ($1, 'HN01', 'HCM01', 'SP001', 5, 'DANG_XU_LY')
    `, [testMaPhieu]);

    await centralPool.query(`
      INSERT INTO saga_transaction (
        saga_id, ma_giao_dich_global, ma_phieu_dc, ma_sp, kho_xuat, kho_nhap,
        so_luong_yeu_cau, so_luong_da_xuat, so_luong_thuc_nhan, so_luong_chenh_lech,
        status, current_state
      ) VALUES (
        $1, $2, $3, 'SP001', 'HN01', 'HCM01',
        5, 0, 0, 0,
        'RUNNING', 'SOURCE_ACCEPTED'
      )
    `, [testSagaId, testGlobalId, testMaPhieu]);

    // =============================================================
    // TEST 1: KIỂM THỬ SỰ KIỆN TRANSFER_SHIPPED
    // =============================================================
    console.log('\n--- TEST 1: TRANSFER_SHIPPED (Node HN -> Central) ---');
    const shipPayload = {
      saga_id: testSagaId,
      ma_giao_dich_global: testGlobalId,
      ma_phieu_dc: testMaPhieu,
      ma_kho: 'HN01',
      kho_xuat: 'HN01',
      ma_sp: 'SP001',
      so_luong: 5,
      ton_truoc: 100,
      ton_sau: 95,
      event_time: new Date().toISOString()
    };

    await hnPool.query(`
      INSERT INTO outbox_event (
        event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id,
        payload, status, version, retry_count, max_retry_count, next_retry_at
      ) VALUES (
        $1, $2, $3, 'TRANSFER_SHIPPED', $4,
        $5, 'PENDING', 1, 0, 3, CURRENT_TIMESTAMP
      )
    `, [testShippedEventId, testSagaId, testGlobalId, testMaPhieu, JSON.stringify(shipPayload)]);

    // Chạy worker với whitelist chính xác eventId cô lập
    const workerHN = new OutboxWorker({
      nodeName: 'HN',
      once: true,
      whitelistEventIds: [testShippedEventId],
      requireWhitelist: true
    });

    const pollRes1 = await workerHN.pollOnce();
    console.log('Worker HN Poll Once result:', pollRes1);

    // Xác minh kết quả trên Node HN
    const outboxShipRes = await hnPool.query("SELECT status, version, processed_at FROM outbox_event WHERE event_id = $1", [testShippedEventId]);
    console.log('Node HN Outbox Status:', outboxShipRes.rows[0]);
    if (outboxShipRes.rows[0]?.status !== 'PROCESSED') {
      throw new Error(`TEST 1 FAILED: Outbox status trên HN không phải PROCESSED, mà là ${outboxShipRes.rows[0]?.status}`);
    }

    // Xác minh trên Central DB: processed_event, vwh_transfer, saga_transaction
    const centralProcRes = await centralPool.query("SELECT event_id, event_type, status FROM processed_event WHERE event_id = $1", [testShippedEventId]);
    console.log('Central processed_event:', centralProcRes.rows[0]);
    if (centralProcRes.rows.length === 0) {
      throw new Error('TEST 1 FAILED: Central không có bản ghi processed_event!');
    }

    const vwhRes = await centralPool.query("SELECT vwh_id, saga_id, so_luong_xuat, so_luong_dang_van_chuyen, trang_thai FROM vwh_transfer WHERE saga_id = $1", [testSagaId]);
    console.log('Central vwh_transfer:', vwhRes.rows[0]);
    if (!vwhRes.rows[0] || vwhRes.rows[0].trang_thai !== 'IN_TRANSIT') {
      throw new Error(`TEST 1 FAILED: vwh_transfer không ở trạng thái IN_TRANSIT!`);
    }

    const sagaShipCheck = await centralPool.query("SELECT current_state, status FROM saga_transaction WHERE saga_id = $1", [testSagaId]);
    console.log('Central saga_transaction:', sagaShipCheck.rows[0]);
    if (sagaShipCheck.rows[0]?.current_state !== 'IN_TRANSIT') {
      throw new Error(`TEST 1 FAILED: Saga current_state không phải IN_TRANSIT, mà là ${sagaShipCheck.rows[0]?.current_state}`);
    }
    console.log('>>> TEST 1: PASS! TRANSFER_SHIPPED xử lý thành công, VWH tạo IN_TRANSIT.');

    // =============================================================
    // TEST 2: IDEMPOTENCY REPLAY CHO TRANSFER_SHIPPED (CÙNG event_id)
    // =============================================================
    console.log('\n--- TEST 2: IDEMPOTENCY REPLAY CHO TRANSFER_SHIPPED ---');
    // 1. Thử gọi lại Stored Procedure Central với cùng event_id
    const resIdempotent = await centralPool.query(
      `SELECT sp_create_vwh_transfer($1::uuid, $2::jsonb, $3::uuid, $4::uuid, $5::varchar, $6::int) AS vwh_id`,
      [testShippedEventId, JSON.stringify(shipPayload), testSagaId, testGlobalId, testMaPhieu, 5]
    );
    console.log('Replay Central SP Direct Result:', resIdempotent.rows[0]);
    if (String(resIdempotent.rows[0]?.vwh_id) !== String(vwhRes.rows[0]?.vwh_id)) {
      throw new Error(`TEST 2 FAILED: Idempotent replay không trả về vwh_id cũ! Nhận được: ${resIdempotent.rows[0]?.vwh_id}`);
    }

    // 2. Thử mô phỏng Relay Retry khi Worker bị ngắt kết nối trước khi cập nhật Node:
    // Đặt Node outbox_event về PROCESSING với version = 4
    await hnPool.query("UPDATE outbox_event SET status = 'PROCESSING', version = 4 WHERE event_id = $1", [testShippedEventId]);
    const replayShipRes = await relaySingleEvent(hnPool, centralPool, {
      event_id: testShippedEventId,
      saga_id: testSagaId,
      ma_giao_dich_global: testGlobalId,
      aggregate_id: testMaPhieu,
      event_type: 'TRANSFER_SHIPPED',
      payload: shipPayload,
      version: 4
    });
    console.log('Replay Relay Result:', replayShipRes);
    if (!replayShipRes.success) {
      throw new Error(`TEST 2 FAILED: Idempotent relay retry thất bại: ${replayShipRes.errorMessage}`);
    }

    // Đếm số lượng VWH xem có bị nhân bản không
    const vwhCountRes = await centralPool.query("SELECT COUNT(*) AS total FROM vwh_transfer WHERE saga_id = $1", [testSagaId]);
    console.log('Tổng số VWH tạo cho Saga:', vwhCountRes.rows[0].total);
    if (Number(vwhCountRes.rows[0].total) !== 1) {
      throw new Error(`TEST 2 FAILED: Nhân đôi VWH! Số lượng: ${vwhCountRes.rows[0].total}`);
    }
    console.log('>>> TEST 2: PASS! Replay cùng event_id không nhân đôi VWH.');

    // =============================================================
    // TEST 3: KIỂM THỬ SỰ KIỆN TRANSFER_RECEIVED
    // =============================================================
    console.log('\n--- TEST 3: TRANSFER_RECEIVED (Node HCM -> Central) ---');
    const receivePayload = {
      saga_id: testSagaId,
      ma_giao_dich_global: testGlobalId,
      ma_phieu_dc: testMaPhieu,
      ma_kho: 'HCM01',
      kho_nhap: 'HCM01',
      ma_sp: 'SP001',
      so_luong_thuc_nhan: 5,
      ton_truoc: 50,
      ton_sau: 55,
      event_time: new Date().toISOString()
    };

    await hcmPool.query(`
      INSERT INTO outbox_event (
        event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id,
        payload, status, version, retry_count, max_retry_count, next_retry_at
      ) VALUES (
        $1, $2, $3, 'TRANSFER_RECEIVED', $4,
        $5, 'PENDING', 1, 0, 3, CURRENT_TIMESTAMP
      )
    `, [testReceivedEventId, testSagaId, testGlobalId, testMaPhieu, JSON.stringify(receivePayload)]);

    const workerHCM = new OutboxWorker({
      nodeName: 'HCM',
      once: true,
      whitelistEventIds: [testReceivedEventId],
      requireWhitelist: true
    });

    const pollRes2 = await workerHCM.pollOnce();
    console.log('Worker HCM Poll Once result:', pollRes2);

    const outboxRecRes = await hcmPool.query("SELECT status, version, processed_at FROM outbox_event WHERE event_id = $1", [testReceivedEventId]);
    console.log('Node HCM Outbox Status:', outboxRecRes.rows[0]);
    if (outboxRecRes.rows[0]?.status !== 'PROCESSED') {
      throw new Error(`TEST 3 FAILED: Outbox status trên HCM không phải PROCESSED, mà là ${outboxRecRes.rows[0]?.status}`);
    }

    const vwhRecRes = await centralPool.query("SELECT vwh_id, so_luong_da_nhan, so_luong_dang_van_chuyen, trang_thai FROM vwh_transfer WHERE saga_id = $1", [testSagaId]);
    console.log('Central vwh_transfer sau khi nhận:', vwhRecRes.rows[0]);
    if (vwhRecRes.rows[0]?.trang_thai !== 'RECEIVED' || Number(vwhRecRes.rows[0]?.so_luong_da_nhan) !== 5) {
      throw new Error(`TEST 3 FAILED: VWH chưa chuyển RECEIVED hoặc số lượng nhận không đúng: ${JSON.stringify(vwhRecRes.rows[0])}`);
    }

    const sagaRecCheck = await centralPool.query("SELECT current_state, status, so_luong_thuc_nhan FROM saga_transaction WHERE saga_id = $1", [testSagaId]);
    console.log('Central saga_transaction sau khi nhận:', sagaRecCheck.rows[0]);
    if (sagaRecCheck.rows[0]?.current_state !== 'COMPLETED' || sagaRecCheck.rows[0]?.status !== 'SUCCESS') {
      throw new Error(`TEST 3 FAILED: Saga không đạt COMPLETED/SUCCESS: ${JSON.stringify(sagaRecCheck.rows[0])}`);
    }
    console.log('>>> TEST 3: PASS! TRANSFER_RECEIVED xử lý thành công, Saga COMPLETED.');

    // =============================================================
    // TEST 4: IDEMPOTENCY REPLAY CHO TRANSFER_RECEIVED (CÙNG event_id)
    // =============================================================
    console.log('\n--- TEST 4: IDEMPOTENCY REPLAY CHO TRANSFER_RECEIVED ---');
    // 1. Thử gọi lại Stored Procedure Central trực tiếp với cùng event_id
    await centralPool.query(
      `SELECT sp_process_transfer_received($1::uuid, $2::jsonb, $3::uuid, $4::uuid, $5::varchar, $6::int)`,
      [testReceivedEventId, JSON.stringify(receivePayload), testSagaId, testGlobalId, testMaPhieu, 5]
    );
    console.log('Replay Central SP Direct Received: Thành công không lỗi.');

    // 2. Thử mô phỏng Relay Retry khi Node outbox_event được reset về PROCESSING:
    await hcmPool.query("UPDATE outbox_event SET status = 'PROCESSING', version = 4 WHERE event_id = $1", [testReceivedEventId]);
    const replayRecRes = await relaySingleEvent(hcmPool, centralPool, {
      event_id: testReceivedEventId,
      saga_id: testSagaId,
      ma_giao_dich_global: testGlobalId,
      aggregate_id: testMaPhieu,
      event_type: 'TRANSFER_RECEIVED',
      payload: receivePayload,
      version: 4
    });
    console.log('Replay Receive Result:', replayRecRes);
    if (!replayRecRes.success) {
      throw new Error(`TEST 4 FAILED: Idempotent replay cho receive thất bại: ${replayRecRes.errorMessage}`);
    }

    const vwhRecReplayCheck = await centralPool.query("SELECT so_luong_da_nhan FROM vwh_transfer WHERE saga_id = $1", [testSagaId]);
    console.log('Số lượng đã nhận sau replay:', vwhRecReplayCheck.rows[0].so_luong_da_nhan);
    if (Number(vwhRecReplayCheck.rows[0].so_luong_da_nhan) !== 5) {
      throw new Error(`TEST 4 FAILED: Số lượng đã nhận bị nhân đôi lên ${vwhRecReplayCheck.rows[0].so_luong_da_nhan}!`);
    }
    console.log('>>> TEST 4: PASS! Replay TRANSFER_RECEIVED không làm tăng số lượng nhận.');

    // =============================================================
    // TEST 5: LEASE TIMEOUT REAPER & OCC FENCING
    // =============================================================
    console.log('\n--- TEST 5: LEASE TIMEOUT REAPER & OCC FENCING ---');
    // Chèn event PROCESSING với version = 1 và last_retry_at cách đây 10 phút
    await hnPool.query(`
      INSERT INTO outbox_event (
        event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id,
        payload, status, version, retry_count, max_retry_count, last_retry_at, next_retry_at
      ) VALUES (
        $1, $2, $3, 'TRANSFER_SHIPPED', $4,
        '{}', 'PROCESSING', 1, 0, 3, CURRENT_TIMESTAMP - INTERVAL '10 minutes', CURRENT_TIMESTAMP
      )
    `, [testOccEventId, testSagaId, testGlobalId, testMaPhieu]);

    // Chạy reaper với leaseTimeoutSeconds = 60
    const reapResult = await reapExpiredLeases(hnPool, {
      leaseTimeoutSeconds: 60,
      whitelistEventIds: [testOccEventId],
      requireWhitelist: true
    });
    console.log('Reaper Result:', reapResult);
    if (reapResult.reclaimedCount !== 1) {
      throw new Error(`TEST 5 FAILED: Reaper không thu hồi được event hết hạn lease!`);
    }

    const reapedRecord = await hnPool.query("SELECT status, version FROM outbox_event WHERE event_id = $1", [testOccEventId]);
    console.log('Bản ghi sau khi thu hồi:', reapedRecord.rows[0]);
    if (reapedRecord.rows[0].status !== 'PENDING' || reapedRecord.rows[0].version !== 2) {
      throw new Error(`TEST 5 FAILED: Bản ghi không về PENDING hoặc version không tăng lên 2: ${JSON.stringify(reapedRecord.rows[0])}`);
    }

    // Giả lập worker cũ cố gắng cập nhật với claimedVersion = 1 (đã mất quyền sở hữu)
    const occUpdated = await markOutboxProcessed(hnPool, testOccEventId, 1);
    console.log('Worker cũ thử cập nhật với version 1 (kết quả cập nhật):', occUpdated);
    if (occUpdated !== false) {
      throw new Error('TEST 5 FAILED: OCC không chặn được worker cũ cập nhật sau khi mất quyền sở hữu!');
    }
    console.log('>>> TEST 5: PASS! Reaper thu hồi đúng lease và OCC Fencing chặn worker cũ thành công.');

    // -------------------------------------------------------------
    // DỌN DẸP DỮ LIỆU SAU KHI TEST THÀNH CÔNG
    // -------------------------------------------------------------
    console.log('\n[DỌN DẸP] Xóa các bản ghi thử nghiệm cô lập...');
    await hnPool.query("DELETE FROM outbox_event WHERE event_id = ANY($1::uuid[])", [[testShippedEventId, testOccEventId]]);
    await hcmPool.query("DELETE FROM outbox_event WHERE event_id = $1::uuid", [testReceivedEventId]);
    await centralPool.query("DELETE FROM processed_event WHERE event_id = ANY($1::uuid[])", [[testShippedEventId, testReceivedEventId]]);
    await centralPool.query("DELETE FROM vwh_transfer WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM saga_monitoring WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM saga_transaction WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM dieu_chuyen_central WHERE ma_phieu_dc = $1", [testMaPhieu]);
    console.log('[DỌN DẸP] Hoàn tất.');

    console.log('\n================================================================');
    console.log('TẤT CẢ 5/5 BÀI TEST ĐÃ VƯỢT QUA VỚI BẰNG CHỨNG XÁC THỰC RÕ RÀNG!');
    console.log('================================================================');
  } catch (err) {
    console.error('\n*** LỖI KIỂM THỬ FATAL ***:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runVerification();
