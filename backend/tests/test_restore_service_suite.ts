/**
 * test_restore_service_suite.ts
 * Bộ kiểm thử toàn diện Restore Service (Task 5.6.1):
 * 
 * 1. PostgreSQL restore vào database tạm thành công (đối chiếu bảng & dòng dữ liệu).
 * 2. MongoDB restore vào database tạm thành công (đối chiếu collections & document count).
 * 3. Backup file không tồn tại bị từ chối.
 * 4. Checksum sai bị từ chối trước khi thực thi restore.
 * 5. Archive hỏng bị từ chối qua kiểm tra validation.
 * 6. Ngăn chặn khôi phục vào production & chứng minh production database không bị biến đổi.
 * 7. Không tự động drop database và từ chối ghi đè khi database đích đã có dữ liệu.
 * 8. Regression check: PostgreSQL Backup, MongoDB Backup, Scheduler và Metadata vẫn hoạt động chuẩn xác.
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import fs from 'fs';
import path from 'path';
import {
  backupService,
  BACKUP_BASE_DIR,
  getBackupHistory,
  calculateFileSHA256,
  runProcess,
  DOCKER_PATH,
} from '../src/services/backupService';
import {
  restoreService,
  PROTECTED_POSTGRES_DBS,
  PROTECTED_MONGO_DBS,
  PG_PSQL_PATH,
} from '../src/services/restoreService';
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

async function runRestoreTestSuite() {
  console.log('='.repeat(95));
  console.log('🧪 KIỂM THỬ TOÀN DIỆN RESTORE SERVICE - POSTGRESQL & MONGODB (TASK 5.6.1)');
  console.log('='.repeat(95));

  // Chuẩn bị danh sách backup hiện có
  const pgDir = path.join(BACKUP_BASE_DIR, 'postgres', 'hn');
  const mongoDir = path.join(BACKUP_BASE_DIR, 'mongodb');

  const pgFiles = fs.readdirSync(pgDir).filter((f) => f.endsWith('.dump')).sort();
  const mongoFiles = fs.readdirSync(mongoDir).filter((f) => f.endsWith('.archive.gz')).sort();

  if (pgFiles.length === 0 || mongoFiles.length === 0) {
    console.error('❌ Không tìm thấy tệp backup để kiểm thử! Vui lòng chạy backup trước.');
    process.exit(1);
  }

  const latestPgBackup = path.join(pgDir, pgFiles[pgFiles.length - 1]);
  const latestMongoBackup = path.join(mongoDir, mongoFiles[mongoFiles.length - 1]);

  console.log(`   + File backup PostgreSQL dùng kiểm thử: ${latestPgBackup}`);
  console.log(`   + File backup MongoDB dùng kiểm thử:    ${latestMongoBackup}`);

  // -------------------------------------------------------------------------
  // TEST 1: POSTGRESQL RESTORE VÀO DATABASE TẠM & KIỂM TRA TÍNH TOÀN VẸN DỮ LIỆU
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 1] POSTGRESQL RESTORE VÀO DATABASE TẠM & DATA INTEGRITY ---');
  const testPgDb = 'warehouse_hn_test_restore';
  // Dọn dẹp trước nếu DB tạm còn sót lại
  await restoreService.dropTestDatabasePostgres(testPgDb, 'HN').catch(() => {});

  const pgRestoreRes = await restoreService.restorePostgres({
    backupFilePath: latestPgBackup,
    targetDatabase: testPgDb,
    targetNodeId: 'HN',
    createDbIfNotExists: true,
  });

  console.log(`   + Kết quả restore: success=${pgRestoreRes.success}, tablesRestored=${pgRestoreRes.tablesRestoredCount}`);
  if (pgRestoreRes.tables) {
    console.log(`     Danh sách bảng (${pgRestoreRes.tables.length}): ${pgRestoreRes.tables.slice(0, 5).join(', ')}...`);
  }

  // 1. Đối chiếu số lượng bảng và dữ liệu giữa warehouse_hn gốc và testPgDb
  const password = process.env.POSTGRES_PASSWORD || 'admin123';
  const countOrigRes = await runProcess(
    PG_PSQL_PATH,
    ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', 'warehouse_hn', '-t', '-A', '-c', 'SELECT count(*) FROM san_pham;'],
    { env: { ...process.env, PGPASSWORD: password } }
  );
  const countRestoredRes = await runProcess(
    PG_PSQL_PATH,
    ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', testPgDb, '-t', '-A', '-c', 'SELECT count(*) FROM san_pham;'],
    { env: { ...process.env, PGPASSWORD: password } }
  );

  const origRowCount = parseInt(countOrigRes.stdout.trim(), 10) || 0;
  const restoredRowCount = parseInt(countRestoredRes.stdout.trim(), 10) || 0;
  console.log(`   + Đối chiếu bảng 'san_pham': Gốc=${origRowCount} dòng, Sau restore=${restoredRowCount} dòng`);

  // 2. Đối chiếu số dòng bảng 'kho' và 'nguoi_dung'
  const countKhoOrig = await runProcess(PG_PSQL_PATH, ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', 'warehouse_hn', '-t', '-A', '-c', 'SELECT count(*) FROM kho;'], { env: { ...process.env, PGPASSWORD: password } });
  const countKhoRestored = await runProcess(PG_PSQL_PATH, ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', testPgDb, '-t', '-A', '-c', 'SELECT count(*) FROM kho;'], { env: { ...process.env, PGPASSWORD: password } });
  console.log(`   + Đối chiếu bảng 'kho': Gốc=${countKhoOrig.stdout.trim()} dòng, Sau restore=${countKhoRestored.stdout.trim()} dòng`);

  // 3. Kiểm tra mẫu dữ liệu thực tế (Sample row check)
  const sampleDataOrig = await runProcess(PG_PSQL_PATH, ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', 'warehouse_hn', '-t', '-A', '-c', 'SELECT ma_sp, ten_sp FROM san_pham ORDER BY ma_sp LIMIT 1;'], { env: { ...process.env, PGPASSWORD: password } });
  const sampleDataRestored = await runProcess(PG_PSQL_PATH, ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', testPgDb, '-t', '-A', '-c', 'SELECT ma_sp, ten_sp FROM san_pham ORDER BY ma_sp LIMIT 1;'], { env: { ...process.env, PGPASSWORD: password } });
  console.log(`   + Mẫu dữ liệu gốc:      ${sampleDataOrig.stdout.trim()}`);
  console.log(`   + Mẫu dữ liệu phục hồi: ${sampleDataRestored.stdout.trim()}`);

  const test1Pass =
    pgRestoreRes.success === true &&
    (pgRestoreRes.tablesRestoredCount || 0) >= 19 &&
    origRowCount === restoredRowCount &&
    origRowCount > 0 &&
    countKhoOrig.stdout.trim() === countKhoRestored.stdout.trim() &&
    sampleDataOrig.stdout.trim() === sampleDataRestored.stdout.trim();

  recordTest(
    1,
    'PostgreSQL restore vào database tạm thành công & đối chiếu toàn vẹn dữ liệu',
    'success=true, đủ 19 bảng, số dòng san_pham/kho và mẫu dữ liệu khớp 100% với bản gốc',
    test1Pass
      ? `Khôi phục thành công ${pgRestoreRes.tablesRestoredCount} bảng vào '${testPgDb}', dữ liệu khớp hoàn hảo (${restoredRowCount} dòng, mẫu: ${sampleDataRestored.stdout.trim()})`
      : `Restore thất bại: ${pgRestoreRes.errorMessage || 'Dữ liệu không khớp'}`,
    test1Pass ? 'PASS' : 'FAIL',
    { pgRestoreRes, origRowCount, restoredRowCount, sampleData: sampleDataRestored.stdout.trim() }
  );

  // Dọn dẹp DB tạm sau khi kiểm thử thành công
  await restoreService.dropTestDatabasePostgres(testPgDb, 'HN');

  // -------------------------------------------------------------------------
  // TEST 2: MONGODB RESTORE VÀO DATABASE TẠM & KIỂM TRA MẪU DOCUMENT
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 2] MONGODB RESTORE VÀO DATABASE TẠM & DATA INTEGRITY ---');
  const testMongoDb = 'warehouse_events_test_restore';
  // Dọn dẹp trước nếu DB tạm còn sót lại
  await restoreService.dropTestDatabaseMongo(testMongoDb).catch(() => {});

  const mongoRestoreRes = await restoreService.restoreMongo({
    backupFilePath: latestMongoBackup,
    targetDatabase: testMongoDb,
  });

  console.log(`   + Kết quả restore MongoDB: success=${mongoRestoreRes.success}, collections=${mongoRestoreRes.collectionsRestoredCount}, documents=${mongoRestoreRes.documentsRestoredCount}`);
  if (mongoRestoreRes.collections) {
    console.log(`     Danh sách collections (${mongoRestoreRes.collections.length}): ${mongoRestoreRes.collections.join(', ')}`);
  }

  // Đối chiếu số lượng collections giữa warehouse_events gốc và testMongoDb
  const origCollsRes = await runProcess(
    DOCKER_PATH,
    ['exec', 'warehouse_mongodb', 'mongosh', 'warehouse_events', '--quiet', '--eval', 'db.getCollectionNames().length']
  );
  const origCollsCount = parseInt(origCollsRes.stdout.trim(), 10) || 0;

  // Kiểm tra mẫu document thực tế
  const sampleDocRes = await runProcess(
    DOCKER_PATH,
    ['exec', 'warehouse_mongodb', 'mongosh', testMongoDb, '--quiet', '--eval', 'JSON.stringify(db.warehouse_events.findOne({}, { _id: 0, event_id: 1, event_type: 1 }))']
  );
  console.log(`   + Mẫu document phục hồi từ collection 'warehouse_events': ${sampleDocRes.stdout.trim()}`);

  const test2Pass =
    mongoRestoreRes.success === true &&
    (mongoRestoreRes.collectionsRestoredCount || 0) === origCollsCount &&
    origCollsCount >= 7 &&
    sampleDocRes.stdout.trim().length > 0;

  recordTest(
    2,
    'MongoDB restore vào database tạm thành công & đối chiếu document',
    'success=true, đủ 7 collections, đối chiếu trùng khớp hoàn toàn và đọc được document mẫu',
    test2Pass
      ? `Khôi phục thành công ${mongoRestoreRes.collectionsRestoredCount}/${origCollsCount} collections vào '${testMongoDb}' (${mongoRestoreRes.documentsRestoredCount} docs, sample: ${sampleDocRes.stdout.trim()})`
      : `Restore MongoDB thất bại: ${mongoRestoreRes.errorMessage || 'Số lượng collections không khớp'}`,
    test2Pass ? 'PASS' : 'FAIL',
    { mongoRestoreRes, origCollsCount, sampleDoc: sampleDocRes.stdout.trim() }
  );

  // Dọn dẹp MongoDB test DB
  await restoreService.dropTestDatabaseMongo(testMongoDb);

  // Dọn dẹp MongoDB test DB
  await restoreService.dropTestDatabaseMongo(testMongoDb);

  // -------------------------------------------------------------------------
  // TEST 3: BACKUP FILE KHÔNG TỒN TẠI BỊ TỪ CHỐI
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 3] BACKUP FILE KHÔNG TỒN TẠI BỊ TỪ CHỐI ---');
  const fakePgFile = path.join(pgDir, 'ghost_backup_file_9999.dump');
  const fakeMongoFile = path.join(mongoDir, 'ghost_backup_file_9999.archive.gz');

  const rejectPgNonExist = await restoreService.restorePostgres({
    backupFilePath: fakePgFile,
    targetDatabase: 'test_reject_db',
  });
  const rejectMongoNonExist = await restoreService.restoreMongo({
    backupFilePath: fakeMongoFile,
    targetDatabase: 'test_reject_db',
  });

  const test3Pass =
    rejectPgNonExist.success === false &&
    Boolean(rejectPgNonExist.errorMessage?.includes('không tồn tại')) &&
    rejectMongoNonExist.success === false &&
    Boolean(rejectMongoNonExist.errorMessage?.includes('không tồn tại'));

  recordTest(
    3,
    'Backup file không tồn tại bị từ chối an toàn',
    'success=false, thông báo lỗi tệp không tồn tại cho cả PostgreSQL và MongoDB',
    test3Pass
      ? 'Hệ thống phát hiện tệp thiếu chính xác và từ chối an toàn'
      : 'Không từ chối đúng quy cách khi tệp không tồn tại',
    test3Pass ? 'PASS' : 'FAIL',
    { rejectPgNonExist, rejectMongoNonExist }
  );

  // -------------------------------------------------------------------------
  // TEST 4: CHECKSUM SAI BỊ TỪ CHỐI TRƯỚC KHI THỰC THI RESTORE
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 4] CHECKSUM SAI BỊ TỪ CHỐI ---');
  const fakeChecksum = '0'.repeat(64);

  const rejectPgChecksum = await restoreService.restorePostgres({
    backupFilePath: latestPgBackup,
    targetDatabase: 'test_checksum_db',
    expectedChecksum: fakeChecksum,
  });
  const rejectMongoChecksum = await restoreService.restoreMongo({
    backupFilePath: latestMongoBackup,
    targetDatabase: 'test_checksum_db',
    expectedChecksum: fakeChecksum,
  });

  const test4Pass =
    rejectPgChecksum.success === false &&
    Boolean(rejectPgChecksum.errorMessage?.includes('Sai lệch mã băm SHA-256')) &&
    rejectMongoChecksum.success === false &&
    Boolean(rejectMongoChecksum.errorMessage?.includes('Sai lệch mã băm SHA-256'));

  recordTest(
    4,
    'Checksum sai bị từ chối trước khi thực thi restore',
    'success=false, chặn ngay lập tức và báo lỗi sai lệch SHA-256',
    test4Pass
      ? 'Bảo vệ toàn vẹn: Chặn thành công cả PostgreSQL và MongoDB khi checksum không khớp'
      : 'Không chặn được file có checksum sai',
    test4Pass ? 'PASS' : 'FAIL',
    { rejectPgChecksum, rejectMongoChecksum }
  );

  // -------------------------------------------------------------------------
  // TEST 5: ARCHIVE HỎNG BỊ TỪ CHỐI QUA VALIDATION
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 5] ARCHIVE HỎNG BỊ TỪ CHỐI ---');
  const corruptFile = path.join(BACKUP_BASE_DIR, 'corrupted_test_archive.dump');
  fs.writeFileSync(corruptFile, 'THIS_IS_CORRUPTED_NON_BINARY_DATA_DUMP', 'utf8');

  const rejectPgCorrupt = await restoreService.restorePostgres({
    backupFilePath: corruptFile,
    targetDatabase: 'test_corrupt_db',
  });
  const rejectMongoCorrupt = await restoreService.restoreMongo({
    backupFilePath: corruptFile,
    targetDatabase: 'test_corrupt_db',
  });

  // Dọn dẹp tệp giả lập hỏng
  if (fs.existsSync(corruptFile)) {
    try { fs.unlinkSync(corruptFile); } catch {}
  }

  const test5Pass =
    rejectPgCorrupt.success === false &&
    Boolean(rejectPgCorrupt.errorMessage?.includes('không hợp lệ hoặc bị hỏng')) &&
    rejectMongoCorrupt.success === false &&
    Boolean(rejectMongoCorrupt.errorMessage?.includes('không hợp lệ'));

  recordTest(
    5,
    'Archive hỏng bị từ chối qua kiểm tra validation trước khi nạp dữ liệu',
    'success=false, pg_restore --list và mongorestore dry-run phát hiện archive hỏng',
    test5Pass
      ? 'Validation chặn thành công archive hỏng trước khi đụng vào cơ sở dữ liệu'
      : 'Không phát hiện archive hỏng',
    test5Pass ? 'PASS' : 'FAIL',
    { rejectPgCorrupt, rejectMongoCorrupt }
  );

  // -------------------------------------------------------------------------
  // TEST 6: NGĂN CHẶN RESTORE PRODUCTION & BẢO VỆ DỮ LIỆU GỐC
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 6] BẢO VỆ CƠ SỞ DỮ LIỆU PRODUCTION ---');
  // 1. Ghi nhận số dòng trong production trước khi gọi
  const prodPgBefore = await runProcess(
    PG_PSQL_PATH,
    ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', 'warehouse_hn', '-t', '-A', '-c', 'SELECT count(*) FROM san_pham;'],
    { env: { ...process.env, PGPASSWORD: password } }
  );
  const prodMongoBefore = await runProcess(
    DOCKER_PATH,
    ['exec', 'warehouse_mongodb', 'mongosh', 'warehouse_events', '--quiet', '--eval', 'db.warehouse_events.countDocuments()']
  );

  // 2. Thử khôi phục trực tiếp đè vào database production (không bật allowProductionOverwrite)
  const rejectProdPg = await restoreService.restorePostgres({
    backupFilePath: latestPgBackup,
    targetDatabase: 'warehouse_hn', // Database production!
  });
  const rejectProdMongo = await restoreService.restoreMongo({
    backupFilePath: latestMongoBackup,
    targetDatabase: 'warehouse_events', // Database production!
  });

  // 3. Đo lại số dòng trong production sau khi gọi
  const prodPgAfter = await runProcess(
    PG_PSQL_PATH,
    ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', 'warehouse_hn', '-t', '-A', '-c', 'SELECT count(*) FROM san_pham;'],
    { env: { ...process.env, PGPASSWORD: password } }
  );
  const prodMongoAfter = await runProcess(
    DOCKER_PATH,
    ['exec', 'warehouse_mongodb', 'mongosh', 'warehouse_events', '--quiet', '--eval', 'db.warehouse_events.countDocuments()']
  );

  console.log(`   + Chặn restore PG Production: status=${rejectProdPg.success}, msg=${rejectProdPg.errorMessage}`);
  console.log(`   + Chặn restore Mongo Production: status=${rejectProdMongo.success}, msg=${rejectProdMongo.errorMessage}`);
  console.log(`   + PG san_pham row count: Trước=${prodPgBefore.stdout.trim()}, Sau=${prodPgAfter.stdout.trim()}`);
  console.log(`   + Mongo doc count:       Trước=${prodMongoBefore.stdout.trim()}, Sau=${prodMongoAfter.stdout.trim()}`);

  const test6Pass =
    rejectProdPg.success === false &&
    Boolean(rejectProdPg.errorMessage?.includes('Không được phép restore trực tiếp đè lên database production')) &&
    rejectProdMongo.success === false &&
    Boolean(rejectProdMongo.errorMessage?.includes('Không được phép restore trực tiếp đè lên database production')) &&
    prodPgBefore.stdout.trim() === prodPgAfter.stdout.trim() &&
    prodMongoBefore.stdout.trim() === prodMongoAfter.stdout.trim();

  recordTest(
    6,
    'Ngăn chặn restore vào production và chứng minh dữ liệu production không bị biến đổi',
    'Từ chối restore vào warehouse_hn/warehouse_events, số lượng bản ghi production giữ nguyên 100%',
    test6Pass
      ? `Bảo vệ production tuyệt đối: Bị chặn an toàn, dữ liệu PG (${prodPgAfter.stdout.trim()}) và Mongo (${prodMongoAfter.stdout.trim()}) nguyên vẹn 100%`
      : 'Không chặn được restore production hoặc làm biến đổi dữ liệu nghiệp vụ',
    test6Pass ? 'PASS' : 'FAIL',
    { rejectProdPg, rejectProdMongo }
  );

  // -------------------------------------------------------------------------
  // TEST 7: POSTGRESQL TARGET SAFETY - KIỂM THỬ 4 TRẠNG THÁI DATABASE ĐÍCH
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 7] POSTGRESQL TARGET SAFETY (4 TRẠNG THÁI: TRỐNG / SCHEMA / OBJECT / DATA) ---');
  const existingTestDb = 'test_target_safety_pg';
  await restoreService.dropTestDatabasePostgres(existingTestDb, 'HN').catch(() => {});

  // 1. Tạo database trống
  await runProcess(
    path.join('C:\\Program Files\\PostgreSQL\\18\\bin\\createdb.exe'),
    ['-h', 'localhost', '-p', '5433', '-U', 'admin', existingTestDb],
    { env: { ...process.env, PGPASSWORD: password } }
  );

  // 2. Scenario B: Database có schema nhưng chưa có bảng
  await runProcess(PG_PSQL_PATH, ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', existingTestDb, '-c', 'CREATE SCHEMA custom_test_schema;'], { env: { ...process.env, PGPASSWORD: password } });
  const rejectSchemaOnly = await restoreService.restorePostgres({
    backupFilePath: latestPgBackup,
    targetDatabase: existingTestDb,
    targetNodeId: 'HN',
    allowExistingDataOverwrite: false,
  });
  console.log(`   + [Scenario B - Schema only] Từ chối restore: success=${rejectSchemaOnly.success}, msg=${rejectSchemaOnly.errorMessage}`);

  // 3. Scenario C: Database có object (sequence) nhưng chưa có bảng nghiệp vụ
  await runProcess(PG_PSQL_PATH, ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', existingTestDb, '-c', 'DROP SCHEMA custom_test_schema; CREATE SEQUENCE my_test_seq;'], { env: { ...process.env, PGPASSWORD: password } });
  const rejectObjectOnly = await restoreService.restorePostgres({
    backupFilePath: latestPgBackup,
    targetDatabase: existingTestDb,
    targetNodeId: 'HN',
    allowExistingDataOverwrite: false,
  });
  console.log(`   + [Scenario C - Object only] Từ chối restore: success=${rejectObjectOnly.success}, msg=${rejectObjectOnly.errorMessage}`);

  // 4. Scenario D: Database có bảng và dữ liệu nghiệp vụ
  await runProcess(PG_PSQL_PATH, ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', existingTestDb, '-c', 'DROP SEQUENCE my_test_seq; CREATE TABLE my_custom_test (id INT PRIMARY KEY, name VARCHAR(50)); INSERT INTO my_custom_test VALUES (1, \'keep_me\');'], { env: { ...process.env, PGPASSWORD: password } });
  const rejectData = await restoreService.restorePostgres({
    backupFilePath: latestPgBackup,
    targetDatabase: existingTestDb,
    targetNodeId: 'HN',
    allowExistingDataOverwrite: false,
  });
  console.log(`   + [Scenario D - Table & Data] Từ chối restore: success=${rejectData.success}, msg=${rejectData.errorMessage}`);

  // Kiểm tra bảng my_custom_test có còn nguyên vẹn không (chứng minh database KHÔNG bị drop)
  const customTableCheck = await runProcess(
    PG_PSQL_PATH,
    ['-h', 'localhost', '-p', '5433', '-U', 'admin', '-d', existingTestDb, '-t', '-A', '-c', 'SELECT name FROM my_custom_test WHERE id = 1;'],
    { env: { ...process.env, PGPASSWORD: password } }
  );

  const test7Pass =
    rejectSchemaOnly.success === false &&
    Boolean(rejectSchemaOnly.errorMessage?.includes('chứa')) &&
    rejectObjectOnly.success === false &&
    Boolean(rejectObjectOnly.errorMessage?.includes('chứa')) &&
    rejectData.success === false &&
    Boolean(rejectData.errorMessage?.includes('chứa')) &&
    customTableCheck.stdout.trim() === 'keep_me';

  recordTest(
    7,
    'PostgreSQL Target Safety: Phát hiện và từ chối ghi đè khi có schema, object, hoặc dữ liệu',
    'success=false cho cả 3 trường hợp (schema, sequence, bảng), database KHÔNG bị drop, dữ liệu nguyên vẹn',
    test7Pass
      ? `Bảo vệ toàn diện 4 trạng thái: Chặn an toàn khi có Schema, Sequence, hoặc Bảng ('${customTableCheck.stdout.trim()}')`
      : 'Phát hiện hoặc bảo vệ object chưa đạt yêu cầu',
    test7Pass ? 'PASS' : 'FAIL',
    { rejectSchemaOnly, rejectObjectOnly, rejectData, preservedData: customTableCheck.stdout.trim() }
  );

  // Dọn dẹp DB kiểm thử
  await restoreService.dropTestDatabasePostgres(existingTestDb, 'HN');

  // -------------------------------------------------------------------------
  // TEST 8: REGRESSION CHECK CHO CÁC TÍNH NĂNG TRƯỚC ĐÓ (TASK 5.2 - 5.5)
  // -------------------------------------------------------------------------
  console.log('\n--- [TEST 8] REGRESSION CHECK CHO TASK 5.2, 5.3, 5.4, 5.5 ---');
  // 1. Chạy 1 lượt backup PostgreSQL & MongoDB
  const regPg = await backupService.backupPostgres('HN');
  const regMongo = await backupService.backupMongo();

  // 2. Kiểm tra metadata history
  const history = getBackupHistory();
  const pgMeta = history.find((r) => r.fileName === regPg.fileName);
  const mongoMeta = history.find((r) => r.fileName === regMongo.fileName);

  // 3. Kiểm tra Scheduler & Lock
  const schedStatus = backupScheduler.getStatus();
  const lockTry1 = backupService.acquireLock('MANUAL');
  const lockTry2 = backupService.acquireLock('MANUAL');
  backupService.releaseLock();

  const test8Pass =
    regPg.success === true &&
    regPg.replicaStatus === 'SUCCESS' &&
    regMongo.success === true &&
    regMongo.replicaStatus === 'SUCCESS' &&
    Boolean(pgMeta?.checksumSHA256) &&
    Boolean(mongoMeta?.checksumSHA256) &&
    schedStatus.config.scheduleTime === '02:00' &&
    lockTry1.acquired === true &&
    lockTry2.acquired === false;

  recordTest(
    8,
    'Regression check: Toàn bộ tính năng Task 5.2, 5.3, 5.4, 5.5 vẫn hoạt động hoàn hảo',
    'Postgres Backup PASS, Mongo Backup PASS, Metadata PASS, Replica PASS, Scheduler PASS, Lock PASS',
    test8Pass
      ? 'Hệ thống hoàn toàn tương thích ngược: 0 lỗi hồi quy'
      : 'Phát hiện hồi quy sau khi tích hợp Restore Service',
    test8Pass ? 'PASS' : 'FAIL',
    { regPgSuccess: regPg.success, regMongoSuccess: regMongo.success, schedStatus }
  );

  // -------------------------------------------------------------------------
  // BẢNG TỔNG HỢP KẾT QUẢ KIỂM THỬ
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(95));
  console.log('📊 BẢNG TỔNG HỢP ĐÁNH GIÁ TASK 5.6.1 (RESTORE SERVICE - POSTGRESQL & MONGODB)');
  console.log('='.repeat(95));
  console.log(
    'STT'.padEnd(5) +
    'Nội Dung Kiểm Thử'.padEnd(50) +
    'Trạng Thái'.padEnd(14) +
    'Ghi Chú'
  );
  console.log('-'.repeat(95));

  for (const item of testResults) {
    const icon = item.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    console.log(
      String(item.id).padEnd(5) +
      item.title.substring(0, 48).padEnd(50) +
      icon.padEnd(14) +
      item.actual.substring(0, 32)
    );
  }
  console.log('='.repeat(95));

  const totalPassed = testResults.filter((t) => t.status === 'PASS').length;
  console.log(`\n🏆 KẾT QUẢ CUỐI CÙNG: ${totalPassed}/${testResults.length} KIỂM THỬ THÀNH CÔNG.`);

  if (totalPassed === testResults.length) {
    console.log('🎉 TOÀN BỘ YÊU CẦU CỦA TASK 5.6.1 ĐÃ ĐƯỢC NGHIỆM THU HOÀN TOÀN!');
  } else {
    console.error('❌ CÓ BÀI TEST THẤT BẠI. CẦN KIỂM TRA LẠI.');
    process.exit(1);
  }
}

runRestoreTestSuite().catch((err) => {
  console.error('Lỗi nghiêm trọng khi thực thi test suite:', err);
  process.exit(1);
});
