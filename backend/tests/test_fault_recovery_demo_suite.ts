/**
 * test_fault_recovery_demo_suite.ts
 * Bộ kiểm thử & Demo Kịch bản Chịu lỗi và Phục hồi (Task 5.8 - Fault/Recovery Test & Demo)
 * 
 * Mục tiêu:
 * 1. Thiết lập database kiểm thử 'warehouse_fault_recovery_test_db' với dữ liệu ban đầu
 * 2. Xác nhận Monitoring phát hiện database kiểm thử ban đầu ONLINE (HEALTHY)
 * 3. Mô phỏng sự cố: làm database kiểm thử không khả dụng (Drop test DB / Unreachable)
 * 4. Xác nhận Monitoring phát hiện ngay vấn đề: báo OFFLINE với thông báo lỗi cụ thể
 * 5. Xác minh kho sao lưu (D:\backups) và bản sao độc lập (C:\backups_replica) vẫn nguyên vẹn 100% (SHA-256 khớp)
 * 6. Kích hoạt quy trình khôi phục (Restore Service) từ bản backup hợp lệ
 * 7. Xác nhận Monitoring phát hiện database đã ONLINE trở lại, đầy đủ 19 bảng và dữ liệu mẫu
 * 8. Kiểm tra an toàn: Hệ thống Production (4 PG DBs + 1 Mongo) không hề bị ảnh hưởng hay gián đoạn
 * 9. Dọn dẹp an toàn database kiểm thử sau khi hoàn thành
 */

import { Pool } from 'pg';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const API_BASE = 'http://localhost/api/v1';
const TEST_DB_NAME = 'warehouse_fault_recovery_test_db';

interface TestCaseResult {
  stepId: number;
  phase: string;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  details?: any;
}

const testResults: TestCaseResult[] = [];

function record(
  stepId: number,
  phase: string,
  name: string,
  expected: string,
  actual: string,
  status: 'PASS' | 'FAIL' | 'BLOCKED',
  details?: any
) {
  testResults.push({ stepId, phase, name, expected, actual, status, details });
  const icon = status === 'PASS' ? '✅ PASS' : status === 'BLOCKED' ? '⚠️ BLOCKED' : '❌ FAIL';
  console.log(`[${icon}] Bước ${stepId} (${phase}): ${name}`);
  console.log(`       -> Thực tế: ${actual}`);
}

function calculateSHA256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

async function login(username = 'admin'): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: '123456' }),
  });
  const data: any = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(`Đăng nhập thất bại: ${data.message || res.statusText}`);
  }
  return data.token;
}

