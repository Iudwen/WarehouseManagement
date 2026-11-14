/**
 * restoreService.ts
 * Dịch vụ phục hồi dữ liệu (Restore Service) cho PostgreSQL và MongoDB (Task 5.6.1).
 * 
 * Nguyên tắc an toàn cốt lõi:
 * 1. TUYỆT ĐỐI KHÔNG tự động restore vào các database nghiệp vụ (Production):
 *    - PostgreSQL: warehouse_hn, warehouse_dn, warehouse_hcm, warehouse_central.
 *    - MongoDB: warehouse_events.
 * 2. TUYỆT ĐỐI KHÔNG dùng --clean hoặc --drop ở chế độ mặc định.
 * 3. TUYỆT ĐỐI KHÔNG tự ý ghi đè dữ liệu hiện có nếu database đích đã chứa bảng/collection.
 * 4. Kiểm tra hợp lệ tên database (chống command / SQL injection).
 * 5. Thực thi qua child_process.spawn với mảng arguments an toàn (không ghép chuỗi shell).
 * 6. Kiểm tra tính toàn vẹn của tệp backup: Tồn tại, kích thước > 0, SHA-256 đối chiếu metadata,
 *    và kiểm tra cấu trúc archive (pg_restore --list / mongorestore dryRun).
 * 7. Làm sạch (sanitize) mọi thông tin nhạy cảm trong logs và lỗi.
 */

import fs from 'fs';
import path from 'path';
import {
  backupService,
  PG_RESTORE_PATH,
  DOCKER_PATH,
  MONGO_CONTAINER,
  MONGO_DATABASE,
  calculateFileSHA256,
  getBackupHistory,
  sanitizeError,
  formatBytes,
  runProcess,
  PostgresBackupTarget,
} from './backupService';

export const PG_CREATEDB_PATH = process.env.PG_CREATEDB_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\createdb.exe';
export const PG_DROPDB_PATH = process.env.PG_DROPDB_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\dropdb.exe';
export const PG_PSQL_PATH = process.env.PG_PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';

// Danh sách các cơ sở dữ liệu production được bảo vệ nghiêm ngặt
export const PROTECTED_POSTGRES_DBS = [
  'warehouse_hn',
  'warehouse_dn',
  'warehouse_hcm',
  'warehouse_central',
  'postgres', // maintenance database
];

export const PROTECTED_MONGO_DBS = [
  'warehouse_events',
  'admin',
  'config',
  'local',
];

/**
 * Kiểm tra tên cơ sở dữ liệu hợp lệ (chữ cái, số, gạch dưới, độ dài 2-63 ký tự)
 */
export function isValidDatabaseName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  return /^[a-zA-Z_][a-zA-Z0-9_]{1,62}$/.test(name);
}

export interface PostgresRestoreOptions {
  backupFilePath: string;
  targetDatabase: string;
  targetNodeId?: 'HN' | 'DN' | 'HCM' | 'CENTRAL';
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  createDbIfNotExists?: boolean;
  expectedChecksum?: string;
  allowProductionOverwrite?: boolean;
  allowExistingDataOverwrite?: boolean;
}

export interface PostgresRestoreResult {
  success: boolean;
  targetDatabase: string;
  host: string;
  port: number;
  backupFilePath: string;
  fileSizeBytes: number;
  checksumSHA256: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  tablesRestoredCount?: number;
  tables?: string[];
  errorMessage?: string;
}

export interface MongoRestoreOptions {
  backupFilePath: string;
  targetDatabase: string;
  containerName?: string;
  expectedChecksum?: string;
  sourceDatabase?: string;
  allowProductionOverwrite?: boolean;
  allowExistingDataOverwrite?: boolean;
}

export interface MongoRestoreResult {
  success: boolean;
  targetDatabase: string;
  containerName: string;
  backupFilePath: string;
  fileSizeBytes: number;
  checksumSHA256: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  collectionsRestoredCount?: number;
  collections?: string[];
  documentsRestoredCount?: number;
  errorMessage?: string;
}

