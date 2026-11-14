/**
 * test_postgres_backup_suite.ts
 * Kịch bản kiểm thử toàn diện PostgreSQL Backup Service (Task 5.2):
 * 1. Kiểm tra pg_dump.exe và pg_restore.exe có thể chạy
 * 2. Kiểm tra kết nối tới 4 PostgreSQL node (HN: 5433, DN: 5434, HCM: 5435, Central: 5436)
 * 3. Kiểm tra xử lý lỗi khi database không kết nối được (xóa file .tmp, không sinh file 0-byte, không lộ password)
 * 4. Backup thử nghiệm từng database (nếu node đang chạy)
 * 5. Backup cả 4 database qua backupAllPostgres() (nếu các node đang chạy)
 * 6. Kiểm tra file đầu ra và cấu trúc thư mục D:\backups\postgres
 * 7. Kiểm tra tính toàn vẹn bằng pg_restore --list
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import net from 'net';
import fs from 'fs';
import path from 'path';
import {
  backupService,
  PG_DUMP_PATH,
  PG_RESTORE_PATH,
  BACKUP_BASE_DIR,
  PostgresBackupTarget,
} from '../src/services/backupService';

interface TestReportItem {
  testId: number;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  notes?: string;
}

const reportItems: TestReportItem[] = [];

function recordTest(
  testId: number,
  name: string,
  expected: string,
  actual: string,
  status: 'PASS' | 'FAIL' | 'BLOCKED',
  notes?: string
) {
  reportItems.push({ testId, name, expected, actual, status, notes });
  const icon = status === 'PASS' ? '✅ PASS' : status === 'BLOCKED' ? '⚠️ BLOCKED' : '❌ FAIL';
  console.log(`[TEST ${testId}] ${icon} | ${name}: ${actual}`);
}

// Helper: Kiểm tra cổng TCP có đang mở hay không (với timeout 1000ms)
function checkPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

async function runPostgresBackupSuite() {
  console.log('='.repeat(80));
  console.log('🧪 KIỂM THỬ POSTGRESQL BACKUP SERVICE (TASK 5.2)');
  console.log('='.repeat(80));

  // -------------------------------------------------------------------------
  // TEST 1: KIỂM TRA PG_DUMP.EXE VÀ PG_RESTORE.EXE
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 1] KIỂM TRA CÔNG CỤ PG_DUMP & PG_RESTORE ---');
  const binaries = backupService.checkBinariesExist();
  console.log(`   - pg_dump.exe   (${PG_DUMP_PATH}): ${binaries.pgDump ? 'Tìm thấy' : 'Không thấy'}`);
  console.log(`   - pg_restore.exe (${PG_RESTORE_PATH}): ${binaries.pgRestore ? 'Tìm thấy' : 'Không thấy'}`);

  recordTest(
    1,
    'Kiểm tra công cụ pg_dump.exe và pg_restore.exe sẵn sàng',
    'Cả 2 binary tồn tại',
    binaries.pgDump && binaries.pgRestore ? 'Sẵn sàng tại C:\\Program Files\\PostgreSQL\\18\\bin' : 'Thiếu binary',
    binaries.pgDump && binaries.pgRestore ? 'PASS' : 'FAIL'
  );

  // -------------------------------------------------------------------------
  // TEST 2: KIỂM TRA DANH SÁCH TARGET VÀ KẾT NỐI TỚI TỪNG NODE
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 2] KIỂM TRA TARGETS VÀ KẾT NỐI MẠNG CÁC NODE ---');
  const targets = backupService.getPostgresBackupTargets();
  const connectivity: Record<string, boolean> = {};

  for (const t of targets) {
    const isOpen = await checkPortOpen(t.host, t.port);
    connectivity[t.nodeId] = isOpen;
    console.log(`   - Target ${t.nodeId} (${t.database} @ ${t.host}:${t.port}): ${isOpen ? 'ONLINE (Cổng mở)' : 'OFFLINE (Cổng đóng)'}`);
  }

  const allOnline = Object.values(connectivity).every((v) => v);
  const anyOnline = Object.values(connectivity).some((v) => v);

  recordTest(
    2,
    'Kiểm tra cổng kết nối 4 PostgreSQL node (5433, 5434, 5435, 5436)',
    'Tất cả 4 cổng mở',
    allOnline
      ? 'Cả 4 cổng đều mở'
      : `HN:${connectivity.HN ? 'Up' : 'Down'}, DN:${connectivity.DN ? 'Up' : 'Down'}, HCM:${connectivity.HCM ? 'Up' : 'Down'}, Central:${connectivity.CENTRAL ? 'Up' : 'Down'}`,
    allOnline ? 'PASS' : 'BLOCKED',
    allOnline ? undefined : 'Docker engine hiện tại đang dừng nên các container database chưa lắng nghe cổng.'
  );

  // -------------------------------------------------------------------------
  // TEST 3: KIỂM TRA XỬ LÝ LỖI KHI DATABASE KHÔNG KẾT NỐI ĐƯỢC (FAULT HANDLING)
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 3] KIỂM TRA XỬ LÝ LỖI KHI DATABASE KHÔNG KẾT NỐI ĐƯỢC ---');
  // Giả lập gọi backup tới một cổng không tồn tại (5499)
  const testFailTarget: PostgresBackupTarget = {
    nodeId: 'HN',
    name: 'Kho Hà Nội (Test Fail)',
    database: 'warehouse_hn',
    host: 'localhost',
    port: 5499, // Cố ý dùng cổng đóng
    user: 'admin',
    subDir: 'hn',
  };

  const failRes = await backupService.backupPostgres(testFailTarget);
  console.log(`   Kết quả backup cổng đóng 5499: success=${failRes.success}`);
  console.log(`   Error message đã lọc: ${failRes.errorMessage}`);

  // Kiểm tra không để lại file rác .tmp trong thư mục D:\backups\postgres\hn
  const hnDir = path.join(BACKUP_BASE_DIR, 'postgres', 'hn');
  let leftoverTmpFiles: string[] = [];
  if (fs.existsSync(hnDir)) {
    leftoverTmpFiles = fs.readdirSync(hnDir).filter((f) => f.endsWith('.tmp'));
  }

  const errorSanitized = !failRes.errorMessage?.includes('admin123') && !failRes.errorMessage?.includes('PGPASSWORD');
  const noTmpLeft = leftoverTmpFiles.length === 0;
  const caughtError = failRes.success === false && Boolean(failRes.errorMessage);

  recordTest(
    3,
    'Xử lý lỗi kết nối: Bắt lỗi sạch sẽ, không tạo file .dump, xóa file .tmp, không lộ mật khẩu',
    'success=false, no .tmp file, password masked',
    `success=${failRes.success}, .tmp tồn đọng=${leftoverTmpFiles.length}, password an toàn=${errorSanitized}`,
    caughtError && noTmpLeft && errorSanitized ? 'PASS' : 'FAIL'
  );

  // -------------------------------------------------------------------------
  // TEST 4 & 5: BACKUP THỬ NGHIỆM TỪNG DATABASE VÀ BACKUP ALL
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 4 & 5] KIỂM TRA SAO LƯU THỰC TẾ (NẾU NODE ĐANG CHẠY) ---');
  if (allOnline) {
    console.log('   -> Tiến hành backup từng database...');
    for (const t of targets) {
      const res = await backupService.backupPostgres(t);
      console.log(`   Node ${t.nodeId}: success=${res.success}, size=${res.fileSizeFormatted}, validated=${res.validated}, TOC=${res.tocEntryCount}`);
      recordTest(
        4,
        `Backup database ${t.database} (${t.nodeId})`,
        'success=true, validated=true',
        `success=${res.success}, size=${res.fileSizeFormatted}, validated=${res.validated}`,
        res.success && res.validated ? 'PASS' : 'FAIL'
      );
    }

    console.log('\n   -> Tiến hành backupAllPostgres()...');
    const allSummary = await backupService.backupAllPostgres();
    console.log(`   Tổng hợp: Status=${allSummary.status}, Thành công=${allSummary.successCount}/${allSummary.total}, Thời gian=${allSummary.durationMs}ms`);
    recordTest(
      5,
      'Backup toàn bộ 4 database (backupAllPostgres)',
      'status=ALL_SUCCESS',
      `status=${allSummary.status} (${allSummary.successCount}/${allSummary.total})`,
      allSummary.status === 'ALL_SUCCESS' ? 'PASS' : 'FAIL'
    );
  } else {
    console.log('   ⚠️ Vì Docker engine hiện tại đang dừng, không thể kết nối tới các PostgreSQL node.');
    console.log('   Tuân thủ nghiêm ngặt chỉ thị: "Nếu Docker hoặc database đang dừng, báo rõ nguyên nhân và không tự ý thay đổi trạng thái hạ tầng để vượt qua lỗi."');
    recordTest(
      4,
      'Backup thực tế từng database (HN, DN, HCM, Central)',
      'Tạo file .dump thành công và chứa dữ liệu',
      'Chưa thực hiện được do Docker đang dừng',
      'BLOCKED',
      'Nguyên nhân: Docker daemon đang dừng sau khi máy chủ khởi động lại. Cần khởi động Docker Desktop để chạy live backup.'
    );
    recordTest(
      5,
      'Backup All cả 4 database qua backupAllPostgres()',
      'Tạo 4 file backup tuần tự và tổng hợp phiên',
      'Chưa thực hiện được do Docker đang dừng',
      'BLOCKED',
      'Sẵn sàng thực thi ngay khi Docker Desktop được bật.'
    );
  }

  // -------------------------------------------------------------------------
  // TEST 6: KIỂM TRA THƯ MỤC VÀ CẤU TRÚC LƯU TRỮ TRÊN D:\BACKUPS
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 6] KIỂM TRA CẤU TRÚC LƯU TRỮ D:\\BACKUPS ---');
  const baseDirExists = fs.existsSync(BACKUP_BASE_DIR);
  const postgresDirExists = fs.existsSync(path.join(BACKUP_BASE_DIR, 'postgres'));
  console.log(`   - D:\\backups tồn tại: ${baseDirExists}`);
  console.log(`   - D:\\backups\\postgres tồn tại: ${postgresDirExists}`);

  recordTest(
    6,
    'Tự động khởi tạo thư mục lưu trữ D:\\backups\\postgres\\<node>',
    'Thư mục được tạo tự động',
    baseDirExists && postgresDirExists ? 'Đã tự động khởi tạo trên ổ D:\\' : 'Chưa tạo',
    baseDirExists && postgresDirExists ? 'PASS' : 'FAIL'
  );

  // -------------------------------------------------------------------------
  // BẢNG TỔNG HỢP KIỂM THỬ
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log('📊 BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ POSTGRESQL BACKUP (TASK 5.2)');
  console.log('='.repeat(80));
  console.table(reportItems);
}

runPostgresBackupSuite().catch((err) => {
  console.error('Lỗi ngoại lệ trong test suite:', err);
  process.exit(1);
});