async function runFaultRecoveryDemo() {
  console.log('='.repeat(80));
  console.log('🧪 TASK 5.8: BẮT ĐẦU KIỂM THỬ KỊCH BẢN CHỊU LỖI & PHỤC HỒI (FAULT / RECOVERY DEMO)');
  console.log('='.repeat(80));

  let adminToken = '';
  try {
    adminToken = await login('admin');
    record(1, 'AUTH', 'Đăng nhập Quản trị viên (ADMIN)', 'Nhận được JWT token hợp lệ', 'Đăng nhập thành công', 'PASS');
  } catch (err: any) {
    record(1, 'AUTH', 'Đăng nhập ADMIN', 'JWT token', err.message, 'FAIL');
    return;
  }

  // Khởi tạo kết nối bảo trì PostgreSQL để quản lý database kiểm thử
  const maintenancePool = new Pool({
    host: 'localhost',
    port: 5433,
    user: 'admin',
    password: 'admin123',
    database: 'postgres',
  });

  // Lấy danh sách backup gần nhất từ API để chọn tệp nguồn
  let latestPgBackup: any = null;
  try {
    const historyRes = await fetch(`${API_BASE}/backup/history`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const historyJson: any = await historyRes.json();
    const pgBackups = (historyJson.history || []).filter(
      (r: any) => r.backupType === 'POSTGRES' && r.nodeId === 'HN' && r.status === 'SUCCESS' && fs.existsSync(r.originalPath)
    );
    if (pgBackups.length > 0) {
      latestPgBackup = pgBackups[0]; // Bản ghi mới nhất
    }
  } catch (err: any) {
    console.warn('Lỗi khi lấy lịch sử backup:', err.message);
  }

  if (!latestPgBackup) {
    record(2, 'SETUP', 'Tìm bản sao lưu PostgreSQL hợp lệ', 'Có ít nhất 1 bản backup HN hợp lệ', 'Không tìm thấy bản backup nào', 'BLOCKED');
    await maintenancePool.end();
    return;
  }

  record(
    2,
    'SETUP',
    'Xác định tệp sao lưu nguồn hợp lệ',
    'Tệp backup tồn tại trên đĩa và đã qua kiểm định',
    `Tệp: ${latestPgBackup.fileName} (${latestPgBackup.sizeFormatted})`,
    'PASS',
    latestPgBackup
  );

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 1: THIẾT LẬP DATABASE KIỂM THỬ VÀ KIỂM TRA TRẠNG THÁI BAN ĐẦU
  // ---------------------------------------------------------------------------
  console.log('\n--- GIAI ĐOẠN 1: THIẾT LẬP DATABASE KIỂM THỬ VÀ TRẠNG THÁI BAN ĐẦU ---');
  try {
    // 1.1 Xóa sạch DB test cũ nếu có
    await maintenancePool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE);`);

    // 1.2 Khôi phục ban đầu vào database kiểm thử
    const restoreInitRes = await fetch(`${API_BASE}/backup/restore/postgres`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        backupFilePath: latestPgBackup.originalPath,
        targetDatabase: TEST_DB_NAME,
        targetNodeId: 'HN',
        createDbIfNotExists: true,
      }),
    });
    const restoreInitJson: any = await restoreInitRes.json();
    const initOk = restoreInitRes.status === 200 && restoreInitJson.success === true;
    record(
      3,
      'SETUP',
      `Khởi tạo dữ liệu ban đầu cho database kiểm thử '${TEST_DB_NAME}'`,
      'HTTP 200, success=true, 19 bảng',
      `HTTP ${restoreInitRes.status}: ${restoreInitJson.message}`,
      initOk ? 'PASS' : 'FAIL'
    );

    // 1.3 Monitoring kiểm tra trạng thái ban đầu của database kiểm thử
    const monitorInitRes = await fetch(`${API_BASE}/monitoring/check-target`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        database: TEST_DB_NAME,
        port: 5433,
      }),
    });
    const monitorInitJson: any = await monitorInitRes.json();
    const dataInit = monitorInitJson.data;
    const initialHealthy =
      monitorInitRes.status === 200 &&
      dataInit?.status === 'ONLINE' &&
      dataInit?.tableCount === 19 &&
      dataInit?.latencyMs < 500;

    record(
      4,
      'MONITORING_BASELINE',
      `Monitoring xác nhận database kiểm thử '${TEST_DB_NAME}' đang ONLINE (Hoạt động tốt)`,
      'Status=ONLINE, tableCount=19, latencyMs < 500ms',
      `Status=${dataInit?.status}, tableCount=${dataInit?.tableCount}, latency=${dataInit?.latencyMs}ms`,
      initialHealthy ? 'PASS' : 'FAIL',
      dataInit
    );
  } catch (err: any) {
    record(4, 'MONITORING_BASELINE', 'Khởi tạo DB kiểm thử', 'ONLINE', err.message, 'FAIL');
  }

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 2: MÔ PHỎNG SỰ CỐ KIỂM THỬ (FAULT SIMULATION)
  // ---------------------------------------------------------------------------
  console.log('\n--- GIAI ĐOẠN 2: MÔ PHỎNG SỰ CỐ TRÊN DATABASE KIỂM THỬ (FAULT SIMULATION) ---');
  try {
    // Ngắt toàn bộ kết nối và xóa database kiểm thử (mô phỏng mất database/sự cố lưu trữ)
    await maintenancePool.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();
    `);
    await maintenancePool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE);`);

    record(
      5,
      'FAULT_INJECTION',
      `Mô phỏng sự cố: Hủy bỏ database kiểm thử '${TEST_DB_NAME}'`,
      'Database kiểm thử bị gián đoạn/mất kết nối hoàn toàn',
      'Đã drop database kiểm thử an toàn, không ảnh hưởng Production',
      'PASS'
    );

    // Monitoring thực hiện quét và phát hiện sự cố
    const monitorFaultRes = await fetch(`${API_BASE}/monitoring/check-target`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        database: TEST_DB_NAME,
        port: 5433,
      }),
    });
    const monitorFaultJson: any = await monitorFaultRes.json();
    const faultData = monitorFaultJson.data;

    const faultDetected =
      monitorFaultRes.status === 200 &&
      faultData?.status === 'OFFLINE' &&
      faultData?.tableCount === 0 &&
      faultData?.error?.includes('does not exist');

    record(
      6,
      'FAULT_DETECTION',
      'Monitoring lập tức phát hiện sự cố database kiểm thử OFFLINE',
      'Status=OFFLINE, error xác định rõ lý do sự cố, tableCount=0',
      `Status=${faultData?.status}, Lỗi: "${faultData?.error}"`,
      faultDetected ? 'PASS' : 'FAIL',
      faultData
    );
  } catch (err: any) {
    record(6, 'FAULT_DETECTION', 'Phát hiện sự cố', 'OFFLINE', err.message, 'FAIL');
  }

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 3: XÁC MINH TÍNH NGUYÊN VẸN CỦA KHO SAO LƯU & BẢN SAO ĐỘC LẬP
  // ---------------------------------------------------------------------------
  console.log('\n--- GIAI ĐOẠN 3: XÁC MINH TÍNH NGUYÊN VẸN KHO SAO LƯU & REPLICA ---');
  try {
    const originalPath = latestPgBackup.originalPath;
    const replicaPath = latestPgBackup.replicaPath;

    const originalExists = fs.existsSync(originalPath);
    const replicaExists = replicaPath ? fs.existsSync(replicaPath) : false;

    let originalSha = '';
    let replicaSha = '';
    if (originalExists) originalSha = calculateSHA256(originalPath);
    if (replicaExists) replicaSha = calculateSHA256(replicaPath);

    const shaOriginalMatches = originalSha === latestPgBackup.checksumSHA256;
    const shaReplicaMatches = replicaSha === latestPgBackup.checksumSHA256;
    const backupFullyIntact = originalExists && replicaExists && shaOriginalMatches && shaReplicaMatches;

    record(
      7,
      'BACKUP_INTEGRITY',
      'Kho sao lưu gốc (D:) và bản sao độc lập (C:) vẫn nguyên vẹn 100%',
      'Cả 2 file tồn tại, SHA-256 trùng khớp hoàn toàn với metadata',
      `File gốc: ${originalExists} (SHA khớp: ${shaOriginalMatches}) | Replica C: ${replicaExists} (SHA khớp: ${shaReplicaMatches})`,
      backupFullyIntact ? 'PASS' : 'FAIL',
      {
        expectedSHA: latestPgBackup.checksumSHA256,
        actualOriginalSHA: originalSha,
        actualReplicaSHA: replicaSha,
      }
    );
  } catch (err: any) {
    record(7, 'BACKUP_INTEGRITY', 'Kiểm tra tính toàn vẹn backup', 'Khớp SHA-256', err.message, 'FAIL');
  }

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 4: THỰC THI KHÔI PHỤC (DISASTER RECOVERY / RESTORE)
  // ---------------------------------------------------------------------------
  console.log('\n--- GIAI ĐOẠN 4: THỰC THI KHÔI PHỤC (DISASTER RECOVERY / RESTORE) ---');
  let restoreSuccess = false;
  try {
    const restoreRes = await fetch(`${API_BASE}/backup/restore/postgres`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        backupFilePath: latestPgBackup.originalPath,
        targetDatabase: TEST_DB_NAME,
        targetNodeId: 'HN',
        createDbIfNotExists: true,
      }),
    });
    const restoreJson: any = await restoreRes.json();
    restoreSuccess = restoreRes.status === 200 && restoreJson.success === true;

    record(
      8,
      'RESTORE_EXECUTION',
      `Khôi phục database kiểm thử '${TEST_DB_NAME}' từ tệp sao lưu nguyên vẹn`,
      'HTTP 200, success=true, tạo lại DB và phục hồi 19 bảng',
      `HTTP ${restoreRes.status}: ${restoreJson.message}`,
      restoreSuccess ? 'PASS' : 'FAIL',
      restoreJson
    );
  } catch (err: any) {
    record(8, 'RESTORE_EXECUTION', 'Thực thi Restore', 'HTTP 200', err.message, 'FAIL');
  }

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 5: XÁC MINH PHỤC HỒI THÀNH CÔNG VÀ MONITORING TRỞ LẠI ONLINE
  // ---------------------------------------------------------------------------
  console.log('\n--- GIAI ĐOẠN 5: XÁC MINH MONITORING VÀ DỮ LIỆU SAU PHỤC HỒI ---');
  try {
    // 5.1 Monitoring kiểm tra lại trạng thái database kiểm thử
    const monitorRecoveredRes = await fetch(`${API_BASE}/monitoring/check-target`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        database: TEST_DB_NAME,
        port: 5433,
      }),
    });
    const monitorRecoveredJson: any = await monitorRecoveredRes.json();
    const recData = monitorRecoveredJson.data;

    const recoveredOnline =
      monitorRecoveredRes.status === 200 &&
      recData?.status === 'ONLINE' &&
      recData?.tableCount === 19 &&
      recData?.latencyMs < 500;

    record(
      9,
      'MONITORING_RECOVERY',
      `Monitoring xác nhận database kiểm thử '${TEST_DB_NAME}' đã phục hồi ONLINE`,
      'Status chuyển từ OFFLINE -> ONLINE, đầy đủ 19 bảng, latencyMs bình thường',
      `Status=${recData?.status}, tableCount=${recData?.tableCount}, latency=${recData?.latencyMs}ms`,
      recoveredOnline ? 'PASS' : 'FAIL',
      recData
    );

    // 5.2 Đối chiếu dữ liệu nghiệp vụ sau khôi phục
    const testDbPool = new Pool({
      host: 'localhost',
      port: 5433,
      user: 'admin',
      password: 'admin123',
      database: TEST_DB_NAME,
    });
    const sampleQuery = `SELECT ma_sp, ten_sp, gia_ban FROM san_pham ORDER BY ma_sp LIMIT 5;`;
    const sampleRes = await testDbPool.query(sampleQuery);
    await testDbPool.end();

    const dataIntegrityOk = sampleRes.rowCount !== null && sampleRes.rowCount >= 5;
    record(
      10,
      'DATA_VERIFICATION',
      'Kiểm tra tính toàn vẹn dữ liệu mẫu sau khôi phục (Bảng san_pham)',
      'Số lượng bản ghi >= 5, dữ liệu cấu trúc rõ ràng',
      `Phục hồi thành công ${sampleRes.rowCount} bản ghi mẫu, mã SP đầu tiên: ${sampleRes.rows[0]?.ma_sp}`,
      dataIntegrityOk ? 'PASS' : 'FAIL',
      sampleRes.rows
    );
  } catch (err: any) {
    record(10, 'DATA_VERIFICATION', 'Xác minh dữ liệu phục hồi', 'Thành công', err.message, 'FAIL');
  }

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 6: KIỂM TRA BẢO VỆ TUYỆT ĐỐI MÔI TRƯỜNG PRODUCTION
  // ---------------------------------------------------------------------------
  console.log('\n--- GIAI ĐOẠN 6: KIỂM TRA BẢO VỆ TUYỆT ĐỐI MÔI TRƯỜNG PRODUCTION ---');
  try {
    const healthRes = await fetch(`${API_BASE}/monitoring/health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const healthJson: any = await healthRes.json();
    const healthData = healthJson.data;

    const prodInfra = healthData?.infrastructure;
    const allProdOnline =
      prodInfra?.postgresHN === 'ONLINE' &&
      prodInfra?.postgresDN === 'ONLINE' &&
      prodInfra?.postgresHCM === 'ONLINE' &&
      prodInfra?.postgresCentral === 'ONLINE' &&
      prodInfra?.mongoDb === 'ONLINE';

    record(
      11,
      'PRODUCTION_SAFETY',
      'Toàn bộ 4 PostgreSQL Production + MongoDB Production an toàn tuyệt đối',
      'HN, DN, HCM, Central và MongoDB đều ONLINE, không có bất kỳ gián đoạn nào',
      `HN=${prodInfra?.postgresHN}, DN=${prodInfra?.postgresDN}, HCM=${prodInfra?.postgresHCM}, Central=${prodInfra?.postgresCentral}, Mongo=${prodInfra?.mongoDb}`,
      allProdOnline ? 'PASS' : 'FAIL',
      healthData
    );
  } catch (err: any) {
    record(11, 'PRODUCTION_SAFETY', 'Kiểm tra an toàn Production', 'Tất cả ONLINE', err.message, 'FAIL');
  }

  // ---------------------------------------------------------------------------
  // GIAI ĐOẠN 7: DỌN DẸP TÀI NGUYÊN KIỂM THỬ (CLEANUP)
  // ---------------------------------------------------------------------------
  console.log('\n--- GIAI ĐOẠN 7: DỌN DẸP TÀI NGUYÊN KIỂM THỬ (CLEANUP) ---');
  try {
    await maintenancePool.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = '${TEST_DB_NAME}' AND pid <> pg_backend_pid();
    `);
    await maintenancePool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE);`);
    record(
      12,
      'CLEANUP',
      `Thu hồi và dọn dẹp sạch database kiểm thử '${TEST_DB_NAME}'`,
      'Database kiểm thử được giải phóng hoàn toàn, môi trường sạch sẽ',
      'Đã drop database kiểm thử thành công',
      'PASS'
    );
  } catch (err: any) {
    record(12, 'CLEANUP', 'Dọn dẹp database kiểm thử', 'Đã drop', err.message, 'FAIL');
  } finally {
    await maintenancePool.end();
  }

  // ---------------------------------------------------------------------------
  // TỔNG KẾT KẾT QUẢ KIỂM THỬ
  // ---------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log('📊 TỔNG KẾT KẾT QUẢ TASK 5.8: FAULT / RECOVERY TEST & DEMO');
  console.log('='.repeat(80));
  const passCount = testResults.filter((t) => t.status === 'PASS').length;
  const totalCount = testResults.length;

  testResults.forEach((t) => {
    console.log(`[${t.status}] Bước ${t.stepId} (${t.phase}): ${t.name}`);
  });

  console.log(`\n=> KẾT QUẢ: ${passCount}/${totalCount} BƯỚC ĐẠT (${((passCount / totalCount) * 100).toFixed(1)}%)`);
  if (passCount === totalCount) {
    console.log('🎉 TẤT CẢ CÁC TIÊU CHÍ TASK 5.8 ĐÃ ĐƯỢC NGHIỆM THU HOÀN HẢO!');
  } else {
    console.log('❌ CÓ BƯỚC CHƯA ĐẠT. VUI LÒNG KIỂM TRA LẠI.');
    process.exit(1);
  }
}

runFaultRecoveryDemo().catch((e) => {
  console.error('Fatal in test:', e);
  process.exit(1);
});
