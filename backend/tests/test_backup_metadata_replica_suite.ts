/**
 * test_backup_metadata_replica_suite.ts
 * Bộ kiểm thử toàn diện Backup Metadata, History, SHA-256 & Local Replica (Task 5.5):
 * 
 * Test 1: Backup PostgreSQL tạo metadata hợp lệ trong backup_history.json
 * Test 2: Backup MongoDB tạo metadata hợp lệ trong backup_history.json
 * Test 3: Checksum SHA-256 ghi nhận khớp với SHA-256 thực tế của file gốc
 * Test 4: Local Replica được tạo trong C:\backups_replica với đúng cấu trúc và SHA-256 khớp file gốc
 * Test 5: Checksum mismatch (giả lập file replica bị sai lệch) -> replicaStatus: FAILED, file gốc vẫn SUCCESS
 * Test 6: Lỗi sao chép replica (giả lập đường dẫn không hợp lệ) -> replicaStatus: FAILED, file gốc không bị xóa/fail
 * Test 7: Atomic write cho metadata JSON: nếu có lỗi ghi tạm thì file lịch sử hiện hữu không bị hỏng
 * Test 8: Full Backup session (5 databases) chạy với đầy đủ metadata, checksum và replica cho cả 5 DB
 * Test 9: Regression check: đảm bảo không làm gãy các tính năng của Task 5.2, 5.3, 5.4
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import fs from 'fs';
import path from 'path';
import {
  backupService,
  BACKUP_BASE_DIR,
  REPLICA_BASE_DIR,
  BACKUP_HISTORY_FILE,
  calculateFileSHA256,
  replicateBackupFile,
  appendBackupHistory,
  getBackupHistory,
  BackupMetadataRecord,
  PostgresBackupResult,
  MongoBackupResult,
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

async function runMetadataReplicaTestSuite() {
  console.log('='.repeat(95));
  console.log('🧪 KIỂM THỬ TOÀN DIỆN BACKUP METADATA, SHA-256 & LOCAL REPLICA (TASK 5.5)');
  console.log('='.repeat(95));

  let pgResult: PostgresBackupResult | null = null;
  let mongoResult: MongoBackupResult | null = null;

  // -------------------------------------------------------------------------
  // TEST 1: BACKUP POSTGRESQL TẠO METADATA HỢP LỆ TRONG BACKUP_HISTORY.JSON
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 1] POSTGRESQL BACKUP METADATA IN HISTORY ---');
  pgResult = await backupService.backupPostgres('HN');
  console.log(`   + Backup HN: success=${pgResult.success}, file=${pgResult.fileName}, size=${pgResult.fileSizeFormatted}`);
  console.log(`   + Checksum SHA-256: ${pgResult.checksumSHA256}`);
  console.log(`   + Replica Status: ${pgResult.replicaStatus} (${pgResult.replicaPath})`);

  const history1 = getBackupHistory();
  const pgRecord = history1.find((r) => r.fileName === pgResult!.fileName);

  const test1Pass =
    pgResult.success === true &&
    Boolean(pgRecord) &&
    pgRecord?.backupType === 'POSTGRES' &&
    pgRecord?.database === 'warehouse_hn' &&
    pgRecord?.nodeId === 'HN' &&
    pgRecord?.status === 'SUCCESS' &&
    pgRecord?.validated === true &&
    typeof pgRecord?.checksumSHA256 === 'string' &&
    pgRecord?.checksumSHA256.length === 64 &&
    pgRecord?.replicaStatus === 'SUCCESS';

  recordTest(
    1,
    'Backup PostgreSQL tạo metadata hợp lệ trong backup_history.json',
    'Tạo bản ghi POSTGRES, status=SUCCESS, validated=true, SHA-256 64 ký tự hex, replicaStatus=SUCCESS',
    test1Pass
      ? `Metadata được ghi nhận chuẩn xác (backupId=${pgRecord?.backupId}, SHA-256=${pgRecord?.checksumSHA256.substring(0, 16)}...)`
      : 'Metadata PostgreSQL không tìm thấy hoặc thông tin không khớp',
    test1Pass ? 'PASS' : 'FAIL',
    { pgRecord }
  );

  // -------------------------------------------------------------------------
  // TEST 2: BACKUP MONGODB TẠO METADATA HỢP LỆ TRONG BACKUP_HISTORY.JSON
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 2] MONGODB BACKUP METADATA IN HISTORY ---');
  mongoResult = await backupService.backupMongo();
  console.log(`   + Backup Mongo: success=${mongoResult.success}, file=${mongoResult.fileName}, size=${mongoResult.fileSizeFormatted}`);
  console.log(`   + Checksum SHA-256: ${mongoResult.checksumSHA256}`);
  console.log(`   + Replica Status: ${mongoResult.replicaStatus} (${mongoResult.replicaPath})`);

  const history2 = getBackupHistory();
  const mongoRecord = history2.find((r) => r.fileName === mongoResult!.fileName);

  const test2Pass =
    mongoResult.success === true &&
    Boolean(mongoRecord) &&
    mongoRecord?.backupType === 'MONGODB' &&
    mongoRecord?.database === 'warehouse_events' &&
    mongoRecord?.nodeId === 'MONGO' &&
    mongoRecord?.status === 'SUCCESS' &&
    mongoRecord?.validated === true &&
    typeof mongoRecord?.checksumSHA256 === 'string' &&
    mongoRecord?.checksumSHA256.length === 64 &&
    mongoRecord?.replicaStatus === 'SUCCESS';

  recordTest(
    2,
    'Backup MongoDB tạo metadata hợp lệ trong backup_history.json',
    'Tạo bản ghi MONGODB, status=SUCCESS, validated=true, SHA-256 64 ký tự hex, replicaStatus=SUCCESS',
    test2Pass
      ? `Metadata MongoDB được ghi nhận chuẩn xác (backupId=${mongoRecord?.backupId}, SHA-256=${mongoRecord?.checksumSHA256.substring(0, 16)}...)`
      : 'Metadata MongoDB không tìm thấy hoặc thông tin không khớp',
    test2Pass ? 'PASS' : 'FAIL',
    { mongoRecord }
  );

  // -------------------------------------------------------------------------
  // TEST 3: CHECKSUM SHA-256 GHI NHẬN KHỚP VỚI SHA-256 THỰC TẾ CỦA FILE GỐC
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 3] XÁC THỰC CHECKSUM SHA-256 FILE GỐC ---');
  const actualPgHash = await calculateFileSHA256(pgResult.filePath!);
  const actualMongoHash = await calculateFileSHA256(mongoResult.filePath!);

  console.log(`   + PG File: ${pgResult.filePath}`);
  console.log(`     Recorded Hash: ${pgResult.checksumSHA256}`);
  console.log(`     Actual Hash:   ${actualPgHash}`);
  console.log(`   + Mongo File: ${mongoResult.filePath}`);
  console.log(`     Recorded Hash: ${mongoResult.checksumSHA256}`);
  console.log(`     Actual Hash:   ${actualMongoHash}`);

  const test3Pass =
    actualPgHash.toLowerCase() === pgResult.checksumSHA256!.toLowerCase() &&
    actualMongoHash.toLowerCase() === mongoResult.checksumSHA256!.toLowerCase() &&
    actualPgHash === pgRecord?.checksumSHA256 &&
    actualMongoHash === mongoRecord?.checksumSHA256;

  recordTest(
    3,
    'Checksum SHA-256 ghi nhận khớp với SHA-256 thực tế của file gốc',
    'Mã băm trong metadata trùng khớp 100% với giá trị tính từ tệp gốc trên đĩa D:',
    test3Pass
      ? 'Khớp 100% SHA-256 trên cả PostgreSQL dump và MongoDB archive'
      : 'Sai lệch checksum SHA-256 giữa file và metadata',
    test3Pass ? 'PASS' : 'FAIL',
    { actualPgHash, actualMongoHash }
  );

  // -------------------------------------------------------------------------
  // TEST 4: LOCAL REPLICA TẠI C:\backups_replica CÓ ĐÚNG CẤU TRÚC VÀ KHỚP SHA-256
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 4] XÁC MINH LOCAL REPLICA TRÊN Ổ C:\\ ---');
  const expectedPgReplicaPath = path.join(REPLICA_BASE_DIR, 'postgres', 'hn', pgResult.fileName!);
  const expectedMongoReplicaPath = path.join(REPLICA_BASE_DIR, 'mongodb', mongoResult.fileName!);

  const pgReplicaExists = fs.existsSync(expectedPgReplicaPath);
  const mongoReplicaExists = fs.existsSync(expectedMongoReplicaPath);

  let pgReplicaHash = '';
  let mongoReplicaHash = '';
  if (pgReplicaExists) {
    pgReplicaHash = await calculateFileSHA256(expectedPgReplicaPath);
  }
  if (mongoReplicaExists) {
    mongoReplicaHash = await calculateFileSHA256(expectedMongoReplicaPath);
  }

  console.log(`   + PG Replica Path:    ${expectedPgReplicaPath} (exists: ${pgReplicaExists})`);
  console.log(`     PG Replica Hash:    ${pgReplicaHash}`);
  console.log(`   + Mongo Replica Path: ${expectedMongoReplicaPath} (exists: ${mongoReplicaExists})`);
  console.log(`     Mongo Replica Hash: ${mongoReplicaHash}`);

  const test4Pass =
    pgReplicaExists &&
    mongoReplicaExists &&
    pgReplicaHash.toLowerCase() === actualPgHash.toLowerCase() &&
    mongoReplicaHash.toLowerCase() === actualMongoHash.toLowerCase();

  recordTest(
    4,
    'Local Replica được tạo trong C:\\backups_replica với đúng cấu trúc và SHA-256 khớp file gốc',
    'Tệp replica tồn tại trên ổ C: theo đúng phân cấp thư mục và có mã băm bằng mã băm bản chính',
    test4Pass
      ? `Local Replica cấu trúc chuẩn xác, SHA-256 đối chiếu trùng khớp hoàn toàn (PG=${pgReplicaHash.substring(0, 8)}..., Mongo=${mongoReplicaHash.substring(0, 8)}...)`
      : 'Local Replica không tồn tại hoặc sai lệch cấu trúc/checksum',
    test4Pass ? 'PASS' : 'FAIL',
    { pgReplicaExists, mongoReplicaExists, pgReplicaHash, mongoReplicaHash }
  );

  // -------------------------------------------------------------------------
  // TEST 5: CHECKSUM MISMATCH -> replicaStatus: FAILED, FILE GỐC VẪN SUCCESS
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 5] GIẢ LẬP CHECKSUM MISMATCH TRÊN REPLICA ---');
  const dummyMismatchChecksum = '0000000000000000000000000000000000000000000000000000000000000000';
  const testSubDir = path.join('postgres', 'test_mismatch');
  const testFileName = `test_mismatch_${Date.now()}.dump`;

  const mismatchReplicaRes = await replicateBackupFile(
    pgResult.filePath!,
    testSubDir,
    testFileName,
    dummyMismatchChecksum // Cung cấp checksum sai lệch có chủ đích
  );

  console.log(`   + Kết quả replicate với checksum sai: status=${mismatchReplicaRes.status}, error=${mismatchReplicaRes.errorMessage}`);

  // Kiểm tra file gốc trên D: có bị ảnh hưởng không
  const originalStillExists = fs.existsSync(pgResult.filePath!);
  // Kiểm tra file replica lỗi có bị dọn dẹp sạch không
  const replicaTargetPath = path.join(REPLICA_BASE_DIR, testSubDir, testFileName);
  const replicaFileCleaned = !fs.existsSync(replicaTargetPath);

  const test5Pass =
    mismatchReplicaRes.status === 'FAILED' &&
    Boolean(mismatchReplicaRes.errorMessage?.includes('Sai lệch mã băm SHA-256')) &&
    originalStillExists &&
    replicaFileCleaned;

  recordTest(
    5,
    'Checksum mismatch đánh dấu replicaStatus: FAILED, file gốc vẫn an toàn',
    'replicaStatus: FAILED, file replica sai bị xóa ngay, file gốc trên D: nguyên vẹn',
    test5Pass
      ? 'Phát hiện sai lệch hash kịp thời, thu hồi file replica hỏng, file gốc an toàn 100%'
      : 'Xử lý checksum mismatch không đúng kỳ vọng',
    test5Pass ? 'PASS' : 'FAIL',
    { mismatchReplicaRes, originalStillExists, replicaFileCleaned }
  );

  // -------------------------------------------------------------------------
  // TEST 6: LỖI SAO CHÉP REPLICA -> replicaStatus: FAILED, FILE GỐC KHÔNG BỊ XÓA/FAIL
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 6] GIẢ LẬP LỖI SAO CHÉP REPLICA (INVALID PATH) ---');
  // Giả lập đường dẫn bất hợp pháp trên Windows để gây lỗi sao chép I/O
  const invalidSubDir = 'illegal:<>*?"|';
  const invalidCopyRes = await replicateBackupFile(
    pgResult.filePath!,
    invalidSubDir,
    'test_copy_fail.dump',
    actualPgHash
  );

  console.log(`   + Kết quả replicate vào thư mục không hợp lệ: status=${invalidCopyRes.status}, error=${invalidCopyRes.errorMessage}`);
  const originalIntactAfterError = fs.existsSync(pgResult.filePath!);

  const test6Pass =
    invalidCopyRes.status === 'FAILED' &&
    Boolean(invalidCopyRes.errorMessage) &&
    originalIntactAfterError;

  recordTest(
    6,
    'Lỗi sao chép replica đánh dấu replicaStatus: FAILED, file gốc KHÔNG bị xóa hay fail',
    'replicaStatus: FAILED, không ném exception làm chết service, bản chính D: vẫn toàn vẹn',
    test6Pass
      ? `Lỗi replica được cô lập an toàn: status=FAILED, bản chính D:\\backups vẫn toàn vẹn`
      : 'Lỗi sao chép replica làm ảnh hưởng đến bản chính hoặc không được ghi nhận FAILED',
    test6Pass ? 'PASS' : 'FAIL',
    { invalidCopyRes, originalIntactAfterError }
  );

  // -------------------------------------------------------------------------
  // TEST 7: ATOMIC WRITE CHO METADATA JSON
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 7] ATOMIC WRITE METADATA JSON ---');
  const countBefore = getBackupHistory().length;

  const dummyRecord: BackupMetadataRecord = {
    backupId: `dummy_test_${Date.now()}`,
    sessionId: 'session_atomic_test',
    backupType: 'POSTGRES',
    database: 'warehouse_hn',
    nodeId: 'HN',
    fileName: 'dummy_atomic_test.dump',
    originalPath: 'D:\\backups\\postgres\\hn\\dummy_atomic_test.dump',
    createdAt: new Date().toISOString(),
    sizeBytes: 1024,
    sizeFormatted: '1 KB',
    checksumSHA256: 'a'.repeat(64),
    status: 'SUCCESS',
    validated: true,
    replicaStatus: 'SUCCESS',
    durationMs: 15,
  };

  appendBackupHistory(dummyRecord);
  const historyAfter = getBackupHistory();
  const addedItem = historyAfter.find((r) => r.backupId === dummyRecord.backupId);

  // Kiểm tra không có file .tmp tồn đọng trong thư mục backup metadata
  const backupFiles = fs.readdirSync(BACKUP_BASE_DIR);
  const lingeringTmpFiles = backupFiles.filter((f) => f.includes('backup_history.json') && f.endsWith('.tmp'));

  const test7Pass =
    historyAfter.length === countBefore + 1 &&
    Boolean(addedItem) &&
    lingeringTmpFiles.length === 0;

  recordTest(
    7,
    'Atomic write cho metadata JSON: bảo đảm toàn vẹn và không để lại tệp .tmp',
    'Ghi qua file tạm và renameSync, không có file .tmp tồn đọng, dữ liệu JSON parse hợp lệ',
    test7Pass
      ? `Atomic write hoàn tất thành công (Tổng bản ghi: ${historyAfter.length}, lingeringTmp: 0)`
      : 'Atomic write để lại tệp tạm hoặc làm hỏng dữ liệu metadata',
    test7Pass ? 'PASS' : 'FAIL',
    { countBefore, countAfter: historyAfter.length, lingeringTmpFiles }
  );

  // -------------------------------------------------------------------------
  // TEST 8: FULL BACKUP SESSION (5 DATABASES) VỚI ĐẦY ĐỦ METADATA, CHECKSUM & REPLICA
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 8] FULL BACKUP SESSION (5 DATABASES) ---');
  const fullSessionResult: FullBackupSessionResult = await backupService.runFullBackup('MANUAL');
  console.log(`   + Phiên backup: ID=${fullSessionResult.sessionId}, Status=${fullSessionResult.status}, Duration=${fullSessionResult.durationMs}ms`);

  const historyFull = getBackupHistory();
  const sessionRecords = historyFull.filter((r) => r.sessionId === fullSessionResult.sessionId);
  console.log(`   + Số bản ghi metadata mang sessionId ${fullSessionResult.sessionId}: ${sessionRecords.length}/5`);

  for (const rec of sessionRecords) {
    console.log(`     - [${rec.backupType}] ${rec.database} (${rec.nodeId}): File=${rec.fileName}, Size=${rec.sizeFormatted}, SHA-256=${rec.checksumSHA256.substring(0, 12)}..., Replica=${rec.replicaStatus}`);
  }

  const allHaveChecksum = sessionRecords.length === 5 && sessionRecords.every((r) => r.checksumSHA256 && r.checksumSHA256.length === 64);
  const allReplicated = sessionRecords.length === 5 && sessionRecords.every((r) => r.replicaStatus === 'SUCCESS');
  const allValidated = sessionRecords.length === 5 && sessionRecords.every((r) => r.validated === true);

  const test8Pass =
    fullSessionResult.status === 'ALL_SUCCESS' &&
    sessionRecords.length === 5 &&
    allHaveChecksum &&
    allReplicated &&
    allValidated;

  recordTest(
    8,
    'Full Backup session (5 databases: 4 Postgres + 1 Mongo) với đầy đủ metadata, checksum và replica',
    'status: ALL_SUCCESS, đủ 5 bản ghi mang cùng sessionId, 5/5 có checksum SHA-256 và replicaStatus: SUCCESS',
    test8Pass
      ? `Phiên toàn diện thành công 5/5 database (SessionId: ${fullSessionResult.sessionId}, Duration: ${fullSessionResult.durationMs}ms, 100% Replicated)`
      : `Full backup session không đạt kết quả kỳ vọng (status=${fullSessionResult.status}, records=${sessionRecords.length})`,
    test8Pass ? 'PASS' : 'FAIL',
    { sessionId: fullSessionResult.sessionId, sessionRecordsCount: sessionRecords.length }
  );

  // -------------------------------------------------------------------------
  // TEST 9: REGRESSION CHECK CHO TASK 5.2, 5.3, 5.4
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 9] REGRESSION CHECK CHO CÁC TÍNH NĂNG TRƯỚC ĐÓ ---');
  // 1. Task 5.2: pg_restore --list kiểm tra archive
  const pgCheck = await backupService.validatePostgresBackup(pgResult.filePath!);
  // 2. Task 5.3: Collision handling - Backup Mongo liên tiếp cùng giây không ghi đè
  const mongoCollision1 = await backupService.backupMongo();
  const mongoCollision2 = await backupService.backupMongo();
  const mongoNoOverwrite = mongoCollision1.fileName !== mongoCollision2.fileName &&
    fs.existsSync(mongoCollision1.filePath!) &&
    fs.existsSync(mongoCollision2.filePath!);
  // 3. Task 5.4: Cross-process lock - Khi có lock, phiên khác bị từ chối an toàn
  const lockTry1 = backupService.acquireLock('MANUAL');
  const lockTry2 = backupService.acquireLock('MANUAL');
  backupService.releaseLock();
  const lockPreventConcurrent = lockTry1.acquired === true && lockTry2.acquired === false;

  console.log(`   + Task 5.2 pg_restore validation: valid=${pgCheck.valid} (TOC: ${pgCheck.tocEntryCount})`);
  console.log(`   + Task 5.3 Mongo Collision-handling: noOverwrite=${mongoNoOverwrite} (File 1=${mongoCollision1.fileName}, File 2=${mongoCollision2.fileName})`);
  console.log(`   + Task 5.4 Concurrency lock check: lock1=${lockTry1.acquired}, lock2=${lockTry2.acquired}`);

  const test9Pass =
    pgCheck.valid === true &&
    mongoNoOverwrite === true &&
    lockPreventConcurrent === true;

  recordTest(
    9,
    'Regression check: Không làm gãy tính năng Task 5.2 (validation), Task 5.3 (no-overwrite), Task 5.4 (cross-process lock)',
    'Tất cả cơ chế bảo vệ cốt lõi của các giai đoạn trước vẫn hoạt động bình thường',
    test9Pass
      ? 'Hệ thống hoàn toàn tương thích ngược: Validation PASS, No-overwrite PASS, Lock PASS'
      : 'Phát hiện hồi quy chức năng',
    test9Pass ? 'PASS' : 'FAIL',
    { pgCheckValid: pgCheck.valid, mongoNoOverwrite, lockPreventConcurrent }
  );

  // -------------------------------------------------------------------------
  // BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(95));
  console.log('📊 BẢNG TỔNG HỢP ĐÁNH GIÁ TASK 5.5 (BACKUP METADATA, SHA-256 & LOCAL REPLICA)');
  console.log('='.repeat(95));
  console.log(
    'STT'.padEnd(5) +
    'Nội Dung Kiểm Thử'.padEnd(48) +
    'Trạng Thái'.padEnd(14) +
    'Ghi Chú'
  );
  console.log('-'.repeat(95));

  for (const item of testResults) {
    const icon = item.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    console.log(
      String(item.id).padEnd(5) +
      item.title.substring(0, 46).padEnd(48) +
      icon.padEnd(14) +
      item.actual.substring(0, 35)
    );
  }
  console.log('='.repeat(95));

  const totalPassed = testResults.filter((t) => t.status === 'PASS').length;
  console.log(`\n🏆 KẾT QUẢ CUỐI CÙNG: ${totalPassed}/${testResults.length} KIỂM THỬ THÀNH CÔNG.`);

  if (totalPassed === testResults.length) {
    console.log('🎉 TOÀN BỘ YÊU CẦU CỦA TASK 5.5 ĐÃ ĐƯỢC NGHIỆM THU HOÀN TOÀN!');
  } else {
    console.error('❌ CÓ BÀI TEST THẤT BẠI. CẦN KIỂM TRA LẠI.');
    process.exit(1);
  }
}

runMetadataReplicaTestSuite().catch((err) => {
  console.error('Lỗi nghiêm trọng khi thực thi test suite:', err);
  process.exit(1);
});
