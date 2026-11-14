/**
 * test_mongo_backup_suite.ts
 * Bộ kiểm thử toàn diện MongoDB Backup Service (Task 5.3):
 * 1. MongoDB backup thành công.
 * 2. File archive có dung lượng lớn hơn 0.
 * 3. File backup có thể kiểm tra bằng mongorestore --archive --gzip --verbose (dry-run, trích xuất collections).
 * 4. Backup thất bại thì không giữ file .tmp (kịch bản container không tồn tại).
 * 5. Backup nhiều lần không ghi đè file cũ.
 * 6. Kiểm tra hồi quy: PostgreSQL backup hiện tại vẫn hoạt động bình thường.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import fs from 'fs';
import path from 'path';
import {
  backupService,
  BACKUP_BASE_DIR,
  MONGO_CONTAINER,
  MONGO_DATABASE,
  MongoBackupResult,
  PostgresBackupAllSummary,
} from '../src/services/backupService';

interface TestRecord {
  id: number;
  name: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
  evidence?: any;
}

const testRecords: TestRecord[] = [];

function record(
  id: number,
  name: string,
  expected: string,
  actual: string,
  status: 'PASS' | 'FAIL',
  evidence?: any
) {
  testRecords.push({ id, name, expected, actual, status, evidence });
  const icon = status === 'PASS' ? '✅ PASS' : '❌ FAIL';
  console.log(`[TEST ${id}] ${icon} | ${name}: ${actual}`);
}

// Helper: Tìm các file theo extension
function findFilesByExt(dir: string, ext: string): string[] {
  let matched: string[] = [];
  if (!fs.existsSync(dir)) return matched;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      matched = matched.concat(findFilesByExt(fullPath, ext));
    } else if (item.name.endsWith(ext)) {
      matched.push(fullPath);
    }
  }
  return matched;
}

async function runMongoBackupSuite() {
  console.log('='.repeat(90));
  console.log('🧪 BẮT ĐẦU KIỂM THỬ MONGODB BACKUP SERVICE (TASK 5.3)');
  console.log('='.repeat(90));

  // -------------------------------------------------------------------------
  // BƯỚC 0: KIỂM TRA MÔI TRƯỜNG VÀ CÔNG CỤ
  // -------------------------------------------------------------------------
  console.log('\n--- [BƯỚC 0] KIỂM TRA CÔNG CỤ (DOCKER, MONGODUMP, MONGORESTORE) ---');
  const tools = await backupService.checkMongoToolsExist(MONGO_CONTAINER);
  console.log(`   - Docker: ${tools.docker ? 'Sẵn sàng' : 'Không tìm thấy'}`);
  console.log(`   - Container ${MONGO_CONTAINER}: ${tools.containerRunning ? 'Đang chạy' : 'Dừng'}`);
  console.log(`   - mongodump trong container: ${tools.mongodump ? 'Sẵn sàng (/usr/bin/mongodump)' : 'Không thấy'}`);
  console.log(`   - mongorestore trong container: ${tools.mongorestore ? 'Sẵn sàng (/usr/bin/mongorestore)' : 'Không thấy'}`);

  if (!tools.docker || !tools.containerRunning || !tools.mongodump || !tools.mongorestore) {
    console.error('❌ Môi trường kiểm thử không sẵn sàng:', tools.error);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // TEST 1 & 2: MONGODB BACKUP THÀNH CÔNG VÀ FILE CÓ DUNG LƯỢNG > 0
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 1 & 2] THỰC HIỆN SAO LƯU MONGODB LẦN 1 ---');
  const backup1: MongoBackupResult = await backupService.backupMongo({
    containerName: MONGO_CONTAINER,
    database: MONGO_DATABASE,
    subDir: 'mongodb',
  });

  console.log(`   Kết quả: success=${backup1.success}, duration=${backup1.durationMs}ms`);
  console.log(`   File tạo: ${backup1.filePath}`);
  console.log(`   Dung lượng: ${backup1.fileSizeFormatted} (${backup1.fileSizeBytes} bytes)`);

  const backup1Success = backup1.success && Boolean(backup1.filePath) && fs.existsSync(backup1.filePath!);
  record(
    1,
    'MongoDB backup thành công',
    'success=true, file được tạo tại D:\\backups\\mongodb\\',
    backup1Success ? `Thành công trong ${backup1.durationMs}ms` : `Thất bại: ${backup1.errorMessage}`,
    backup1Success ? 'PASS' : 'FAIL',
    backup1
  );

  const fileSizeValid = Boolean(backup1.fileSizeBytes && backup1.fileSizeBytes > 0);
  record(
    2,
    'File archive có dung lượng lớn hơn 0',
    'Dung lượng > 0 bytes',
    fileSizeValid ? `Dung lượng hợp lệ: ${backup1.fileSizeFormatted} (${backup1.fileSizeBytes} bytes)` : '0-byte hoặc không xác định',
    fileSizeValid ? 'PASS' : 'FAIL',
    { file: backup1.fileName, bytes: backup1.fileSizeBytes }
  );

  // -------------------------------------------------------------------------
  // TEST 3: XÁC THỰC ARCHIVE BẰNG MONGORESTORE --ARCHIVE --GZIP --VERBOSE
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 3] KIỂM TRA TÍNH TOÀN VẸN BẰNG MONGORESTORE --DRYRUN -V ---');
  console.log(`   Trạng thái validate từ backupService: validated=${backup1.validated}`);
  console.log(`   Các collections tìm thấy: ${backup1.collections?.join(', ')}`);

  // Thực hiện thêm một lần gọi trực tiếp validateMongoBackup để kiểm chứng độc lập
  const directValidation = await backupService.validateMongoBackup(backup1.filePath!, MONGO_CONTAINER);
  console.log(`   Xác thực độc lập: valid=${directValidation.valid}, collections count=${directValidation.collections.length}`);

  const validationPass =
    backup1.validated === true &&
    directValidation.valid === true &&
    directValidation.collections.length > 0;

  record(
    3,
    'File backup kiểm tra bằng mongorestore --archive --gzip --verbose (dry-run)',
    'valid=true, trích xuất được danh sách collections mà không khôi phục dữ liệu',
    validationPass ? `Hợp lệ, trích xuất ${directValidation.collections.length} collections: [${directValidation.collections.join(', ')}]` : `Xác thực thất bại: ${directValidation.error}`,
    validationPass ? 'PASS' : 'FAIL',
    { collections: directValidation.collections }
  );

  // -------------------------------------------------------------------------
  // TEST 4: BACKUP THẤT BẠI THÌ KHÔNG GIỮ FILE .TMP (FAULT ISOLATION)
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 4] KIỂM TRA XỬ LÝ LỖI: KHÔNG GIỮ FILE .TMP KHI BACKUP THẤT BẠI ---');
  // Giả lập backup với container không tồn tại
  const failResult = await backupService.backupMongo({
    containerName: 'warehouse_mongodb_non_existent_test_container',
    database: 'warehouse_events',
  });

  console.log(`   Kết quả giả lập lỗi: success=${failResult.success}`);
  console.log(`   Thông báo lỗi đã làm sạch: ${failResult.errorMessage}`);

  // Quét xem có file .tmp nào còn tồn đọng trong D:\backups\mongodb không
  const mongoDir = path.join(BACKUP_BASE_DIR, 'mongodb');
  const tmpFiles = findFilesByExt(mongoDir, '.tmp');
  console.log(`   Số file .tmp tồn đọng trong ${mongoDir}: ${tmpFiles.length}`);

  const faultCleanupPass =
    failResult.success === false &&
    Boolean(failResult.errorMessage) &&
    tmpFiles.length === 0;

  record(
    4,
    'Backup thất bại thì không giữ file .tmp',
    'success=false, xóa sạch file .tmp, không để lại file rác',
    faultCleanupPass ? `Bắt lỗi thành công (${failResult.errorMessage?.substring(0, 50)}...), 0 file .tmp tồn đọng` : `Có lỗi hoặc còn ${tmpFiles.length} file .tmp`,
    faultCleanupPass ? 'PASS' : 'FAIL',
    { errorMessage: failResult.errorMessage, leftoverTmpCount: tmpFiles.length }
  );

  // -------------------------------------------------------------------------
  // TEST 5: BACKUP NHIỀU LẦN KHÔNG GHI ĐÈ FILE CŨ
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 5] BACKUP NHIỀU LẦN KHÔNG GHI ĐÈ FILE CŨ ---');
  const existingFilesBefore = findFilesByExt(mongoDir, '.archive.gz');
  console.log(`   Số file archive trước khi backup lần 2: ${existingFilesBefore.length}`);

  // Chờ 1.5 giây để timestamp chuyển sang giây mới
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const backup2 = await backupService.backupMongo();
  console.log(`   Backup lần 2: success=${backup2.success}, file=${backup2.fileName}`);

  const existingFilesAfter = findFilesByExt(mongoDir, '.archive.gz');
  console.log(`   Số file archive sau khi backup lần 2: ${existingFilesAfter.length}`);

  const noOverwritePass =
    backup2.success === true &&
    existingFilesAfter.length === existingFilesBefore.length + 1 &&
    backup1.filePath !== undefined &&
    existingFilesAfter.includes(backup1.filePath) &&
    backup2.filePath !== undefined &&
    existingFilesAfter.includes(backup2.filePath) &&
    backup1.fileName !== backup2.fileName;

  record(
    5,
    'Backup nhiều lần không ghi đè file cũ',
    'Mỗi lần tạo file mới với timestamp riêng, bảo toàn 100% file trước đó',
    noOverwritePass ? `Trước: ${existingFilesBefore.length} file -> Sau: ${existingFilesAfter.length} file (Bảo toàn file cũ, file mới: ${backup2.fileName})` : 'Có hiện tượng ghi đè hoặc không tăng số lượng file',
    noOverwritePass ? 'PASS' : 'FAIL',
    {
      file1: backup1.fileName,
      file2: backup2.fileName,
      totalArchives: existingFilesAfter.length,
    }
  );

  // -------------------------------------------------------------------------
  // TEST 6: POSTGRESQL BACKUP HIỆN TẠI VẪN HOẠT ĐỘNG BÌNH THƯỜNG (REGRESSION TEST)
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 6] KIỂM TRA HỒI QUY: POSTGRESQL BACKUP VẪN HOẠT ĐỘNG BÌNH THƯỜNG ---');
  const pgSummary: PostgresBackupAllSummary = await backupService.backupAllPostgres();
  console.log(`   Trạng thái phiên PostgreSQL Backup: ${pgSummary.status}`);
  console.log(`   Thành công: ${pgSummary.successCount}/${pgSummary.total} trong ${pgSummary.durationMs}ms`);

  for (const r of pgSummary.results) {
    console.log(`     - Node ${r.nodeId} (${r.database}): success=${r.success}, size=${r.fileSizeFormatted}, TOC=${r.tocEntryCount}`);
  }

  const pgRegressionPass =
    pgSummary.total === 4 &&
    pgSummary.successCount === 4 &&
    pgSummary.failedCount === 0 &&
    pgSummary.status === 'ALL_SUCCESS' &&
    pgSummary.results.every((r) => r.validated === true && (r.tocEntryCount || 0) > 100);

  record(
    6,
    'PostgreSQL backup hiện tại vẫn hoạt động bình thường',
    'status=ALL_SUCCESS (4/4 node), TOC validation hợp lệ trên cả 4 database',
    pgRegressionPass ? `Cả 4 database PostgreSQL hoàn thành bình thường (${pgSummary.durationMs}ms), không bị ảnh hưởng` : `PostgreSQL bị ảnh hưởng: ${pgSummary.status} (${pgSummary.successCount}/${pgSummary.total})`,
    pgRegressionPass ? 'PASS' : 'FAIL',
    { status: pgSummary.status, successCount: pgSummary.successCount, durationMs: pgSummary.durationMs }
  );

  // -------------------------------------------------------------------------
  // TỔNG KẾT BẢNG KẾT QUẢ KIỂM THỬ TASK 5.3
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(90));
  console.log('📊 BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ TASK 5.3 – MONGODB BACKUP');
  console.log('='.repeat(90));
  console.table(
    testRecords.map((t) => ({
      Test_ID: t.id,
      Tên_kiểm_thử: t.name,
      Kết_quả_thực_tế: t.actual,
      Đánh_giá: t.status === 'PASS' ? '✅ PASS' : '❌ FAIL',
    }))
  );

  const allPassed = testRecords.every((t) => t.status === 'PASS');
  console.log(`\n=> KẾT LUẬN KIỂM THỬ TASK 5.3: ${allPassed ? 'TẤT CẢ 6/6 MỤC ĐỀU PASS' : 'CÓ MỤC THẤT BẠI'}`);
  process.exit(allPassed ? 0 : 1);
}

runMongoBackupSuite().catch((err) => {
  console.error('Ngoại lệ khi thực thi test suite MongoDB:', err);
  process.exit(1);
});
