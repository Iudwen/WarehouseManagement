/**
 * test_backup_scheduler_suite.ts
 * Bộ kiểm thử toàn diện Backup Scheduler (Task 5.4):
 * 1. Scheduler khởi tạo thành công (start / stop / getStatus).
 * 2. Cấu hình giờ chạy được đọc chính xác (02:00, Asia/Ho_Chi_Minh).
 * 3. Kích hoạt backup thủ công thành công (triggerManualBackup).
 * 4. Backup PostgreSQL và MongoDB trong cùng một phiên (Unified Full Backup Session).
 * 5. Một database lỗi không làm mất kết quả các database còn lại (Fault Isolation).
 * 6. Không cho phép hai phiên backup đồng thời trong cùng process / file lock.
 * 7. Một phiên thất bại không làm Scheduler ngừng hoạt động (Scheduler Resiliency).
 * 8. PostgreSQL và MongoDB backup độc lập vẫn hoạt động bình thường (Regression check).
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import fs from 'fs';
import path from 'path';
import {
  backupService,
  BACKUP_BASE_DIR,
  BACKUP_LOCK_FILE,
  FullBackupSessionResult,
} from '../src/services/backupService';
import { backupScheduler } from '../src/services/backupScheduler';

interface TestItem {
  id: number;
  title: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  details?: any;
}

const testResults: TestItem[] = [];

function recordTest(
  id: number,
  title: string,
  expected: string,
  actual: string,
  status: 'PASS' | 'FAIL',
  details?: any
) {
  testResults.push({ id, title, expected, actual, status, details });
  const icon = status === 'PASS' ? '✅ PASS' : '❌ FAIL';
  console.log(`[TEST ${id}] ${icon} | ${title}: ${actual}`);
}

async function runSchedulerTestSuite() {
  console.log('='.repeat(90));
  console.log('🧪 KIỂM THỬ TOÀN DIỆN BACKUP SCHEDULER & FULL BACKUP SERVICE (TASK 5.4)');
  console.log('='.repeat(90));

  // -------------------------------------------------------------------------
  // TEST 1: SCHEDULER KHỞI TẠO THÀNH CÔNG (START / STOP)
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 1] KHỞI TẠO SCHEDULER (START / STOP) ---');
  backupScheduler.start();
  const statusAfterStart = backupScheduler.getStatus();
  console.log(`   Trạng thái sau khi start(): isScheduled=${statusAfterStart.isScheduled}`);

  backupScheduler.stop();
  const statusAfterStop = backupScheduler.getStatus();
  console.log(`   Trạng thái sau khi stop(): isScheduled=${statusAfterStop.isScheduled}`);

  const initPass = statusAfterStart.isScheduled === true && statusAfterStop.isScheduled === false;
  recordTest(
    1,
    'Scheduler khởi tạo thành công',
    'start() đặt isScheduled=true, stop() đặt isScheduled=false',
    initPass ? 'start() và stop() hoạt động chuẩn xác' : 'Khởi tạo scheduler thất bại',
    initPass ? 'PASS' : 'FAIL',
    { statusAfterStart, statusAfterStop }
  );

  // -------------------------------------------------------------------------
  // TEST 2: CẤU HÌNH GIỜ CHẠY VÀ MÚI GIỜ ĐƯỢC ĐỌC CHÍNH XÁC
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 2] CẤU HÌNH GIỜ CHẠY VÀ MÚI GIỜ ---');
  const cfg = backupScheduler.getConfig();
  const timeInfo = backupScheduler.getCurrentTimeInTimezone();
  const nextTime = backupScheduler.calculateNextScheduledTime();

  console.log(`   - Giờ chạy cấu hình: ${cfg.scheduleTime} (Mặc định 02:00)`);
  console.log(`   - Múi giờ: ${cfg.timezone} (Mặc định Asia/Ho_Chi_Minh)`);
  console.log(`   - Thời gian hiện tại theo múi giờ: ${timeInfo.timeString} ngày ${timeInfo.dateString}`);
  console.log(`   - Thời điểm chạy tiếp theo dự kiến: ${nextTime}`);

  const configPass =
    cfg.scheduleTime === '02:00' &&
    cfg.timezone === 'Asia/Ho_Chi_Minh' &&
    cfg.enabled === true &&
    Boolean(nextTime);

  recordTest(
    2,
    'Cấu hình giờ chạy được đọc chính xác',
    'scheduleTime="02:00", timezone="Asia/Ho_Chi_Minh", enabled=true',
    configPass ? `Khớp cấu hình: ${cfg.scheduleTime} (${cfg.timezone}), Lần chạy tiếp theo: ${nextTime}` : 'Sai cấu hình',
    configPass ? 'PASS' : 'FAIL',
    { config: cfg, timeInfo, nextTime }
  );

  // -------------------------------------------------------------------------
  // TEST 3: KÍCH HOẠT BACKUP THỦ CÔNG THÀNH CÔNG (MANUAL TRIGGER)
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 3] KÍCH HOẠT SAO LƯU THỦ CÔNG (triggerManualBackup) ---');
  const manualResult = await backupScheduler.triggerManualBackup();

  console.log(`   Kết quả: status=${manualResult.status}, triggerType=${manualResult.triggerType}, duration=${manualResult.durationMs}ms`);
  const manualPass =
    manualResult.triggerType === 'MANUAL' &&
    manualResult.status === 'ALL_SUCCESS' &&
    manualResult.postgresSummary?.successCount === 4 &&
    manualResult.mongoResult?.success === true;

  recordTest(
    3,
    'Kích hoạt backup thủ công thành công',
    'triggerType=MANUAL, status=ALL_SUCCESS (4 Postgres + 1 Mongo)',
    manualPass ? `Hoàn tất phiên ${manualResult.sessionId} trong ${manualResult.durationMs}ms (${manualResult.status})` : `Thất bại: ${manualResult.status}`,
    manualPass ? 'PASS' : 'FAIL',
    manualResult
  );

  // -------------------------------------------------------------------------
  // TEST 4: BACKUP POSTGRESQL VÀ MONGODB TRONG CÙNG MỘT PHIÊN
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 4] BACKUP POSTGRESQL VÀ MONGODB TRONG CÙNG MỘT PHIÊN ---');
  const scheduledResult = await backupScheduler.triggerScheduledNowForTest();

  console.log(`   Kết quả phiên SCHEDULED: status=${scheduledResult.status}, triggerType=${scheduledResult.triggerType}`);
  console.log(`   + PostgreSQL: ${scheduledResult.postgresSummary?.successCount}/4 database thành công`);
  console.log(`   + MongoDB: ${scheduledResult.mongoResult?.database} (${scheduledResult.mongoResult?.fileSizeFormatted})`);

  const sameSessionPass =
    scheduledResult.triggerType === 'SCHEDULED' &&
    scheduledResult.status === 'ALL_SUCCESS' &&
    scheduledResult.postgresSummary?.total === 4 &&
    scheduledResult.postgresSummary?.successCount === 4 &&
    scheduledResult.mongoResult?.success === true &&
    scheduledResult.mongoResult?.validated === true;

  recordTest(
    4,
    'Backup PostgreSQL và MongoDB trong cùng một phiên',
    'Bao gồm đủ 4 database PostgreSQL và 1 database MongoDB trong cùng session result',
    sameSessionPass
      ? `Thành công toàn diện 5/5 database: 4 Postgres (${scheduledResult.postgresSummary?.durationMs}ms) + 1 Mongo (${scheduledResult.mongoResult?.durationMs}ms)`
      : 'Không đủ các database trong phiên',
    sameSessionPass ? 'PASS' : 'FAIL',
    { scheduledResult }
  );

  // -------------------------------------------------------------------------
  // TEST 5: MỘT DATABASE LỖI KHÔNG LÀM MẤT KẾT QUẢ CÁC DATABASE CÒN LẠI
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 5] KIỂM TRA FAULT ISOLATION: 1 DATABASE LỖI KHÔNG GIÁN ĐOẠN CÁC DATABASE KHÁC ---');
  // Giả lập bằng cách gọi backupService với container mongo không tồn tại
  const faultSessionResult = await backupService.runFullBackup('MANUAL', {
    mongoTarget: { containerName: 'warehouse_mongodb_non_existent_fault_test' },
  });

  console.log(`   Phiên có lỗi giả lập: status=${faultSessionResult.status}`);
  console.log(`   Postgres: ${faultSessionResult.postgresSummary?.successCount}/4 database thành công`);
  console.log(`   Mongo: success=${faultSessionResult.mongoResult?.success}, lỗi=${faultSessionResult.mongoResult?.errorMessage?.substring(0, 60)}...`);

  const faultIsolationPass =
    faultSessionResult.status === 'PARTIAL_SUCCESS' &&
    faultSessionResult.postgresSummary?.successCount === 4 &&
    faultSessionResult.mongoResult?.success === false;

  recordTest(
    5,
    'Một database lỗi không làm mất kết quả các database còn lại',
    'status=PARTIAL_SUCCESS, 4 PostgreSQL vẫn thành công dù MongoDB lỗi',
    faultIsolationPass
      ? `Đúng thiết kế: status=PARTIAL_SUCCESS, 4/4 Postgres thành công độc lập, MongoDB báo lỗi an toàn`
      : `Không đảm bảo cách ly lỗi: status=${faultSessionResult.status}`,
    faultIsolationPass ? 'PASS' : 'FAIL',
    { faultSessionResult }
  );

  // -------------------------------------------------------------------------
  // TEST 6: CHỐNG CHẠY TRÙNG LẶP (IN-PROCESS VÀ CROSS-INSTANCE LOCK)
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 6] KIỂM TRA CHỐNG CHẠY ĐỒNG THỜI (LOCKING MECHANISM) ---');
  // 6a. Thử nghiệm 2 phiên chạy đồng thời trong cùng tiến trình
  console.log('   6a. Thử nghiệm chạy 2 phiên đồng thời...');
  const [sessionA, sessionB] = await Promise.all([
    backupService.runFullBackup('MANUAL'),
    backupService.runFullBackup('MANUAL'),
  ]);

  console.log(`   Session A: status=${sessionA.status}`);
  console.log(`   Session B: status=${sessionB.status}`);

  const oneSucceeded = sessionA.status === 'ALL_SUCCESS' || sessionB.status === 'ALL_SUCCESS';
  const oneSkipped = sessionA.status === 'SKIPPED_ALREADY_RUNNING' || sessionB.status === 'SKIPPED_ALREADY_RUNNING';

  // 6b. Thử nghiệm file lock mô phỏng tiến trình ngoài / instance khác đang chiếm lock
  console.log('   6b. Thử nghiệm File Lock (.backup.lock)...');
  const dummyLockData = JSON.stringify({
    lockId: 'lock_external_active_instance',
    pid: process.pid, // Sử dụng PID đang hoạt động để mô phỏng instance active
    triggerType: 'SCHEDULED',
    startedAt: new Date().toISOString(),
  });
  fs.writeFileSync(BACKUP_LOCK_FILE, dummyLockData);

  const blockedSession = await backupService.runFullBackup('MANUAL');
  console.log(`   Kết quả khi có file lock bên ngoài: status=${blockedSession.status}, message=${blockedSession.message}`);

  // Dọn dẹp file lock giả lập
  if (fs.existsSync(BACKUP_LOCK_FILE)) {
    fs.unlinkSync(BACKUP_LOCK_FILE);
  }

  const lockPass =
    oneSucceeded &&
    oneSkipped &&
    blockedSession.status === 'SKIPPED_ALREADY_RUNNING' &&
    Boolean(blockedSession.message?.includes('vẫn đang hoạt động') || blockedSession.message?.includes('File lock'));

  recordTest(
    6,
    'Không cho phép hai phiên backup đồng thời trong cùng process / multi-instance',
    'Một phiên chạy thành công, phiên còn lại bị chặn an toàn với status SKIPPED_ALREADY_RUNNING',
    lockPass
      ? 'Chống chạy trùng hoàn hảo: 1 phiên ALL_SUCCESS + 1 phiên SKIPPED_ALREADY_RUNNING; File lock hoạt động chuẩn'
      : 'Lock không chặn được chạy đồng thời',
    lockPass ? 'PASS' : 'FAIL',
    { sessionA: sessionA.status, sessionB: sessionB.status, blockedSession: blockedSession.status }
  );

  // -------------------------------------------------------------------------
  // TEST 7: KHẢ NĂNG PHỤC HỒI KHI SCHEDULER GẶP LỖI
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 7] KIỂM TRA PHỤC HỒI KHI SCHEDULER GẶP LỖI (RESILIENCY) ---');
  backupScheduler.start();
  // Giả lập gọi checkAndTrigger khi có exception bên trong
  const statusBefore = backupScheduler.getStatus().isScheduled;

  // Gọi thử với cấu hình sai tạm thời
  backupScheduler.setConfig({ scheduleTime: 'INVALID_TIME' });
  await backupScheduler.checkAndTrigger().catch(() => {});

  // Khôi phục cấu hình
  backupScheduler.setConfig({ scheduleTime: '02:00' });
  const statusAfter = backupScheduler.getStatus().isScheduled;
  backupScheduler.stop();

  const resiliencyPass = statusBefore === true && statusAfter === true;
  recordTest(
    7,
    'Một phiên thất bại không làm Scheduler ngừng hoạt động',
    'Scheduler duy trì trạng thái isScheduled=true, không bị crash hay hủy timer',
    resiliencyPass ? 'Scheduler duy trì hoạt động bền bỉ, không bị tắt khi gặp lỗi' : 'Scheduler bị tắt sau lỗi',
    resiliencyPass ? 'PASS' : 'FAIL',
    { statusBefore, statusAfter }
  );

  // -------------------------------------------------------------------------
  // TEST 8: POSTGRESQL VÀ MONGODB BACKUP HIỆN TẠI VẪN HOẠT ĐỘNG
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 8] KIỂM TRA HỒI QUY: POSTGRESQL & MONGODB BACKUP ĐỘC LẬP ---');
  const pgDirect = await backupService.backupAllPostgres();
  const mongoDirect = await backupService.backupMongo();

  console.log(`   + PostgreSQL trực tiếp: status=${pgDirect.status} (${pgDirect.successCount}/${pgDirect.total})`);
  console.log(`   + MongoDB trực tiếp: success=${mongoDirect.success} (${mongoDirect.fileName})`);

  const regressionPass =
    pgDirect.status === 'ALL_SUCCESS' &&
    pgDirect.successCount === 4 &&
    mongoDirect.success === true &&
    mongoDirect.validated === true;

  recordTest(
    8,
    'PostgreSQL và MongoDB backup hiện tại vẫn hoạt động bình thường',
    'Cả hai dịch vụ sao lưu độc lập hoàn tất 100% không bị ảnh hưởng',
    regressionPass ? 'Cả hai dịch vụ độc lập đều đạt PASS 100%' : 'Có dịch vụ bị ảnh hưởng',
    regressionPass ? 'PASS' : 'FAIL',
    { pgDirect: pgDirect.status, mongoDirect: mongoDirect.success }
  );

  // -------------------------------------------------------------------------
  // BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ TASK 5.4
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('📊 BẢNG TỔNG HỢP ĐÁNH GIÁ 8 HẠNG MỤC KIỂM THỬ TASK 5.4');
  console.log('='.repeat(90));
  console.table(
    testResults.map((r) => ({
      ID: r.id,
      Tiêu_chí: r.title,
      Kết_quả_thực_tế: r.actual,
      Đánh_giá: r.status === 'PASS' ? '✅ PASS' : '❌ FAIL',
    }))
  );

  const allPassed = testResults.every((r) => r.status === 'PASS');
  console.log(`\n=> KẾT LUẬN TASK 5.4: ${allPassed ? 'TẤT CẢ 8/8 TIÊU CHÍ ĐỀU PASS' : 'CÓ TIÊU CHÍ CHƯA ĐẠT'}`);
  process.exit(allPassed ? 0 : 1);
}

runSchedulerTestSuite().catch((err) => {
  console.error('Ngoại lệ khi thực thi test suite Scheduler:', err);
  process.exit(1);
});
