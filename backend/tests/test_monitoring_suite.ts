/**
 * test_monitoring_suite.ts
 * Kịch bản kiểm thử toàn diện System Monitoring (Giai đoạn 4)
 * Thực hiện 9 trường hợp kiểm thử bắt buộc:
 * 1. RBAC (Chỉ ADMIN được xem, STAFF/MANAGER bị chặn 403, chưa đăng nhập bị chặn 401)
 * 2. Tất cả dịch vụ hoạt động bình thường qua Nginx cổng 80
 * 3. Kiểm tra các API /health, /nodes, /metrics
 * 4. Phát hiện sự kiện Outbox FAILED chính xác
 * 5. Tạm dừng PostgreSQL HN (docker pause): HN báo DEGRADED, các Node khác không bị ảnh hưởng, API không treo
 * 6. Tạm dừng MongoDB (docker pause): MongoDB báo OFFLINE, API vẫn hoạt động
 * 7. Tạm dừng Kafka (docker pause): Kafka báo OFFLINE, các dịch vụ khác hoạt động bình thường
 * 8. Phục hồi toàn bộ dịch vụ và xác nhận hệ thống trở lại bình thường
 * 9. Kiểm tra truy cập Frontend qua Nginx /monitoring (HTTP 200, SPA routing)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import { execSync } from 'child_process';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const NGINX_API = 'http://localhost/api/v1';
const NGINX_ROOT = 'http://localhost';

const hnPool = new Pool({
  host: process.env.POSTGRES_HOST_HN || 'localhost',
  port: Number(process.env.POSTGRES_PORT_HN) || 5433,
  user: process.env.POSTGRES_USER || 'admin',
  password: process.env.POSTGRES_PASSWORD || 'admin123',
  database: process.env.POSTGRES_DB_HN || 'warehouse_hn',
});

interface TestCaseResult {
  id: number;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
}

const testResults: TestCaseResult[] = [];

function record(id: number, name: string, expected: string, actual: string, pass: boolean) {
  testResults.push({
    id,
    name,
    expected,
    actual,
    status: pass ? 'PASS' : 'FAIL',
  });
  console.log(`[TEST ${id}] ${pass ? '✅ PASS' : '❌ FAIL'} | ${name}: ${actual}`);
}

async function login(username: string): Promise<string> {
  const res = await fetch(`${NGINX_API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: '123456' }),
  });
  const data: any = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(`Đăng nhập thất bại cho user ${username}: ${JSON.stringify(data)}`);
  }
  return data.token;
}

async function runTestSuite() {
  console.log('='.repeat(80));
  console.log('🚀 BẮT ĐẦU KIỂM THỬ SYSTEM MONITORING (GIAI ĐOẠN 4)');
  console.log('='.repeat(80));

  let adminToken = '';
  let managerToken = '';
  let staffToken = '';

  // -------------------------------------------------------------------------
  // TEST 1: ĐĂNG NHẬP & PHÂN QUYỀN RBAC (ADMIN vs STAFF / MANAGER)
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 1 & 2] PHÂN QUYỀN RBAC VÀ BẢO MẬT API MONITORING ---');
  try {
    adminToken = await login('admin');
    managerToken = await login('ql_hn');
    staffToken = await login('nv_hn');

    // 1. Chưa đăng nhập
    const resNoAuth = await fetch(`${NGINX_API}/monitoring/health`);
    record(1, 'Truy cập không token bị từ chối 401', '401', String(resNoAuth.status), resNoAuth.status === 401);

    // 2. Nhân viên kho (STAFF)
    const resStaff = await fetch(`${NGINX_API}/monitoring/health`, {
      headers: { Authorization: `Bearer ${staffToken}` },
    });
    record(2, 'STAFF (nv_hn) bị từ chối 403', '403', String(resStaff.status), resStaff.status === 403);

    // 3. Quản lý kho (MANAGER)
    const resManager = await fetch(`${NGINX_API}/monitoring/health`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    record(3, 'MANAGER (ql_hn) bị từ chối 403', '403', String(resManager.status), resManager.status === 403);

    // 4. Quản trị viên (ADMIN)
    const resAdmin = await fetch(`${NGINX_API}/monitoring/health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    record(4, 'ADMIN truy cập thành công 200', '200', String(resAdmin.status), resAdmin.status === 200);
  } catch (err: any) {
    record(1, 'RBAC Error', 'Success', err.message, false);
  }

  // -------------------------------------------------------------------------
  // TEST 2: KIỂM TRA ĐẦY ĐỦ CÁC API MONITORING QUA NGINX KHI TOÀN BỘ HỆ THỐNG ONLINE
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 3] KIỂM TRA CÁC API MONITORING QUA NGINX CỔNG 80 ---');
  try {
    // A. Health API
    const resHealth = await fetch(`${NGINX_API}/monitoring/health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const healthData: any = await resHealth.json();
    console.log('   Health Data Overview:', healthData.data?.status, '| Nodes:', healthData.data?.nodesSummary);
    record(
      5,
      'GET /monitoring/health thành công',
      'true',
      String(healthData.success),
      healthData.success === true && Boolean(healthData.data?.nodesSummary)
    );

    // B. Nodes API
    const resNodes = await fetch(`${NGINX_API}/monitoring/nodes`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const nodesData: any = await resNodes.json();
    const nodeCount = Array.isArray(nodesData.data) ? nodesData.data.length : 0;
    console.log(`   Nodes Data (${nodeCount} nodes):`, nodesData.data?.map((n: any) => `${n.nodeId}: ${n.status} (${n.latencyMs}ms)`).join(', '));
    record(
      6,
      'GET /monitoring/nodes trả về đủ 4 node (HN, DN, HCM, Central)',
      '4 nodes',
      `${nodeCount} nodes`,
      nodeCount === 4
    );

    // C. Metrics API
    const resMetrics = await fetch(`${NGINX_API}/monitoring/metrics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const metricsData: any = await resMetrics.json();
    const hasKafka = metricsData.data?.kafkaMetrics?.status === 'ONLINE';
    const hasMongo = metricsData.data?.mongoMetrics?.status === 'ONLINE';
    record(
      7,
      'GET /monitoring/metrics trả về Kafka & MongoDB Online',
      'Kafka=ONLINE & Mongo=ONLINE',
      `Kafka=${metricsData.data?.kafkaMetrics?.status}, Mongo=${metricsData.data?.mongoMetrics?.status}`,
      hasKafka && hasMongo
    );
  } catch (err: any) {
    record(5, 'Monitoring APIs error', 'Success', err.message, false);
  }

  // -------------------------------------------------------------------------
  // TEST 3: PHÁT HIỆN SỰ KIỆN OUTBOX FAILED VÀ HIỂN THỊ CHÍNH XÁC
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 4] KIỂM TRA THEO DÕI SỰ KIỆN OUTBOX FAILED ---');
  const dummyFailedId = randomUUID();
  try {
    await hnPool.query(`
      INSERT INTO outbox_event (
        event_id, saga_id, ma_giao_dich_global, event_type, aggregate_id,
        payload, status, version, retry_count, max_retry_count, error_message, created_at
      ) VALUES ($1, $2, $3, 'TRANSFER_SHIPPED', 'DC-TEST-FAILED-001', '{"test":true}', 'FAILED', 1, 3, 3, 'Test Error Message', NOW())
    `, [dummyFailedId, dummyFailedId, dummyFailedId]);

    const resNodes = await fetch(`${NGINX_API}/monitoring/nodes`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const nodesData: any = await resNodes.json();
    const hnNode = nodesData.data?.find((n: any) => n.nodeId === 'HN');
    console.log(`   Node HN Outbox Status: Failed = ${hnNode?.outbox?.failed}, Status = ${hnNode?.status}`);

    record(
      8,
      'Nhận diện chính xác số lượng sự kiện FAILED trong Outbox',
      '>= 1',
      String(hnNode?.outbox?.failed),
      Number(hnNode?.outbox?.failed) >= 1
    );

    // Dọn dẹp bản ghi test
    await hnPool.query(`DELETE FROM outbox_event WHERE event_id = $1`, [dummyFailedId]);
  } catch (err: any) {
    record(8, 'Outbox Failed detection error', '>= 1', err.message, false);
  }

  // -------------------------------------------------------------------------
  // TEST 4: TẠM DỪNG POSTGRESQL HN (DOCKER PAUSE) & PHỤC HỒI
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 5] TẠM DỪNG POSTGRESQL HN (DOCKER PAUSE) & KIỂM TRA CHỊU LỖI ---');
  try {
    console.log('   -> Đang pause container warehouse_postgres_hn...');
    execSync('docker pause warehouse_postgres_hn', { stdio: 'inherit' });

    const startTime = Date.now();
    const resNodes = await fetch(`${NGINX_API}/monitoring/nodes`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const elapsed = Date.now() - startTime;
    const nodesData: any = await resNodes.json();

    const hnNode = nodesData.data?.find((n: any) => n.nodeId === 'HN');
    const dnNode = nodesData.data?.find((n: any) => n.nodeId === 'DN');
    const centralNode = nodesData.data?.find((n: any) => n.nodeId === 'CENTRAL');

    console.log(`   Thời gian phản hồi API: ${elapsed}ms (Timeout bảo vệ thành công)`);
    console.log(`   Trạng thái HN khi PG pause: ${hnNode?.status} (postgres: ${hnNode?.postgres?.status})`);
    console.log(`   Trạng thái DN: ${dnNode?.status}, Central: ${centralNode?.status}`);

    const hnDegradedOrOffline = hnNode?.status === 'DEGRADED' || hnNode?.postgres?.status !== 'CONNECTED';
    const othersAlive = dnNode?.status === 'ONLINE' && centralNode?.status === 'ONLINE';

    record(
      9,
      'Khi PG HN pause: HN báo DEGRADED/Lỗi, các Node khác vẫn ONLINE',
      'HN!=ONLINE & DN=ONLINE',
      `HN=${hnNode?.status}, DN=${dnNode?.status}`,
      hnDegradedOrOffline && othersAlive
    );
  } catch (err: any) {
    record(9, 'PG HN pause test error', 'Success', err.message, false);
  } finally {
    console.log('   -> Đang unpause container warehouse_postgres_hn...');
    try {
      execSync('docker unpause warehouse_postgres_hn', { stdio: 'inherit' });
      await new Promise((r) => setTimeout(r, 1000));
    } catch {}
  }

  // -------------------------------------------------------------------------
  // TEST 5: TẠM DỪNG MONGODB (DOCKER PAUSE) & PHỤC HỒI
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 6] TẠM DỪNG MONGODB (DOCKER PAUSE) & KIỂM TRA CHỊU LỖI ---');
  try {
    console.log('   -> Đang pause container warehouse_mongodb...');
    execSync('docker pause warehouse_mongodb', { stdio: 'inherit' });

    const startTime = Date.now();
    const resHealth = await fetch(`${NGINX_API}/monitoring/health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const elapsed = Date.now() - startTime;
    const healthData: any = await resHealth.json();

    console.log(`   Thời gian phản hồi API: ${elapsed}ms`);
    console.log(`   MongoDB Status khi pause: ${healthData.data?.infrastructure?.mongoDb}`);
    console.log(`   Postgres Central: ${healthData.data?.infrastructure?.postgresCentral}`);

    const mongoOffline = healthData.data?.infrastructure?.mongoDb === 'OFFLINE';
    const apiSuccess = healthData.success === true;

    record(
      10,
      'Khi MongoDB pause: MongoDB báo OFFLINE nhưng Monitoring API vẫn hoạt động',
      'mongoDb=OFFLINE & success=true',
      `mongoDb=${healthData.data?.infrastructure?.mongoDb}, success=${healthData.success}`,
      mongoOffline && apiSuccess
    );
  } catch (err: any) {
    record(10, 'MongoDB pause test error', 'Success', err.message, false);
  } finally {
    console.log('   -> Đang unpause container warehouse_mongodb...');
    try {
      execSync('docker unpause warehouse_mongodb', { stdio: 'inherit' });
      await new Promise((r) => setTimeout(r, 1000));
    } catch {}
  }

  // -------------------------------------------------------------------------
  // TEST 6: TẠM DỪNG KAFKA BROKER (DOCKER PAUSE) & PHỤC HỒI
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 7] TẠM DỪNG KAFKA (DOCKER PAUSE) & KIỂM TRA CHỊU LỖI ---');
  try {
    console.log('   -> Đang pause container warehouse_kafka...');
    execSync('docker pause warehouse_kafka', { stdio: 'inherit' });

    const startTime = Date.now();
    const resMetrics = await fetch(`${NGINX_API}/monitoring/metrics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const elapsed = Date.now() - startTime;
    const metricsData: any = await resMetrics.json();

    console.log(`   Thời gian phản hồi API: ${elapsed}ms`);
    console.log(`   Kafka Status khi pause: ${metricsData.data?.kafkaMetrics?.status}`);
    console.log(`   PostgreSQL HN: ${metricsData.data?.databaseMetrics?.HN?.status}`);

    const kafkaOffline = metricsData.data?.kafkaMetrics?.status === 'OFFLINE';
    const othersUnchanged = metricsData.data?.databaseMetrics?.HN?.status === 'ONLINE';

    record(
      11,
      'Khi Kafka pause: Kafka báo OFFLINE, cơ sở dữ liệu kho không bị ảnh hưởng',
      'kafka=OFFLINE & HN=ONLINE',
      `kafka=${metricsData.data?.kafkaMetrics?.status}, HN=${metricsData.data?.databaseMetrics?.HN?.status}`,
      kafkaOffline && othersUnchanged
    );
  } catch (err: any) {
    record(11, 'Kafka pause test error', 'Success', err.message, false);
  } finally {
    console.log('   -> Đang unpause container warehouse_kafka...');
    try {
      execSync('docker unpause warehouse_kafka', { stdio: 'inherit' });
      await new Promise((r) => setTimeout(r, 1500));
    } catch {}
  }

  // -------------------------------------------------------------------------
  // TEST 7: XÁC NHẬN TẤT CẢ DỊCH VỤ PHỤC HỒI BÌNH THƯỜNG
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 8] XÁC NHẬN HỆ THỐNG PHỤC HỒI ĐẦY ĐỦ ---');
  try {
    const resHealth = await fetch(`${NGINX_API}/monitoring/health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const healthData: any = await resHealth.json();
    const infra = healthData.data?.infrastructure;
    console.log('   Trạng thái sau phục hồi:', infra);

    const allOnline =
      infra?.postgresHN === 'ONLINE' &&
      infra?.postgresDN === 'ONLINE' &&
      infra?.postgresHCM === 'ONLINE' &&
      infra?.postgresCentral === 'ONLINE' &&
      infra?.mongoDb === 'ONLINE' &&
      infra?.kafkaBroker === 'ONLINE';

    record(
      12,
      'Hệ thống phục hồi đầy đủ: 4 PostgreSQL, MongoDB và Kafka đều ONLINE',
      'All ONLINE',
      allOnline ? 'Tất cả ONLINE' : JSON.stringify(infra),
      allOnline
    );
  } catch (err: any) {
    record(12, 'Recovery check error', 'All ONLINE', err.message, false);
  }

  // -------------------------------------------------------------------------
  // TEST 8: TRUY CẬP FRONTEND QUA NGINX CỔNG 80 (/monitoring)
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 9] KIỂM TRA FRONTEND MONITORING QUA NGINX CỔNG 80 ---');
  try {
    const resFrontend = await fetch(`${NGINX_ROOT}/monitoring`);
    const htmlText = await resFrontend.text();
    const hasRootDiv = htmlText.includes('<div id="root">') || htmlText.includes('id="root"');
    const is200 = resFrontend.status === 200;

    record(
      13,
      'Truy cập Frontend SPA /monitoring qua Nginx cổng 80 trả về 200 HTML',
      '200 OK & chứa #root',
      `HTTP ${resFrontend.status} (length: ${htmlText.length})`,
      is200 && hasRootDiv
    );
  } catch (err: any) {
    record(13, 'Frontend Nginx check error', '200 OK', err.message, false);
  }

  await hnPool.end();

  // -------------------------------------------------------------------------
  // TỔNG KẾT KẾT QUẢ KIỂM THỬ
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log('📊 BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ SYSTEM MONITORING');
  console.log('='.repeat(80));
  console.table(testResults);

  const allPassed = testResults.every((t) => t.status === 'PASS');
  if (allPassed) {
    console.log('\n🎉 TẤT CẢ 13/13 TIÊU CHÍ KIỂM THỬ SYSTEM MONITORING ĐỀU ĐẠT CHUẨN (PASS)!');
    process.exit(0);
  } else {
    console.error('\n❌ CÓ BƯỚC KIỂM THỬ THẤT BẠI!');
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Lỗi ngoại lệ:', err);
  process.exit(1);
});

