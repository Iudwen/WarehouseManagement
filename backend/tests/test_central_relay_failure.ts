/**
 * test_central_relay_failure.ts
 * 
 * Kiểm thử kịch bản: KAFKA GỬI THÀNH CÔNG NHƯNG CENTRAL RELAY THẤT BẠI
 * 
 * Mục tiêu kiểm chứng:
 * 1. Sự kiện Outbox được Kafka Producer gửi thành công lên topic warehouse.transfer.events.
 * 2. Stored Procedure ở Central DB gặp lỗi (giả lập Saga ID không tồn tại trên Central).
 * 3. Sự kiện Outbox trên Node KHÔNG ĐƯỢC ĐÁNH DẤU LÀ PROCESSED (chuyển sang FAILED/RETRY, bảo toàn dữ liệu outbox).
 * 4. Consumer tiếp nhận message từ Kafka và lưu trữ an toàn vào MongoDB mà không tạo dữ liệu rác hay crash hệ thống.
 * 5. Khi sự kiện được phát lại/thử lại (Replay/Retry), cơ chế Idempotency đảm bảo MongoDB giữ đúng duy nhất 1 bản ghi (không duplicate record).
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import mongoose from 'mongoose';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { getKafkaProducer, disconnectKafka } from '../src/kafka/kafkaClient';
import { sendOutboxEventToKafka } from '../src/kafka/producer';
import { KAFKA_TOPICS } from '../src/kafka/topics';
import { OutboxWorker } from '../src/workers/outboxWorker';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27018/warehouse_events';

// Pool kết nối PostgreSQL Node HN
const hnPool = new Pool({
  host: process.env.POSTGRES_HOST_HN || 'localhost',
  port: Number(process.env.POSTGRES_PORT_HN) || 5433,
  user: process.env.POSTGRES_USER || 'admin',
  password: process.env.POSTGRES_PASSWORD || 'warehouse_password',
  database: process.env.POSTGRES_DB_HN || 'warehouse_hn',
});

// Pool kết nối PostgreSQL Central
const centralPool = new Pool({
  host: process.env.POSTGRES_HOST_CENTRAL || 'localhost',
  port: Number(process.env.POSTGRES_PORT_CENTRAL) || 5436,
  user: process.env.POSTGRES_USER || 'admin',
  password: process.env.POSTGRES_PASSWORD || 'warehouse_password',
  database: process.env.POSTGRES_DB_CENTRAL || 'warehouse_central',
});

interface CheckResult {
  step: string;
  expected: string;
  actual: string;
  pass: boolean;
}

const checkResults: CheckResult[] = [];

function recordCheck(step: string, expected: string, actual: string, pass: boolean) {
  checkResults.push({ step, expected, actual, pass });
  const icon = pass ? '✅ PASS' : '❌ FAIL';
  console.log(`   ${icon} | ${step}: ${actual}`);
}

async function runCentralRelayFailureTest() {
  console.log('='.repeat(80));
  console.log('🧪 KIỂM THỬ: KAFKA GỬI THÀNH CÔNG NHƯNG CENTRAL RELAY THẤT BẠI');
  console.log('='.repeat(80));

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không thể kết nối MongoDB!');

  const testEventId = randomUUID();
  const nonExistentSagaId = randomUUID(); // UUID hoàn toàn không có trong Central saga_transaction
  const testGlobalId = randomUUID();
  const testMaPhieu = `DC-FAIL-${Date.now().toString().slice(-4)}`;

  console.log(`\n📌 THÔNG TIN SỰ KIỆN TEST:`);
  console.log(`   - Event ID           : ${testEventId}`);
  console.log(`   - Non-existent SagaID: ${nonExistentSagaId} (Cố ý không tồn tại ở Central DB)`);
  console.log(`   - Global Trans ID    : ${testGlobalId}`);
  console.log(`   - Mã phiếu DC        : ${testMaPhieu}`);

  const payload = {
    saga_id: nonExistentSagaId,
    ma_giao_dich_global: testGlobalId,
    ma_phieu_dc: testMaPhieu,
    kho_xuat: 'HN01',
    kho_nhap: 'DN01',
    ma_sp: 'SP001',
    so_luong: 15,
    ton_truoc: 100,
    ton_sau: 85,
    event_time: new Date().toISOString(),
  };

  try {
    // -------------------------------------------------------------------------
    // BƯỚC 1: CHÈN BẢN GHI SỰ KIỆN VÀO OUTBOX_EVENT TRÊN NODE HN (STATUS = 'PENDING')
    // -------------------------------------------------------------------------
    console.log('\n[BƯỚC 1] Khởi tạo bản ghi outbox_event trên Node HN...');
    await hnPool.query(
      `INSERT INTO outbox_event (
        event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id,
        payload, status, version, retry_count, max_retry_count, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 1, 0, 3, NOW())`,
      [testEventId, nonExistentSagaId, testGlobalId, 'TRANSFER_SHIPPED', testMaPhieu, JSON.stringify(payload)]
    );

    const initialCheck = await hnPool.query(
      `SELECT event_id, status, version FROM outbox_event WHERE event_id = $1`,
      [testEventId]
    );
    const initialStatus = initialCheck.rows[0]?.status;
    recordCheck('Khởi tạo Outbox Node', 'PENDING', initialStatus, initialStatus === 'PENDING');

    // -------------------------------------------------------------------------
    // BƯỚC 2: KHỞI CHẠY OUTBOX WORKER VỚI BẢN GHI NÀY
    // -------------------------------------------------------------------------
    console.log('\n[BƯỚC 2] Outbox Worker tiến hành xử lý sự kiện...');
    console.log('   Luồng dự kiến: Gửi Kafka THÀNH CÔNG -> Central Relay THẤT BẠI do không tìm thấy Saga -> Outbox cập nhật FAILED.');

    const worker = new OutboxWorker({
      nodeName: 'HN',
      once: true,
      whitelistEventIds: [testEventId],
    });

    const pollResult = await worker.pollOnce();
    console.log(`   Worker pollOnce hoàn tất: Claimed=${pollResult.claimedCount}, Processed=${pollResult.processedCount}`);
    
    // Kiểm tra kết quả relay trả về từ worker
    const relayRes = pollResult.results.find((r) => r.eventId === testEventId);
    console.log(`   Kết quả relay trả về:`, relayRes);
    recordCheck(
      'Worker ghi nhận Relay thất bại',
      'false',
      String(relayRes?.success),
      relayRes?.success === false
    );
    recordCheck(
      'Phân loại lỗi Relay',
      'BUSINESS_ERROR',
      relayRes?.errorType || 'NONE',
      relayRes?.errorType === 'BUSINESS_ERROR'
    );

    // -------------------------------------------------------------------------
    // BƯỚC 3: KIỂM TRA TRẠNG THÁI OUTBOX TRÊN NODE HN
    // -------------------------------------------------------------------------
    console.log('\n[BƯỚC 3] Kiểm tra bảng outbox_event trên Node HN sau khi Central Relay thất bại...');
    const outboxAfter = await hnPool.query(
      `SELECT event_id, status, version, retry_count, processed_at, error_message
       FROM outbox_event WHERE event_id = $1`,
      [testEventId]
    );

    const row = outboxAfter.rows[0];
    console.log(`   - Status hiện tại      : ${row.status}`);
    console.log(`   - Processed_at         : ${row.processed_at}`);
    console.log(`   - Version              : ${row.version}`);
    console.log(`   - Error message        : ${row.error_message}`);

    recordCheck(
      'Outbox KHÔNG bị đánh dấu PROCESSED',
      'status != PROCESSED',
      `status = ${row.status}`,
      row.status !== 'PROCESSED'
    );
    recordCheck(
      'Outbox ghi nhận trạng thái FAILED có kiểm soát',
      'FAILED',
      row.status,
      row.status === 'FAILED'
    );
    recordCheck(
      'Processed_at phải là NULL (không coi là xong)',
      'null',
      String(row.processed_at),
      row.processed_at === null
    );
    recordCheck(
      'Error message chứa chi tiết lỗi từ Central DB',
      'Không tìm thấy Saga',
      row.error_message?.includes('Không tìm thấy Saga') ? 'Chứa [Không tìm thấy Saga]' : row.error_message,
      Boolean(row.error_message?.includes('Không tìm thấy Saga'))
    );

    // -------------------------------------------------------------------------
    // BƯỚC 4: KIỂM TRA KAFKA BROKER & MONGODB CONSUMER
    // -------------------------------------------------------------------------
    console.log('\n[BƯỚC 4] Kiểm tra thông điệp trên Kafka đã được Consumer lưu vào MongoDB...');
    let mongoDoc: any = null;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 400));
      mongoDoc = await db.collection('transfer_events').findOne({ event_id: testEventId });
      if (mongoDoc) break;
    }

    recordCheck(
      'Consumer nhận thông điệp từ Kafka và lưu vào MongoDB',
      'Đã tồn tại',
      mongoDoc ? `Đã lưu _id: ${mongoDoc._id}` : 'Không tìm thấy',
      Boolean(mongoDoc)
    );

    if (mongoDoc) {
      console.log(`   ✅ Dữ liệu audit log trong MongoDB:`);
      console.log(`      - event_id   : ${mongoDoc.event_id}`);
      console.log(`      - event_type : ${mongoDoc.event_type}`);
      console.log(`      - ma_phieu_dc: ${mongoDoc.ma_phieu_dc}`);
      console.log(`      - status     : ${mongoDoc.status}`);
    }

    // -------------------------------------------------------------------------
    // BƯỚC 5: KIỂM TRA IDEMPOTENCY KHI SỰ KIỆN ĐƯỢC THỬ LẠI / PHÁT LẠI (REPLAY)
    // -------------------------------------------------------------------------
    console.log('\n[BƯỚC 5] Kiểm tra Idempotency: Phát lại sự kiện (Replay/Retry) với cùng event_id...');
    
    // Tạo giả lập sự kiện để gửi lại lên Kafka với đúng testEventId
    const retryMockEvent: any = {
      event_id: testEventId,
      saga_id: nonExistentSagaId,
      ma_giao_dich_global: testGlobalId,
      event_type: 'TRANSFER_SHIPPED',
      aggregate_id: testMaPhieu,
      payload,
      version: row.version,
      status: 'PROCESSING',
    };

    console.log('   -> Producer phát lại message lên topic warehouse.transfer.events...');
    await sendOutboxEventToKafka(retryMockEvent, 'HN');

    // Chờ Consumer xử lý message thứ 2
    console.log('   -> Đang chờ Consumer nhận và áp dụng Idempotency Guard...');
    await new Promise((r) => setTimeout(r, 2000));

    const totalCount = await db.collection('transfer_events').countDocuments({ event_id: testEventId });
    console.log(`   -> Số lượng bản ghi trong MongoDB sau khi Replay: ${totalCount}`);

    recordCheck(
      'Idempotency: Không tạo bản ghi trùng lặp trong MongoDB',
      '1',
      String(totalCount),
      totalCount === 1
    );

    // -------------------------------------------------------------------------
    // BƯỚC 6: DỌN DẸP DỮ LIỆU TEST
    // -------------------------------------------------------------------------
    console.log('\n[BƯỚC 6] Dọn dẹp dữ liệu kiểm thử...');
    await hnPool.query(`DELETE FROM outbox_event WHERE event_id = $1`, [testEventId]);
    await db.collection('transfer_events').deleteOne({ event_id: testEventId });
    console.log('   ✅ Đã xóa bản ghi test khỏi PostgreSQL HN và MongoDB.');

  } finally {
    await hnPool.end();
    await centralPool.end();
    await mongoose.disconnect();
    await disconnectKafka();
  }

  // -------------------------------------------------------------------------
  // TỔNG HỢP KẾT QUẢ
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log('📊 BẢNG TỔNG HỢP KIỂM THỬ: CENTRAL RELAY THẤT BẠI');
  console.log('='.repeat(80));
  console.table(checkResults);

  const allPassed = checkResults.every((c) => c.pass);
  if (allPassed) {
    console.log('\n🎉 TẤT CẢ CÁC TIÊU CHÍ ĐỀU ĐẠT! LUỒNG HOẠT ĐỘNG HOÀN TOÀN CHÍNH XÁC THEO THIẾT KẾ!');
    process.exit(0);
  } else {
    console.error('\n❌ CÓ BƯỚC KIỂM THỬ THẤT BẠI!');
    process.exit(1);
  }
}

runCentralRelayFailureTest().catch((err) => {
  console.error('Lỗi ngoại lệ trong quá trình kiểm thử:', err);
  process.exit(1);
});

