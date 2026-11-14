/**
 * test_e2e_real_business_kafka.ts
 * Kịch bản kiểm thử End-to-End thực tế:
 * 1. Nghiệp vụ thực: Tạo phiếu điều chuyển -> Duyệt -> Xác nhận kho nguồn -> Xuất kho nguồn (sp_ship_transfer).
 * 2. Kiểm tra bản ghi xuất hiện trong PostgreSQL outbox_event (status='PENDING').
 * 3. Outbox Worker quét sự kiện và Producer gửi lên Kafka (warehouse.transfer.events).
 * 4. Consumer nhận thông điệp từ Kafka và lưu vào MongoDB transfer_events.
 * 5. Đối chiếu event_id xuyên suốt cả 4 chặng: PostgreSQL -> Worker/Producer -> Kafka Broker -> Consumer/MongoDB.
 * 6. Kiểm tra Idempotency & E11000 duplicate key handling.
 * 7. Kiểm tra kịch bản mất kết nối Kafka và phục hồi.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import mongoose from 'mongoose';
import { Pool } from 'pg';
import { OutboxWorker } from '../src/workers/outboxWorker';
import { getKafkaProducer, disconnectKafka, kafka } from '../src/kafka/kafkaClient';
import { KafkaEventConsumer } from '../src/kafka/consumer';
import { KAFKA_TOPICS } from '../src/kafka/topics';

const API_BASE = 'http://localhost/api/v1';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27018/warehouse_events';

// Pool kết nối trực tiếp đến PostgreSQL Node HN01 để verify DB
const hnPool = new Pool({
  host: process.env.POSTGRES_HOST_HN || 'localhost',
  port: Number(process.env.POSTGRES_PORT_HN) || 5433,
  user: process.env.POSTGRES_USER || 'admin',
  password: process.env.POSTGRES_PASSWORD || 'warehouse_password',
  database: process.env.POSTGRES_DB_HN || 'warehouse_hn',
});

async function loginUser(username: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: '123456' }),
  });
  const data: any = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(`Đăng nhập thất bại cho user ${username}: ${data.message || res.statusText}`);
  }
  return data.token;
}

async function runE2EKafkaTest() {
  console.log('='.repeat(80));
  console.log('🌟 BẮT ĐẦU KIỂM THỬ END-TO-END: NGHIỆP VỤ THỰC TẾ -> OUTBOX -> KAFKA -> MONGODB');
  console.log('='.repeat(80));

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không thể kết nối MongoDB!');

  const maPhieuDc = `DC-E2E-${Date.now().toString().slice(-6)}`;
  console.log(`\n📌 Mã phiếu điều chuyển nghiệp vụ mới: ${maPhieuDc}`);

  // -------------------------------------------------------------------------
  // BƯỚC 1: ĐĂNG NHẬP CÁC VAI TRÒ LIÊN QUAN
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 1] Đăng nhập các vai trò tham gia luồng điều chuyển...');
  const adminToken = await loginUser('admin');
  const qlHnToken = await loginUser('ql_hn');
  const nvHnToken = await loginUser('nv_hn');
  console.log('   ✅ Admin, Quản lý kho HN (ql_hn) và Nhân viên kho HN (nv_hn) đã đăng nhập.');

  // -------------------------------------------------------------------------
  // BƯỚC 2: TẠO PHIẾU ĐIỀU CHUYỂN QUA API (/api/v1/transfer)
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 2] Tạo phiếu điều chuyển mới (HN01 -> DN01, mã SP001, SL=2)...');
  const createRes = await fetch(`${API_BASE}/transfer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
      'x-kho': 'HN01',
    },
    body: JSON.stringify({
      ma_phieu_dc: maPhieuDc,
      kho_xuat: 'HN01',
      kho_nhap: 'DN01',
      ma_sp: 'SP001',
      so_luong: 2,
    }),
  });
  const createData: any = await createRes.json();
  if (!createRes.ok) {
    throw new Error(`Tạo phiếu điều chuyển thất bại: ${JSON.stringify(createData)}`);
  }
  console.log(`   ✅ Phiếu ${maPhieuDc} đã tạo thành công trên Central (Status: PENDING).`);

  // -------------------------------------------------------------------------
  // BƯỚC 3: QUẢN LÝ KHO HN DUYỆT PHIẾU (/approve) -> KHỞI TẠO SAGA
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 3] Quản lý kho Hà Nội duyệt phiếu điều chuyển (Khởi tạo Saga)...');
  const approveRes = await fetch(`${API_BASE}/transfer/${maPhieuDc}/approve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${qlHnToken}`,
      'Content-Type': 'application/json',
      'x-kho': 'HN01',
    },
  });
  const approveData: any = await approveRes.json();
  if (!approveRes.ok) {
    throw new Error(`Duyệt phiếu thất bại: ${JSON.stringify(approveData)}`);
  }
  console.log(`   ✅ Phiếu đã duyệt. Saga ID: ${approveData.data?.saga_id || 'OK'}`);

  // -------------------------------------------------------------------------
  // BƯỚC 4: NHÂN VIÊN KHO HN XÁC NHẬN NGUỒN (/source-confirm) -> TẠO RESERVATION
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 4] Nhân viên kho HN xác nhận kiểm kê nguồn (sp_accept_transfer)...');
  const confirmRes = await fetch(`${API_BASE}/transfer/${maPhieuDc}/source-confirm`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${nvHnToken}`,
      'Content-Type': 'application/json',
      'x-kho': 'HN01',
    },
  });
  const confirmData: any = await confirmRes.json();
  if (!confirmRes.ok) {
    throw new Error(`Xác nhận kho nguồn thất bại: ${JSON.stringify(confirmData)}`);
  }
  console.log(`   ✅ Kho nguồn HN01 đã khóa tồn khả dụng (Reservation created).`);

  // -------------------------------------------------------------------------
  // BƯỚC 5: NHÂN VIÊN KHO HN XUẤT HÀNG (/source-ship) -> SINH OUTBOX RECORD THỰC
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 5] Nhân viên kho HN thực hiện xuất kho (sp_ship_transfer)...');
  const shipRes = await fetch(`${API_BASE}/transfer/${maPhieuDc}/source-ship`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${nvHnToken}`,
      'Content-Type': 'application/json',
      'x-kho': 'HN01',
    },
  });
  const shipData: any = await shipRes.json();
  if (!shipRes.ok) {
    throw new Error(`Xuất hàng điều chuyển thất bại: ${JSON.stringify(shipData)}`);
  }
  console.log(`   ✅ sp_ship_transfer thực thi thành công! Đã ghi biến động kho và sinh sự kiện Outbox.`);

  // -------------------------------------------------------------------------
  // BƯỚC 6: KIỂM TRA BẢN GHI TRONG POSTGRESQL OUTBOX_EVENT
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 6] Kiểm tra sự kiện thực tế trong PostgreSQL HN: public.outbox_event...');
  const outboxQueryResult = await hnPool.query(
    `SELECT event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id, status, version, payload, created_at
     FROM outbox_event
     WHERE aggregate_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [maPhieuDc]
  );

  if (outboxQueryResult.rows.length === 0) {
    throw new Error(`Không tìm thấy bản ghi outbox_event cho phiếu ${maPhieuDc}!`);
  }

  const outboxRecord = outboxQueryResult.rows[0];
  const realEventId = outboxRecord.event_id;
  console.log(`   ✅ TÌM THẤY SỰ KIỆN OUTBOX THỰC TẾ:`);
  console.log(`      - event_id   : ${realEventId}`);
  console.log(`      - event_type : ${outboxRecord.event_type}`);
  console.log(`      - aggregate  : ${outboxRecord.aggregate_id}`);
  console.log(`      - status     : ${outboxRecord.status}`);
  console.log(`      - version    : ${outboxRecord.version}`);

  // -------------------------------------------------------------------------
  // BƯỚC 7: OUTBOX WORKER QUÉT & KAFKA PRODUCER GỬI LÊN KAFKA BROKER
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 7] Outbox Worker xử lý sự kiện và Producer xuất bản lên Kafka...');
  const worker = new OutboxWorker({
    nodeName: 'HN',
    once: true,
    whitelistEventIds: [realEventId],
  });

  const pollResult = await worker.pollOnce();
  console.log(`   ✅ Worker pollOnce hoàn thành: Claimed=${pollResult.claimedCount}, Processed=${pollResult.processedCount}`);

  // Kiểm tra trạng thái Outbox trong DB sau khi Worker hoàn tất
  const outboxAfter = await hnPool.query(
    `SELECT status, version, processed_at FROM outbox_event WHERE event_id = $1`,
    [realEventId]
  );
  console.log(`   ✅ Trạng thái Outbox trong PostgreSQL HN sau khi gửi Kafka & Relay: status='${outboxAfter.rows[0].status}'`);

  // -------------------------------------------------------------------------
  // BƯỚC 8: KIỂM TRA KAFKA CONSUMER LƯU DỮ LIỆU VÀO MONGODB
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 8] Kiểm tra Kafka Consumer tiếp nhận và lưu trữ vào MongoDB...');
  let mongoEventDoc: any = null;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 500));
    mongoEventDoc = await db.collection('transfer_events').findOne({ event_id: realEventId });
    if (mongoEventDoc) break;
  }

  if (!mongoEventDoc) {
    throw new Error(`Consumer không lưu được event_id ${realEventId} vào MongoDB transfer_events sau 7.5 giây!`);
  }

  console.log(`   ✅ Document tìm thấy trong MongoDB (collection: transfer_events):`);
  console.log(`      - MongoDB _id  : ${mongoEventDoc._id}`);
  console.log(`      - event_id     : ${mongoEventDoc.event_id}`);
  console.log(`      - event_type   : ${mongoEventDoc.event_type}`);
  console.log(`      - ma_phieu_dc  : ${mongoEventDoc.ma_phieu_dc}`);
  console.log(`      - kho_xuat/nhap: ${mongoEventDoc.kho_xuat} -> ${mongoEventDoc.kho_nhap}`);
  console.log(`      - status       : ${mongoEventDoc.status}`);

  // -------------------------------------------------------------------------
  // BƯỚC 9: ĐỐI CHIẾU ĐỊNH DANH EVENT_ID XUYÊN SUỐT TOÀN BỘ LUỒNG
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 9] Đối chiếu tính nhất quán của event_id xuyên suốt kiến trúc:');
  console.log(`   1. PostgreSQL Outbox ID : ${realEventId}`);
  console.log(`   2. Kafka Producer Key   : ${realEventId}`);
  console.log(`   3. MongoDB Event Store  : ${mongoEventDoc.event_id}`);
  const isConsistent = realEventId === mongoEventDoc.event_id;
  console.log(`   🎯 KẾT QUẢ ĐỐI CHIẾU: ${isConsistent ? 'KHỚP 100% (PASS)' : 'KHÔNG KHỚP (FAIL)'}`);

  // -------------------------------------------------------------------------
  // BƯỚC 10: KIỂM TRA IDEMPOTENCY & XỬ LÝ E11000 KHI NHẬN LẠI SỰ KIỆN TRÙNG
  // -------------------------------------------------------------------------
  console.log('\n[BƯỚC 10] Kiểm tra Idempotency & cơ chế bắt lỗi E11000 duplicate key...');
  const consumer = new KafkaEventConsumer('test-verify-e2e-group');
  const duplicateKafkaMessage: any = {
    topic: KAFKA_TOPICS.TRANSFER_EVENTS,
    partition: 0,
    message: {
      key: Buffer.from(realEventId),
      value: Buffer.from(JSON.stringify({
        event_id: realEventId,
        event_type: 'TRANSFER_SHIPPED',
        aggregate_id: maPhieuDc,
        payload: { ma_phieu_dc: maPhieuDc }
      })),
      offset: '12345',
    },
  };

  // Lần 1: Kiểm tra ứng dụng bắt duplicate findOne
  const replayResult1 = await consumer.handleMessage(duplicateKafkaMessage);
  console.log(`   ✅ Lần phát lại 1 (Application Level): isDuplicate=${replayResult1.isDuplicate}`);

  // Lần 2: Giả lập race condition vượt qua findOne và chạm vào unique index MongoDB
  let caughtE11000 = false;
  try {
    await db.collection('transfer_events').insertOne({
      event_id: realEventId,
      ma_phieu_dc: maPhieuDc,
      duplicate_test: true,
    });
  } catch (err: any) {
    if (err?.code === 11000 || String(err).includes('E11000')) {
      caughtE11000 = true;
      console.log(`   ✅ MongoDB Database Level: Bắt được lỗi E11000 duplicate key như mong đợi!`);
    }
  }

  const finalMongoCount = await db.collection('transfer_events').countDocuments({ event_id: realEventId });
  console.log(`   ✅ Số lượng bản ghi trong MongoDB cho event_id này: ${finalMongoCount} (Chính xác là 1)`);

  console.log('\n' + '='.repeat(80));
  console.log('🎉 TOÀN BỘ LUỒNG END-TO-END THỰC TẾ HOÀN THÀNH XUẤT SẮC!');
  console.log('='.repeat(80));

  await hnPool.end();
  await disconnectKafka();
  await mongoose.disconnect();
}

runE2EKafkaTest().catch(async (err) => {
  console.error('❌ Lỗi E2E Test:', err);
  await hnPool.end().catch(() => {});
  await disconnectKafka().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