export class RestoreService {
  /**
   * Khôi phục cơ sở dữ liệu PostgreSQL từ tệp Custom Format dump
   */
  public async restorePostgres(options: PostgresRestoreOptions): Promise<PostgresRestoreResult> {
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();

    const {
      backupFilePath,
      targetDatabase,
      targetNodeId = 'HN',
      createDbIfNotExists = false,
      allowProductionOverwrite = false,
      allowExistingDataOverwrite = false,
    } = options;

    // 1. Kiểm tra cấu hình kết nối mục tiêu
    const targetNode = backupService.getPostgresBackupTargets().find((t) => t.nodeId === targetNodeId);
    const host = options.host || targetNode?.host || 'localhost';
    const port = options.port || targetNode?.port || 5433;
    const user = options.user || targetNode?.user || process.env.POSTGRES_USER || 'admin';
    const password = options.password || process.env.POSTGRES_PASSWORD || 'admin123';

    // 2. Kiểm tra tính hợp lệ của tên database đích
    if (!isValidDatabaseName(targetDatabase)) {
      return {
        success: false,
        targetDatabase,
        host,
        port,
        backupFilePath,
        fileSizeBytes: 0,
        checksumSHA256: '',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Tên database đích không hợp lệ: '${targetDatabase}'. Tên chỉ được chứa chữ cái, số và dấu gạch dưới (2-63 ký tự).`,
      };
    }

    // 3. Bảo vệ an toàn: Ngăn chặn khôi phục trực tiếp vào database production
    if (PROTECTED_POSTGRES_DBS.includes(targetDatabase) && !allowProductionOverwrite) {
      return {
        success: false,
        targetDatabase,
        host,
        port,
        backupFilePath,
        fileSizeBytes: 0,
        checksumSHA256: '',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Từ chối khôi phục: Không được phép restore trực tiếp đè lên database production '${targetDatabase}' khi chưa có xác nhận an toàn (allowProductionOverwrite=true). Vui lòng khôi phục vào database tạm (staging/test) để kiểm tra tính toàn vẹn.`,
      };
    }

    // 4. Kiểm tra sự tồn tại và dung lượng của tệp backup
    if (!fs.existsSync(backupFilePath)) {
      return {
        success: false,
        targetDatabase,
        host,
        port,
        backupFilePath,
        fileSizeBytes: 0,
        checksumSHA256: '',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Tệp backup không tồn tại: ${backupFilePath}`,
      };
    }

    const stats = fs.statSync(backupFilePath);
    if (stats.size === 0) {
      return {
        success: false,
        targetDatabase,
        host,
        port,
        backupFilePath,
        fileSizeBytes: 0,
        checksumSHA256: '',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Tệp backup rỗng (0 bytes): ${backupFilePath}`,
      };
    }

    // 5. Tính toán và xác minh mã băm SHA-256
    let checksumSHA256 = '';
    try {
      checksumSHA256 = await calculateFileSHA256(backupFilePath);
    } catch (hashErr: any) {
      return {
        success: false,
        targetDatabase,
        host,
        port,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256: '',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Không thể tính mã băm SHA-256 của file backup: ${sanitizeError(hashErr.message)}`,
      };
    }

    let expectedChecksum = options.expectedChecksum;
    if (!expectedChecksum) {
      // Tìm kiếm trong metadata history
      const history = getBackupHistory();
      const fileName = path.basename(backupFilePath);
      const meta = history.find((r) => r.fileName === fileName || r.originalPath === backupFilePath);
      if (meta?.checksumSHA256) {
        expectedChecksum = meta.checksumSHA256;
      }
    }

    if (expectedChecksum && checksumSHA256.toLowerCase() !== expectedChecksum.toLowerCase()) {
      return {
        success: false,
        targetDatabase,
        host,
        port,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Từ chối khôi phục: Sai lệch mã băm SHA-256 (Kỳ vọng: ${expectedChecksum}, Thực tế: ${checksumSHA256})`,
      };
    }

    // 6. Kiểm tra tính hợp lệ của archive bằng pg_restore --list
    const validation = await backupService.validatePostgresBackup(backupFilePath);
    if (!validation.valid) {
      return {
        success: false,
        targetDatabase,
        host,
        port,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Từ chối khôi phục: File archive không hợp lệ hoặc bị hỏng (${validation.error})`,
      };
    }

    // 7. Kiểm tra trạng thái tồn tại của database đích trên máy chủ PostgreSQL
    const envWithPassword = { ...process.env, PGPASSWORD: password };
    const checkDbRes = await runProcess(
      PG_PSQL_PATH,
      ['-h', host, '-p', String(port), '-U', user, '-d', 'postgres', '-t', '-A', '-c', `SELECT 1 FROM pg_database WHERE datname = '${targetDatabase}';`],
      { timeout: 10000, env: envWithPassword }
    );

    const dbExists = checkDbRes.stdout.trim() === '1';

    if (dbExists) {
      // Kiểm tra toàn diện xem database đích đã có bất kỳ bảng, schema, view, sequence hay đối tượng dữ liệu nào chưa
      const objectCheckQuery = `
        SELECT (
          (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')) +
          (SELECT count(*) FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'public', 'pg_toast')) +
          (SELECT count(*) FROM information_schema.routines WHERE routine_schema NOT IN ('pg_catalog', 'information_schema'))
        ) AS total_objects;
      `;
      const objectCheckRes = await runProcess(
        PG_PSQL_PATH,
        ['-h', host, '-p', String(port), '-U', user, '-d', targetDatabase, '-t', '-A', '-c', objectCheckQuery],
        { timeout: 10000, env: envWithPassword }
      );
      const existingObjectCount = parseInt(objectCheckRes.stdout.trim(), 10) || 0;

      if (existingObjectCount > 0 && !allowExistingDataOverwrite) {
        return {
          success: false,
          targetDatabase,
          host,
          port,
          backupFilePath,
          fileSizeBytes: stats.size,
          checksumSHA256,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTimeMs,
          errorMessage: `Database '${targetDatabase}' đã tồn tại và đang chứa ${existingObjectCount} đối tượng dữ liệu (schema/bảng/sequence/object). Từ chối restore để tránh ghi đè dữ liệu khi chưa có xác nhận an toàn (allowExistingDataOverwrite=true).`,
        };
      }
    } else {
      // Database chưa tồn tại -> Kiểm tra tùy chọn tạo database
      if (!createDbIfNotExists) {
        return {
          success: false,
          targetDatabase,
          host,
          port,
          backupFilePath,
          fileSizeBytes: stats.size,
          checksumSHA256,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTimeMs,
          errorMessage: `Database đích '${targetDatabase}' không tồn tại trên ${host}:${port}. Hãy đặt createDbIfNotExists=true để tự động tạo database trước khi restore.`,
        };
      }

      // Tạo database đích mới một cách an toàn
      const createRes = await runProcess(
        PG_CREATEDB_PATH,
        ['-h', host, '-p', String(port), '-U', user, targetDatabase],
        { timeout: 15000, env: envWithPassword }
      );

      if (createRes.code !== 0) {
        return {
          success: false,
          targetDatabase,
          host,
          port,
          backupFilePath,
          fileSizeBytes: stats.size,
          checksumSHA256,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTimeMs,
          errorMessage: `Không thể tạo database đích '${targetDatabase}': ${sanitizeError(createRes.stderr)}`,
        };
      }
    }

    // 8. Thực thi pg_restore an toàn
    // Nguyên tắc: KHÔNG dùng --clean hoặc --drop
    const restoreArgs = [
      '-h', host,
      '-p', String(port),
      '-U', user,
      '-d', targetDatabase,
      '--no-owner',
      '--verbose',
      backupFilePath,
    ];

    const restoreRes = await runProcess(PG_RESTORE_PATH, restoreArgs, {
      timeout: 120000, // Timeout 2 phút
      env: envWithPassword,
    });

    // pg_restore trả về mã 0 khi thành công tuyệt đối, mã 1 khi có warnings không nghiêm trọng
    if (restoreRes.code !== 0 && restoreRes.code !== 1) {
      return {
        success: false,
        targetDatabase,
        host,
        port,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `pg_restore thoát với mã lỗi ${restoreRes.code}: ${sanitizeError(restoreRes.stderr)}`,
      };
    }

    // 9. Xác minh dữ liệu và danh sách bảng sau restore
    const listTablesRes = await runProcess(
      PG_PSQL_PATH,
      ['-h', host, '-p', String(port), '-U', user, '-d', targetDatabase, '-t', '-A', '-c', "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"],
      { timeout: 10000, env: envWithPassword }
    );

    const tables = listTablesRes.stdout
      .split('\n')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTimeMs;

    if (tables.length === 0) {
      return {
        success: false,
        targetDatabase,
        host,
        port,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256,
        startedAt,
        completedAt,
        durationMs,
        errorMessage: `pg_restore hoàn tất nhưng không tìm thấy bảng dữ liệu nào trong database '${targetDatabase}'`,
      };
    }

    return {
      success: true,
      targetDatabase,
      host,
      port,
      backupFilePath,
      fileSizeBytes: stats.size,
      checksumSHA256,
      startedAt,
      completedAt,
      durationMs,
      tablesRestoredCount: tables.length,
      tables,
    };
  }

  /**
   * Khôi phục cơ sở dữ liệu MongoDB từ tệp archive.gz
   */
  public async restoreMongo(options: MongoRestoreOptions): Promise<MongoRestoreResult> {
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();

    const {
      backupFilePath,
      targetDatabase,
      containerName = MONGO_CONTAINER,
      sourceDatabase = MONGO_DATABASE,
      allowProductionOverwrite = false,
      allowExistingDataOverwrite = false,
    } = options;

    // 1. Kiểm tra tính hợp lệ của tên database đích
    if (!isValidDatabaseName(targetDatabase)) {
      return {
        success: false,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: 0,
        checksumSHA256: '',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Tên database MongoDB đích không hợp lệ: '${targetDatabase}'. Tên chỉ được chứa chữ cái, số và dấu gạch dưới (2-63 ký tự).`,
      };
    }

    // 2. Bảo vệ an toàn: Ngăn chặn khôi phục trực tiếp vào database production
    if (PROTECTED_MONGO_DBS.includes(targetDatabase) && !allowProductionOverwrite) {
      return {
        success: false,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: 0,
        checksumSHA256: '',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Từ chối khôi phục: Không được phép restore trực tiếp đè lên database production '${targetDatabase}' khi chưa có xác nhận an toàn (allowProductionOverwrite=true). Vui lòng khôi phục vào database test/staging.`,
      };
    }

    // 3. Kiểm tra file backup tồn tại và kích thước > 0
    if (!fs.existsSync(backupFilePath)) {
      return {
        success: false,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: 0,
        checksumSHA256: '',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Tệp backup MongoDB không tồn tại: ${backupFilePath}`,
      };
    }

    const stats = fs.statSync(backupFilePath);
    if (stats.size === 0) {
      return {
        success: false,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: 0,
        checksumSHA256: '',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Tệp backup MongoDB rỗng (0 bytes): ${backupFilePath}`,
      };
    }

    // 4. Tính toán và xác minh mã băm SHA-256
    let checksumSHA256 = '';
    try {
      checksumSHA256 = await calculateFileSHA256(backupFilePath);
    } catch (hashErr: any) {
      return {
        success: false,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256: '',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Không thể tính mã băm SHA-256 của archive MongoDB: ${sanitizeError(hashErr.message)}`,
      };
    }

    let expectedChecksum = options.expectedChecksum;
    if (!expectedChecksum) {
      const history = getBackupHistory();
      const fileName = path.basename(backupFilePath);
      const meta = history.find((r) => r.fileName === fileName || r.originalPath === backupFilePath);
      if (meta?.checksumSHA256) {
        expectedChecksum = meta.checksumSHA256;
      }
    }

    if (expectedChecksum && checksumSHA256.toLowerCase() !== expectedChecksum.toLowerCase()) {
      return {
        success: false,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Từ chối khôi phục: Sai lệch mã băm SHA-256 (Kỳ vọng: ${expectedChecksum}, Thực tế: ${checksumSHA256})`,
      };
    }

    // 5. Kiểm tra tính toàn vẹn của archive bằng mongorestore dry-run
    const validation = await backupService.validateMongoBackup(backupFilePath, containerName);
    if (!validation.valid) {
      return {
        success: false,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Từ chối khôi phục: Archive MongoDB không hợp lệ (${validation.error})`,
      };
    }

    // 6. Kiểm tra xem database đích đã có collections nào chưa
    const collCountRes = await runProcess(
      DOCKER_PATH,
      ['exec', containerName, 'mongosh', targetDatabase, '--quiet', '--eval', 'db.getCollectionNames().length'],
      { timeout: 10000 }
    );
    const existingCollections = parseInt(collCountRes.stdout.trim(), 10) || 0;

    if (existingCollections > 0 && !allowExistingDataOverwrite) {
      return {
        success: false,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Database '${targetDatabase}' đã tồn tại và đang chứa ${existingCollections} collection. Từ chối restore để tránh ghi đè dữ liệu khi chưa có xác nhận an toàn (allowExistingDataOverwrite=true).`,
      };
    }

    // 7. Sao chép archive tạm vào container để thực hiện restore
    const containerTempArchive = `/tmp/mongorestore_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.archive.gz`;
    const cpIn = await runProcess(DOCKER_PATH, ['cp', backupFilePath, `${containerName}:${containerTempArchive}`], { timeout: 30000 });
    if (cpIn.code !== 0) {
      return {
        success: false,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: `Không thể sao chép file backup vào container để restore: ${sanitizeError(cpIn.stderr)}`,
      };
    }

    try {
      // 8. Thực thi mongorestore an toàn (KHÔNG dùng --drop)
      const restoreArgs = [
        'exec', containerName,
        'mongorestore',
        `--nsFrom=${sourceDatabase}.*`,
        `--nsTo=${targetDatabase}.*`,
        `--archive=${containerTempArchive}`,
        '--gzip',
        '-v',
      ];

      const restoreRes = await runProcess(DOCKER_PATH, restoreArgs, { timeout: 60000 });

      // Dọn dẹp file tạm trong container
      await runProcess(DOCKER_PATH, ['exec', containerName, 'rm', '-f', containerTempArchive]).catch(() => {});

      if (restoreRes.code !== 0) {
        return {
          success: false,
          targetDatabase,
          containerName,
          backupFilePath,
          fileSizeBytes: stats.size,
          checksumSHA256,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startTimeMs,
          errorMessage: `mongorestore thoát với mã lỗi ${restoreRes.code}: ${sanitizeError(restoreRes.stderr)}`,
        };
      }

      // 9. Xác minh danh sách collections và số lượng bản ghi sau khi restore
      const listCollsRes = await runProcess(
        DOCKER_PATH,
        ['exec', containerName, 'mongosh', targetDatabase, '--quiet', '--eval', "db.getCollectionNames().join('\\n')"],
        { timeout: 10000 }
      );

      const collections = listCollsRes.stdout
        .split('\n')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      // Trích xuất số lượng document được khôi phục từ log
      const fullLog = restoreRes.stdout + '\n' + restoreRes.stderr;
      let documentsRestoredCount = 0;
      const docMatch = fullLog.match(/(\d+)\s+document\(s\)\s+restored\s+successfully/i);
      if (docMatch) {
        documentsRestoredCount = parseInt(docMatch[1], 10);
      }

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTimeMs;

      return {
        success: true,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256,
        startedAt,
        completedAt,
        durationMs,
        collectionsRestoredCount: collections.length,
        collections,
        documentsRestoredCount,
      };
    } catch (err: any) {
      await runProcess(DOCKER_PATH, ['exec', containerName, 'rm', '-f', containerTempArchive]).catch(() => {});
      return {
        success: false,
        targetDatabase,
        containerName,
        backupFilePath,
        fileSizeBytes: stats.size,
        checksumSHA256,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        errorMessage: sanitizeError(err.message),
      };
    }
  }

  /**
   * Helper dọn dẹp an toàn database tạm sau kiểm thử (chỉ áp dụng cho test database)
   */
  public async dropTestDatabasePostgres(database: string, targetNodeId: 'HN' | 'DN' | 'HCM' | 'CENTRAL' = 'HN'): Promise<boolean> {
    if (PROTECTED_POSTGRES_DBS.includes(database)) {
      throw new Error(`TUYỆT ĐỐI CẤM drop database production: ${database}`);
    }
    const targetNode = backupService.getPostgresBackupTargets().find((t) => t.nodeId === targetNodeId);
    const host = targetNode?.host || 'localhost';
    const port = targetNode?.port || 5433;
    const user = targetNode?.user || 'admin';
    const password = process.env.POSTGRES_PASSWORD || 'admin123';

    const res = await runProcess(
      PG_DROPDB_PATH,
      ['-h', host, '-p', String(port), '-U', user, database],
      { timeout: 15000, env: { ...process.env, PGPASSWORD: password } }
    );
    return res.code === 0;
  }

  /**
   * Helper dọn dẹp an toàn database MongoDB tạm sau kiểm thử (chỉ áp dụng cho test database)
   */
  public async dropTestDatabaseMongo(database: string, containerName: string = MONGO_CONTAINER): Promise<boolean> {
    if (PROTECTED_MONGO_DBS.includes(database)) {
      throw new Error(`TUYỆT ĐỐI CẤM drop database production: ${database}`);
    }
    const res = await runProcess(
      DOCKER_PATH,
      ['exec', containerName, 'mongosh', database, '--quiet', '--eval', 'db.dropDatabase()'],
      { timeout: 15000 }
    );
    return res.code === 0;
  }
}

export const restoreService = new RestoreService();
