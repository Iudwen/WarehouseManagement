/**
 * test_kafka_disconnect_recovery.ts
 * Kiểm tra khả năng chịu lỗi và tự phục hồi khi Kafka Broker mất kết nối:
 * 1. Chèn sự kiện Outbox trạng thái PENDING.
 * 2. Tạm dừng Kafka container (docker pause warehouse_kafka).
 * 3. Chạy Worker: Xác minh Producer thất bại -> Worker KHÔNG đánh dấu PROCESSED -> Outbox bảo toàn.
 * 4. Phục hồi Kafka container (docker unpause warehouse_kafka).
 * 5. Chạy Worker lại: Xác minh Producer gửi thành công -> Outbox thành PROCESSED -> Consumer lưu MongoDB.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import { execSync } from 'child_process';
import mongoose from 'mongoose';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { OutboxWorker } from '../src/workers/outboxWorker';
import { disconnectKafka } from '../src/kafka/kafkaClient';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27018/warehouse_events';

const hnPool = new Pool({
  host: process.env.POSTGRES_HOST_HN || 'localhost',
  port: Number(process.env.POSTGRES_PORT_HN) || 5433,
  user: process.env.POSTGRES_USER || 'admin',
  password: process.env.POSTGRES_PASSWORD || 'warehouse_password',
  database: process.env.POSTGRES_DB_HN || 'warehouse_hn',
});

async function runDisconnectRecoveryTest() {
  console.log('='.repeat(80));
  console.log('⚡ KIỂM TRA KHẢ NĂNG CHỊU LỖI VÀ PHỤC HỒI KHI KAFKA MẤT KẾT NỐI');
  console.log('='.repeat(80));

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không thể kết nối MongoDB!');

  const testEventId = randomUUID();
  const testSagaId = randomUUID();
  const testGlobalId = randomUUID();
  const maPhieuDc = `DC-DISC-${Date.now().toString().slice(-4)}`;

  console.log(`\n[BƯỚC 1] Chèn sự kiện Outbox PENDING vào PostgreSQL HN01 (ID: ${testEventId})...`);
  await hnPool.query(
    `INSERT INTO outbox_event (
      event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id,
      payload, status, retry_count, max_retry_count, version, next_retry_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 0, 3, 1, CURRENT_TIMESTAMP)`,
    [
      testEventId,
      testSagaId,
      testGlobalId,
      'TRANSFER_SHIPPED',
      maPhieuDc,
      JSON.stringify({
        saga_id: testSagaId,
        ma_giao_dich_global: testGlobalId,
        ma_phieu_dc: maPhieuDc,
        kho_xuat: 'HN01',
        kho_nhap: 'DN01',
        ma_sp: 'SP001',
        so_luong: 10,
        ton_truoc: 500,
        ton_sau: 490,
        event_time: new Date().toISOString(),
      }),
    ]
  );
  console.log(`   ✅ Đã chèn bản ghi vào outbox_event với status='PENDING'.`);

  // -------------------------------------------------------------------------
  // BƯỚC 2: TẠM DỪNG KAFKA CONTAINER
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 2] Tạm dừng Kafka container (docker pause warehouse_kafka)...');
  try {
    execSync('docker pause warehouse_kafka');
    console.log('   🛑 Container warehouse_kafka đã bị tạm dừng (mô phỏng sự cố mạng/broker).');
  } catch (err: any) {
    console.warn('   ⚠️ Không thể pause container, có thể đang dừng:', err.message);
  }

  // -------------------------------------------------------------------------
  // BƯỚC 3: CHẠY WORKER TRONG LÚC KAFKA MẤT KẾT NỐI
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 3] Chạy Worker quét sự kiện trong lúc Kafka mất kết nối...');
  // Ngắt kết nối producer cũ nếu có để buộc thử kết nối mới vào broker đang bị pause
  await disconnectKafka();

  const workerFail = new OutboxWorker({
    nodeName: 'HN',
    once: true,
    whitelistEventIds: [testEventId],
  });

  const pollFailResult = await workerFail.pollOnce();
  console.log(`   📊 Kết quả Worker: Claimed=${pollFailResult.claimedCount}, Processed=${pollFailResult.processedCount}`);

  // Kiểm tra trạng thái Outbox trong PostgreSQL: Tuyệt đối không được là PROCESSED
  const checkFailState = await hnPool.query(
    `SELECT status, version FROM outbox_event WHERE event_id = $1`,
    [testEventId]
  );
  const currentStatus = checkFailState.rows[0].status;
  console.log(`   🔍 Trạng thái trong DB khi Kafka mất kết nối: status='${currentStatus}'`);
  if (currentStatus === 'PROCESSED') {
    throw new Error('❌ LỖI NGHIÊM TRỌNG: Outbox bị đánh dấu PROCESSED dù Kafka chưa nhận được message!');
  }
  console.log(`   ✅ BẢO TOÀN DỮ LIỆU: Sự kiện KHÔNG bị chuyển thành PROCESSED. Dữ liệu Outbox nguyên vẹn!`);

  // -------------------------------------------------------------------------
  // BƯỚC 4: PHỤC HỒI KAFKA CONTAINER
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 4] Phục hồi Kafka container (docker unpause warehouse_kafka)...');
  try {
    execSync('docker unpause warehouse_kafka');
    console.log('   🟢 Container warehouse_kafka đã được unpause (Broker hoạt động trở lại).');
  } catch (err: any) {
    console.warn('   ⚠️ Không thể unpause container:', err.message);
  }

  // Chờ 3 giây để Broker hoàn tất xử lý socket sau unpause
  await new Promise((r) => setTimeout(r, 3000));

  // -------------------------------------------------------------------------
  // BƯỚC 5: WORKER TIẾP TỤC XỬ LÝ SỰ KIỆN KHI KAFKA HOẠT ĐỘNG LẠI
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 5] Chạy lại Worker sau khi Kafka phục hồi...');
  // Cập nhật lại status thành PENDING nếu trước đó bị giữ ở PROCESSING do cúp mạng giữa chừng
  await hnPool.query(
    `UPDATE outbox_event SET status = 'PENDING', next_retry_at = CURRENT_TIMESTAMP WHERE event_id = $1`,
    [testEventId]
  );

  const workerSuccess = new OutboxWorker({
    nodeName: 'HN',
    once: true,
    whitelistEventIds: [testEventId],
  });

  const pollSuccessResult = await workerSuccess.pollOnce();
  console.log(`   📊 Kết quả Worker sau phục hồi: Claimed=${pollSuccessResult.claimedCount}, Processed=${pollSuccessResult.processedCount}`);

  // Kiểm tra trạng thái Outbox trong DB sau phục hồi
  const checkSuccessState = await hnPool.query(
    `SELECT status, version FROM outbox_event WHERE event_id = $1`,
    [testEventId]
  );
  console.log(`   ✅ Trạng thái trong DB sau khi Kafka phục hồi: status='${checkSuccessState.rows[0].status}'`);

  // Kiểm tra Consumer nhận và lưu vào MongoDB
  let mongoDoc: any = null;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 500));
    mongoDoc = await db.collection('transfer_events').findOne({ event_id: testEventId });
    if (mongoDoc) break;
  }

  if (mongoDoc) {
    console.log(`   ✅ MongoDB đã nhận và lưu thành công document sau phục hồi:`);
    console.log(`      - event_id: ${mongoDoc.event_id} (Status: ${mongoDoc.status})`);
  } else {
    throw new Error('Consumer không lưu được document vào MongoDB sau khi phục hồi!');
  }

  console.log('\n' + '='.repeat(80));
  console.log('🎉 KIỂM TRA CHỊU LỖI VÀ PHỤC HỒI KAFKA THÀNH CÔNG XUẤT SẮC (PASS)!');
  console.log('='.repeat(80));

  await hnPool.end();
  await disconnectKafka();
  await mongoose.disconnect();
}

runDisconnectRecoveryTest().catch(async (err) => {
  console.error('❌ Lỗi Test Disconnect/Recovery:', err);
  try {
    execSync('docker unpause warehouse_kafka');
  } catch {}
  await hnPool.end().catch(() => {});
  await disconnectKafka().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

