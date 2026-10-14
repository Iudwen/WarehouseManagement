const { getDbPool, pools } = require('../dist/config/postgresql');
const { claimEvents } = require('../dist/workers/outboxPoller');
const { OutboxWorker } = require('../dist/workers/outboxWorker');

async function testRelayWithoutCreatedAfter() {
  console.log('================================================================');
  console.log('KIỂM CHỨNG TOÀN DIỆN: LUỒNG OUTBOX RELAY SAU KHI BỎ createdAfter');
  console.log('================================================================\n');

  const hnPool = getDbPool('HN');
  const dnPool = getDbPool('DN');
  const hcmPool = getDbPool('HCM');
  const centralPool = pools.CENTRAL;

  // -------------------------------------------------------------------
  // BƯỚC 1: XÁC MINH TRẠNG THÁI QUARANTINE VÀ BACKUP BẢO TOÀN TRÊN 3 NODE
  // -------------------------------------------------------------------
  console.log('--- BƯỚC 1: XÁC MINH BẢO TOÀN DỮ LIỆU QUARANTINE VÀ BẢNG BACKUP ---');
  
  // HN
  const hnQuarantineRes = await hnPool.query(`
    SELECT 
      count(*) as total_pending,
      count(*) FILTER (WHERE next_retry_at >= '2099-01-01') as quarantined_count,
      count(*) FILTER (WHERE next_retry_at <= CURRENT_TIMESTAMP) as actionable_count
    FROM outbox_event
    WHERE status = 'PENDING'
  `);
  const hnBackupRes = await hnPool.query(`
    SELECT to_regclass('outbox_quarantine_backup_20261014') as tbl, count(*) as cnt 
    FROM outbox_quarantine_backup_20261014
  `);
  console.log('HN Status:', hnQuarantineRes.rows[0]);
  console.log('HN Backup Table:', hnBackupRes.rows[0]);
  if (Number(hnQuarantineRes.rows[0].quarantined_count) !== 25 || Number(hnBackupRes.rows[0].cnt) !== 25) {
    throw new Error(`BẢO VỆ HN THẤT BẠI: Số lượng cách ly không đúng 25 (hiện tại: ${hnQuarantineRes.rows[0].quarantined_count})`);
  }

  // DN
  const dnQuarantineRes = await dnPool.query(`
    SELECT 
      count(*) as total_pending,
      count(*) FILTER (WHERE next_retry_at >= '2099-01-01') as quarantined_count,
      count(*) FILTER (WHERE next_retry_at <= CURRENT_TIMESTAMP) as actionable_count
    FROM outbox_event
    WHERE status = 'PENDING'
  `);
  const dnBackupRes = await dnPool.query(`
    SELECT to_regclass('outbox_quarantine_backup_20261014') as tbl, count(*) as cnt 
    FROM outbox_quarantine_backup_20261014
  `);
  console.log('DN Status:', dnQuarantineRes.rows[0]);
  console.log('DN Backup Table:', dnBackupRes.rows[0]);
  if (Number(dnQuarantineRes.rows[0].quarantined_count) !== 1 || Number(dnBackupRes.rows[0].cnt) !== 1) {
    throw new Error(`BẢO VỆ DN THẤT BẠI: Số lượng cách ly không đúng 1 (hiện tại: ${dnQuarantineRes.rows[0].quarantined_count})`);
  }

  // HCM
  const hcmTotalRes = await hcmPool.query(`SELECT count(*) as total FROM outbox_event`);
  const hcmBackupRes = await hcmPool.query(`SELECT to_regclass('outbox_quarantine_backup_20261014') as tbl`);
  console.log('HCM Total outbox_event:', hcmTotalRes.rows[0]);
  console.log('HCM Backup table:', hcmBackupRes.rows[0].tbl);

  console.log('>>> BƯỚC 1 ĐẠT: Toàn bộ bảng backup và dữ liệu cách ly trên HN (25) & DN (1) được bảo toàn 100%.\n');

  // -------------------------------------------------------------------
  // BƯỚC 2: XÁC MINH CLAIM TIÊU CHUẨN KHÔNG BỊ RÒ RỈ SỰ KIỆN CŨ
  // -------------------------------------------------------------------
  console.log('--- BƯỚC 2: CLAIM TIÊU CHUẨN TRÊN HN, DN, HCM KHÔNG TRẢ VỀ DỮ LIỆU CÁCH LY ---');
  
  // Claim trên HN mà KHÔNG có whitelist, KHÔNG có createdAfter
  const hnClaimed = await claimEvents(hnPool, { limit: 50 });
  console.log('HN standard claim count:', hnClaimed.length);
  if (hnClaimed.length !== 0) {
    throw new Error(`BƯỚC 2 THẤT BẠI: HN claim được ${hnClaimed.length} sự kiện cách ly ngoài ý muốn!`);
  }

  // Claim trên DN mà KHÔNG có whitelist, KHÔNG có createdAfter
  const dnClaimed = await claimEvents(dnPool, { limit: 50 });
  console.log('DN standard claim count:', dnClaimed.length);
  if (dnClaimed.length !== 0) {
    throw new Error(`BƯỚC 2 THẤT BẠI: DN claim được ${dnClaimed.length} sự kiện cách ly ngoài ý muốn!`);
  }

  // Claim trên HCM
  const hcmClaimed = await claimEvents(hcmPool, { limit: 50 });
  console.log('HCM standard claim count:', hcmClaimed.length);
  if (hcmClaimed.length !== 0) {
    throw new Error(`BƯỚC 2 THẤT BẠI: HCM claim được ${hcmClaimed.length} sự kiện!`);
  }

  console.log('>>> BƯỚC 2 ĐẠT: Bỏ createdAfter không làm bất kỳ sự kiện cũ chưa xác minh nào bị claim.\n');

  // -------------------------------------------------------------------
  // BƯỚC 3: KIỂM THỬ XỬ LÝ SỰ KIỆN SINH TRONG QUÁ KHỨ (DOWNTIME RECOVERY)
  // -------------------------------------------------------------------
  console.log('--- BƯỚC 3: KIỂM THỬ XỬ LÝ SỰ KIỆN SINH TRONG QUÁ KHỨ (DOWNTIME RECOVERY) ---');
  
  const testSagaId = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';
  const testGlobalId = '88888888-9999-aaaa-bbbb-cccccccccccc';
  const testMaPhieu = 'DC-TEST-DOWNTIME';
  const testEventId = '99999999-aaaa-bbbb-cccc-dddddddddddd';

  try {
    // Dọn dẹp dữ liệu test cũ nếu có
    await hnPool.query("DELETE FROM outbox_event WHERE event_id = $1::uuid", [testEventId]);
    await centralPool.query("DELETE FROM processed_event WHERE event_id = $1::uuid", [testEventId]);
    await centralPool.query("DELETE FROM vwh_transfer WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM saga_monitoring WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM saga_transaction WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM dieu_chuyen_central WHERE ma_phieu_dc = $1", [testMaPhieu]);

    // Chuẩn bị Saga trên Central
    await centralPool.query(`
      INSERT INTO dieu_chuyen_central (ma_phieu_dc, kho_xuat, kho_nhap, ma_sp, so_luong, trang_thai)
      VALUES ($1, 'HN01', 'HCM01', 'SP001', 10, 'DANG_XU_LY')
    `, [testMaPhieu]);

    await centralPool.query(`
      INSERT INTO saga_transaction (
        saga_id, ma_giao_dich_global, ma_phieu_dc, ma_sp, kho_xuat, kho_nhap,
        so_luong_yeu_cau, so_luong_da_xuat, so_luong_thuc_nhan, so_luong_chenh_lech,
        status, current_state
      ) VALUES (
        $1, $2, $3, 'SP001', 'HN01', 'HCM01',
        10, 0, 0, 0,
        'RUNNING', 'SOURCE_ACCEPTED'
      )
    `, [testSagaId, testGlobalId, testMaPhieu]);

    // Chèn sự kiện TRANSFER_SHIPPED với created_at cách đây 2 giờ (mô phỏng downtime)
    const payload = {
      saga_id: testSagaId,
      ma_giao_dich_global: testGlobalId,
      ma_phieu_dc: testMaPhieu,
      ma_kho: 'HN01',
      kho_xuat: 'HN01',
      ma_sp: 'SP001',
      so_luong: 10,
      ton_truoc: 100,
      ton_sau: 90,
      event_time: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    };

    await hnPool.query(`
      INSERT INTO outbox_event (
        event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id,
        payload, status, version, retry_count, max_retry_count, created_at, next_retry_at
      ) VALUES (
        $1, $2, $3, 'TRANSFER_SHIPPED', $4,
        $5, 'PENDING', 1, 0, 3, CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP
      )
    `, [testEventId, testSagaId, testGlobalId, testMaPhieu, JSON.stringify(payload)]);

    console.log(`Đã chèn sự kiện thử nghiệm: ${testEventId} với created_at = CURRENT_TIMESTAMP - 2 hours`);

    // Khởi tạo OutboxWorker hoàn toàn MẶC ĐỊNH (không whitelist, không createdAfter, không allowUnsafeAllPending)
    const workerHN = new OutboxWorker({
      nodeName: 'HN',
      once: true,
      batchSize: 10
    });

    console.log('Worker HN Config khởi tạo:', workerHN.getConfig());

    // Thực thi pollOnce
    const pollResult = await workerHN.pollOnce();
    console.log('Kết quả Poll Once:', {
      claimedCount: pollResult.claimedCount,
      processedCount: pollResult.processedCount,
      results: pollResult.results.map(r => ({ eventId: r.eventId, success: r.success, vwhId: r.vwhId }))
    });

    if (pollResult.claimedCount !== 1 || pollResult.processedCount !== 1) {
      throw new Error(`BƯỚC 3 THẤT BẠI: Worker không claim hoặc xử lý được sự kiện quá khứ! claimedCount=${pollResult.claimedCount}`);
    }

    // Kiểm tra trạng thái outbox trên HN
    const checkHnRes = await hnPool.query("SELECT status, version, processed_at FROM outbox_event WHERE event_id = $1", [testEventId]);
    console.log('Trạng thái bản ghi test trên HN sau relay:', checkHnRes.rows[0]);
    if (checkHnRes.rows[0]?.status !== 'PROCESSED') {
      throw new Error(`BƯỚC 3 THẤT BẠI: Trạng thái không phải PROCESSED!`);
    }

    // Kiểm tra VWH trên Central
    const checkCentralRes = await centralPool.query("SELECT vwh_id, trang_thai, so_luong_xuat FROM vwh_transfer WHERE saga_id = $1", [testSagaId]);
    console.log('Trạng thái VWH trên Central:', checkCentralRes.rows[0]);
    if (checkCentralRes.rows[0]?.trang_thai !== 'IN_TRANSIT') {
      throw new Error(`BƯỚC 3 THẤT BẠI: VWH không ở trạng thái IN_TRANSIT!`);
    }

    // Xác nhận lại 25 bản ghi cách ly trên HN vẫn nguyên vẹn
    const hnFinalQuarantineCheck = await hnPool.query(`
      SELECT count(*) as quarantined_count 
      FROM outbox_event 
      WHERE status = 'PENDING' AND next_retry_at >= '2099-01-01'
    `);
    console.log('Số lượng bản ghi cách ly còn lại trên HN:', hnFinalQuarantineCheck.rows[0].quarantined_count);
    if (Number(hnFinalQuarantineCheck.rows[0].quarantined_count) !== 25) {
      throw new Error(`CẢNH BÁO BẢO VỆ: 25 bản ghi cách ly bị ảnh hưởng! Hiện tại: ${hnFinalQuarantineCheck.rows[0].quarantined_count}`);
    }

    console.log('>>> BƯỚC 3 ĐẠT: Sự kiện downtime được xử lý thành công, 25 bản ghi cách ly không hề bị động chạm!\n');

    // Dọn dẹp dữ liệu test
    console.log('[DỌN DẸP] Xóa sự kiện kiểm thử cô lập...');
    await hnPool.query("DELETE FROM outbox_event WHERE event_id = $1::uuid", [testEventId]);
    await centralPool.query("DELETE FROM processed_event WHERE event_id = $1::uuid", [testEventId]);
    await centralPool.query("DELETE FROM vwh_transfer WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM saga_monitoring WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM saga_transaction WHERE saga_id = $1::uuid", [testSagaId]);
    await centralPool.query("DELETE FROM dieu_chuyen_central WHERE ma_phieu_dc = $1", [testMaPhieu]);
    console.log('[DỌN DẸP] Đã dọn dẹp sạch sẽ.');

    console.log('\n================================================================');
    console.log('TẤT CẢ CÁC BƯỚC KIỂM CHỨNG ĐÃ THÀNH CÔNG RỰC RỠ 100%!');
    console.log('================================================================');
  } catch (err) {
    console.error('LỖI KIỂM CHỨNG:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

testRelayWithoutCreatedAfter().catch(err => {
  console.error(err);
  process.exit(1);
});
