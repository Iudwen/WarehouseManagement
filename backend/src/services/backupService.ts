/**
 * backupService.ts
 * Dịch vụ sao lưu (Backup) và kiểm tra tính hợp lệ cho 4 PostgreSQL databases:
 * - Kho Hà Nội (warehouse_hn)
 * - Kho Đà Nẵng (warehouse_dn)
 * - Kho TP.HCM (warehouse_hcm)
 * - Central Data Center (warehouse_central)
 * 
 * Tuân thủ nghiêm ngặt các nguyên tắc:
 * 1. Sử dụng pg_dump custom format (-F c).
 * 2. Lưu trữ tại D:\backups\postgres\<node> (tự động tạo thư mục).
 * 3. Đặt tên file kèm timestamp, không ghi đè file cũ.
 * 4. Ghi file tạm (.tmp) trước, chỉ đổi tên thành .dump khi thành công 100%.
 * 5. Xóa sạch file tạm nếu tiến trình lỗi hoặc file có kích thước 0-byte.
 * 6. Tuyệt đối không để lộ mật khẩu trong logs/lệnh gọi tiến trình (dùng PGPASSWORD env).
 * 7. Sử dụng spawn an toàn với mảng arguments (chống command injection).
 * 8. Xác minh tính hợp lệ bằng pg_restore --list.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

export const BACKUP_BASE_DIR = process.env.BACKUP_BASE_DIR || 'D:\\backups';
export const REPLICA_BASE_DIR = process.env.REPLICA_BASE_DIR || 'C:\\backups_replica';
export const BACKUP_HISTORY_FILE = process.env.BACKUP_HISTORY_FILE || path.join(BACKUP_BASE_DIR, 'backup_history.json');
export const REPLICA_HISTORY_FILE = path.join(REPLICA_BASE_DIR, 'backup_history.json');
export const PG_DUMP_PATH = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';
export const PG_RESTORE_PATH = process.env.PG_RESTORE_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe';
export const DOCKER_PATH = process.env.DOCKER_PATH || 'docker';
export const MONGO_CONTAINER = process.env.MONGO_CONTAINER || 'warehouse_mongodb';
export const MONGO_DATABASE = process.env.MONGO_DATABASE || 'warehouse_events';
export const BACKUP_LOCK_FILE = process.env.BACKUP_LOCK_FILE || path.join(BACKUP_BASE_DIR, '.backup.lock');

export interface FullBackupSessionResult {
  sessionId: string;
  triggerType: 'SCHEDULED' | 'MANUAL';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'ALL_SUCCESS' | 'PARTIAL_SUCCESS' | 'ALL_FAILED' | 'SKIPPED_ALREADY_RUNNING';
  postgresSummary?: PostgresBackupAllSummary;
  mongoResult?: MongoBackupResult;
  message?: string;
}

export interface BackupLockMetadata {
  lockId: string;
  pid: number;
  triggerType: 'SCHEDULED' | 'MANUAL';
  startedAt: string;
}

/**
 * Kiểm tra xem một tiến trình có đang chạy thực tế hay không
 * Sử dụng process.kill(pid, 0)
 */
export function isProcessRunning(pid: number): boolean {
  if (!pid || typeof pid !== 'number' || isNaN(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      return false; // Tiến trình không tồn tại (dead)
    }
    if (err.code === 'EPERM') {
      return true; // Tiến trình tồn tại nhưng bị giới hạn quyền
    }
    return false;
  }
}

export interface PostgresBackupTarget {
  nodeId: 'HN' | 'DN' | 'HCM' | 'CENTRAL';
  name: string;
  database: string;
  host: string;
  port: number;
  user: string;
  subDir: string;
}

export interface PostgresBackupResult {
  nodeId: 'HN' | 'DN' | 'HCM' | 'CENTRAL';
  database: string;
  host: string;
  port: number;
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSizeBytes?: number;
  fileSizeFormatted?: string;
  checksumSHA256?: string;
  replicaStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  replicaPath?: string;
  replicaChecksumSHA256?: string;
  replicaErrorMessage?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  validated: boolean;
  tocEntryCount?: number;
  errorMessage?: string;
}

export interface PostgresBackupAllSummary {
  total: number;
  successCount: number;
  failedCount: number;
  status: 'ALL_SUCCESS' | 'PARTIAL_SUCCESS' | 'ALL_FAILED';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  results: PostgresBackupResult[];
}

export interface ValidationResult {
  valid: boolean;
  tocEntryCount: number;
  error?: string;
}

export interface MongoBackupTarget {
  containerName: string;
  database: string;
  subDir: string;
}

export interface MongoBackupResult {
  database: string;
  containerName: string;
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSizeBytes?: number;
  fileSizeFormatted?: string;
  checksumSHA256?: string;
  replicaStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  replicaPath?: string;
  replicaChecksumSHA256?: string;
  replicaErrorMessage?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  validated: boolean;
  collections?: string[];
  errorMessage?: string;
}

export interface MongoValidationResult {
  valid: boolean;
  collections: string[];
  error?: string;
}

export interface BackupMetadataRecord {
  backupId: string;
  sessionId?: string;
  backupType: 'POSTGRES' | 'MONGODB';
  database: string;
  nodeId: 'HN' | 'DN' | 'HCM' | 'CENTRAL' | 'MONGO';
  fileName: string;
  originalPath: string;
  createdAt: string;
  sizeBytes: number;
  sizeFormatted: string;
  checksumSHA256: string;
  status: 'SUCCESS' | 'FAILED';
  validated: boolean;
  tocOrCollectionsCount?: number;
  replicaStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  replicaPath?: string;
  replicaChecksumSHA256?: string;
  replicaErrorMessage?: string;
  errorMessage?: string;
  durationMs: number;
}

export interface ReplicaResult {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  replicaPath?: string;
  replicaChecksum?: string;
  errorMessage?: string;
}

/**
 * Tính toán mã băm SHA-256 của tệp tin sử dụng Node.js Crypto Stream
 */
export function calculateFileSHA256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`Tệp tin không tồn tại: ${filePath}`));
    }
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Sao chép tệp backup sang Local Replica (C:\backups_replica) và xác thực checksum
 */
export async function replicateBackupFile(
  originalFilePath: string,
  subDir: string,
  fileName: string,
  originalChecksum: string
): Promise<ReplicaResult> {
  const replicaBase = process.env.REPLICA_BASE_DIR || REPLICA_BASE_DIR;
  const replicaDir = path.join(replicaBase, subDir);
  const replicaFinalPath = path.join(replicaDir, fileName);
  const replicaTempPath = path.join(replicaDir, `${fileName}.${Date.now()}_${Math.random().toString(36).substring(2, 6)}.tmp`);

  try {
    if (!fs.existsSync(replicaDir)) {
      fs.mkdirSync(replicaDir, { recursive: true });
    }

    // 1. Sao chép sang file tạm trên replica
    fs.copyFileSync(originalFilePath, replicaTempPath);

    // 2. Tính SHA-256 trên bản sao tạm
    const replicaChecksum = await calculateFileSHA256(replicaTempPath);

    // 3. So khớp mã băm với file gốc
    if (replicaChecksum.toLowerCase() !== originalChecksum.toLowerCase()) {
      try { fs.unlinkSync(replicaTempPath); } catch {}
      return {
        status: 'FAILED',
        errorMessage: `Sai lệch mã băm SHA-256 replica: Gốc=${originalChecksum}, Replica=${replicaChecksum}`,
      };
    }

    // 4. Đổi tên nguyên tử sang file chính thức
    fs.renameSync(replicaTempPath, replicaFinalPath);

    return {
      status: 'SUCCESS',
      replicaPath: replicaFinalPath,
      replicaChecksum,
    };
  } catch (err: any) {
    if (fs.existsSync(replicaTempPath)) {
      try { fs.unlinkSync(replicaTempPath); } catch {}
    }
    return {
      status: 'FAILED',
      errorMessage: sanitizeError(err.message),
    };
  }
}

/**
 * Ghi lịch sử backup an toàn (Atomic JSON write)
 */
export function appendBackupHistory(records: BackupMetadataRecord | BackupMetadataRecord[]): void {
  const newItems = Array.isArray(records) ? records : [records];
  if (newItems.length === 0) return;

  const historyFileD = process.env.BACKUP_HISTORY_FILE || BACKUP_HISTORY_FILE;
  const replicaBase = process.env.REPLICA_BASE_DIR || REPLICA_BASE_DIR;
  const historyFileC = path.join(replicaBase, path.basename(historyFileD));

  let history: BackupMetadataRecord[] = [];
  if (fs.existsSync(historyFileD)) {
    try {
      const content = fs.readFileSync(historyFileD, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        history = parsed;
      }
    } catch {
      // Bỏ qua nếu file đang rỗng hoặc chưa hoàn thiện
    }
  }

  history.push(...newItems);

  // 1. Ghi an toàn vào file tạm trên D:\backups
  const targetDirD = path.dirname(historyFileD);
  const tempFileD = `${historyFileD}.${Date.now()}_${Math.random().toString(36).substring(2, 6)}.tmp`;
  try {
    if (!fs.existsSync(targetDirD)) {
      fs.mkdirSync(targetDirD, { recursive: true });
    }
    fs.writeFileSync(tempFileD, JSON.stringify(history, null, 2), 'utf8');
    fs.renameSync(tempFileD, historyFileD);
  } catch (err: any) {
    if (fs.existsSync(tempFileD)) {
      try { fs.unlinkSync(tempFileD); } catch {}
    }
    console.error(`❌ [METADATA] Lỗi khi ghi file lịch sử backup trên D:\\: ${sanitizeError(err.message)}`);
  }

  // 2. Đồng bộ an toàn sang C:\backups_replica
  if (fs.existsSync(replicaBase)) {
    const tempFileC = `${historyFileC}.${Date.now()}_${Math.random().toString(36).substring(2, 6)}.tmp`;
    try {
      fs.writeFileSync(tempFileC, JSON.stringify(history, null, 2), 'utf8');
      fs.renameSync(tempFileC, historyFileC);
    } catch {
      if (fs.existsSync(tempFileC)) {
        try { fs.unlinkSync(tempFileC); } catch {}
      }
    }
  }
}

/**
 * Đọc lịch sử backup từ metadata JSON
 */
export function getBackupHistory(customFilePath?: string): BackupMetadataRecord[] {
  const targetFile = customFilePath || process.env.BACKUP_HISTORY_FILE || BACKUP_HISTORY_FILE;
  if (!fs.existsSync(targetFile)) {
    return [];
  }
  try {
    const content = fs.readFileSync(targetFile, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Helper: Làm sạch thông báo lỗi, loại bỏ hoàn toàn mật khẩu và token nhạy cảm
export function sanitizeError(err: any): string {
  if (!err) return '';
  let msg = typeof err === 'string' ? err : err?.message || String(err);
  msg = msg.replace(/:[^:@]+@/g, ':***@');
  msg = msg.replace(/password=[^\s;]+/gi, 'password=***');
  msg = msg.replace(/PGPASSWORD=[^\s;]+/gi, 'PGPASSWORD=***');
  msg = msg.replace(/mongodb(\+srv)?:\/\/[^\s"']+/gi, 'mongodb://***:***@host:port/db');
  return msg.trim();
}

// Helper: Định dạng dung lượng byte sang KB/MB dễ đọc
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Helper: Sinh timestamp định dạng YYYYMMDD_HHmmss
function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

export class BackupService {
  /**
   * Lấy danh sách 4 PostgreSQL targets hợp lệ theo cấu hình dự án
   */
  public getPostgresBackupTargets(): PostgresBackupTarget[] {
    const user = process.env.POSTGRES_USER || 'admin';
    return [
      {
        nodeId: 'HN',
        name: 'Kho Hà Nội (HN01)',
        database: process.env.POSTGRES_DB_HN || 'warehouse_hn',
        host: process.env.POSTGRES_HOST_HN || 'localhost',
        port: Number(process.env.POSTGRES_PORT_HN) || 5433,
        user,
        subDir: 'hn',
      },
      {
        nodeId: 'DN',
        name: 'Kho Đà Nẵng (DN01)',
        database: process.env.POSTGRES_DB_DN || 'warehouse_dn',
        host: process.env.POSTGRES_HOST_DN || 'localhost',
        port: Number(process.env.POSTGRES_PORT_DN) || 5434,
        user,
        subDir: 'dn',
      },
      {
        nodeId: 'HCM',
        name: 'Kho TP. Hồ Chí Minh (HCM01)',
        database: process.env.POSTGRES_DB_HCM || 'warehouse_hcm',
        host: process.env.POSTGRES_HOST_HCM || 'localhost',
        port: Number(process.env.POSTGRES_PORT_HCM) || 5435,
        user,
        subDir: 'hcm',
      },
      {
        nodeId: 'CENTRAL',
        name: 'Trung Tâm Dữ Liệu (Central DC)',
        database: process.env.POSTGRES_DB_CENTRAL || 'warehouse_central',
        host: process.env.POSTGRES_HOST_CENTRAL || 'localhost',
        port: Number(process.env.POSTGRES_PORT_CENTRAL) || 5436,
        user,
        subDir: 'central',
      },
    ];
  }

  /**
   * Kiểm tra tính hợp lệ của binary pg_dump và pg_restore
   */
  public checkBinariesExist(): { pgDump: boolean; pgRestore: boolean } {
    return {
      pgDump: fs.existsSync(PG_DUMP_PATH),
      pgRestore: fs.existsSync(PG_RESTORE_PATH),
    };
  }

  /**
   * Kiểm tra tính hợp lệ của tệp Custom Format archive bằng pg_restore --list
   */
  public async validatePostgresBackup(filePath: string): Promise<ValidationResult> {
    if (!fs.existsSync(filePath)) {
      return { valid: false, tocEntryCount: 0, error: `Tệp không tồn tại: ${filePath}` };
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      return { valid: false, tocEntryCount: 0, error: 'Tệp backup có kích thước 0 bytes (rỗng)' };
    }

    if (!fs.existsSync(PG_RESTORE_PATH)) {
      return { valid: false, tocEntryCount: 0, error: `Không tìm thấy pg_restore tại: ${PG_RESTORE_PATH}` };
    }

    return new Promise<ValidationResult>((resolve) => {
      let stdoutData = '';
      let stderrData = '';

      const child = spawn(PG_RESTORE_PATH, ['--list', filePath], {
        windowsHide: true,
        timeout: 30000,
      });

      child.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      child.on('error', (err) => {
        resolve({
          valid: false,
          tocEntryCount: 0,
          error: sanitizeError(err.message),
        });
      });

      child.on('close', (code) => {
        if (code === 0) {
          // Đếm số dòng hợp lệ trong mục lục (TOC - Table of Contents)
          const lines = stdoutData.split('\n').filter((l) => l.trim().length > 0 && !l.trim().startsWith(';'));
          resolve({
            valid: true,
            tocEntryCount: lines.length,
          });
        } else {
          resolve({
            valid: false,
            tocEntryCount: 0,
            error: sanitizeError(stderrData) || `pg_restore --list thoát với mã lỗi ${code}`,
          });
        }
      });
    });
  }

  /**
   * Backup một PostgreSQL Database được chỉ định
   */
  public async backupPostgres(
    targetIdOrObject: 'HN' | 'DN' | 'HCM' | 'CENTRAL' | PostgresBackupTarget,
    options?: { sessionId?: string }
  ): Promise<PostgresBackupResult> {
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();

    // 1. Xác định target
    let target: PostgresBackupTarget | undefined;
    if (typeof targetIdOrObject === 'string') {
      target = this.getPostgresBackupTargets().find((t) => t.nodeId === targetIdOrObject);
    } else {
      target = targetIdOrObject;
    }

    if (!target) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTimeMs;
      const errorMsg = `Target không hợp lệ: ${JSON.stringify(targetIdOrObject)}`;
      const backupId = `pg_unknown_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      appendBackupHistory({
        backupId,
        sessionId: options?.sessionId,
        backupType: 'POSTGRES',
        database: 'unknown',
        nodeId: typeof targetIdOrObject === 'string' ? targetIdOrObject : 'HN',
        fileName: '',
        originalPath: '',
        createdAt: completedAt,
        sizeBytes: 0,
        sizeFormatted: '0 Bytes',
        checksumSHA256: '',
        status: 'FAILED',
        validated: false,
        replicaStatus: 'SKIPPED',
        errorMessage: errorMsg,
        durationMs,
      });
      return {
        nodeId: typeof targetIdOrObject === 'string' ? targetIdOrObject : 'HN',
        database: 'unknown',
        host: 'localhost',
        port: 0,
        success: false,
        replicaStatus: 'SKIPPED',
        startedAt,
        completedAt,
        durationMs,
        validated: false,
        errorMessage: errorMsg,
      };
    }

    // 2. Kiểm tra binary pg_dump.exe
    if (!fs.existsSync(PG_DUMP_PATH)) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTimeMs;
      const errorMsg = `Không tìm thấy pg_dump.exe tại đường dẫn: ${PG_DUMP_PATH}`;
      const backupId = `pg_${target.nodeId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      appendBackupHistory({
        backupId,
        sessionId: options?.sessionId,
        backupType: 'POSTGRES',
        database: target.database,
        nodeId: target.nodeId,
        fileName: '',
        originalPath: '',
        createdAt: completedAt,
        sizeBytes: 0,
        sizeFormatted: '0 Bytes',
        checksumSHA256: '',
        status: 'FAILED',
        validated: false,
        replicaStatus: 'SKIPPED',
        errorMessage: errorMsg,
        durationMs,
      });
      return {
        nodeId: target.nodeId,
        database: target.database,
        host: target.host,
        port: target.port,
        success: false,
        replicaStatus: 'SKIPPED',
        startedAt,
        completedAt,
        durationMs,
        validated: false,
        errorMessage: errorMsg,
      };
    }

    // 3. Chuẩn bị thư mục đích
    const targetDir = path.join(BACKUP_BASE_DIR, 'postgres', target.subDir);
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    } catch (mkdirErr: any) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTimeMs;
      const errorMsg = `Không thể tạo thư mục lưu backup ${targetDir}: ${sanitizeError(mkdirErr)}`;
      const backupId = `pg_${target.nodeId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      appendBackupHistory({
        backupId,
        sessionId: options?.sessionId,
        backupType: 'POSTGRES',
        database: target.database,
        nodeId: target.nodeId,
        fileName: '',
        originalPath: '',
        createdAt: completedAt,
        sizeBytes: 0,
        sizeFormatted: '0 Bytes',
        checksumSHA256: '',
        status: 'FAILED',
        validated: false,
        replicaStatus: 'SKIPPED',
        errorMessage: errorMsg,
        durationMs,
      });
      return {
        nodeId: target.nodeId,
        database: target.database,
        host: target.host,
        port: target.port,
        success: false,
        replicaStatus: 'SKIPPED',
        startedAt,
        completedAt,
        durationMs,
        validated: false,
        errorMessage: errorMsg,
      };
    }

    // 4. Thiết lập tên file chính thức và file tạm
    const timestamp = generateTimestamp();
    const fileName = `${target.database}_${timestamp}.dump`;
    const finalFilePath = path.join(targetDir, fileName);
    const tempFilePath = path.join(targetDir, `${fileName}.tmp`);

    const password = process.env.POSTGRES_PASSWORD || 'admin123';

    // 5. Chuẩn bị tham số gọi pg_dump an toàn (Custom format -F c, blobs -b, verbose -v)
    const args = [
      '-h', target.host,
      '-p', String(target.port),
      '-U', target.user,
      '-d', target.database,
      '-F', 'c',
      '-b',
      '-v',
      '-f', tempFilePath,
    ];

    return new Promise<PostgresBackupResult>((resolve) => {
      let stderrData = '';

      // Gọi spawn an toàn: truyền PGPASSWORD qua environment, KHÔNG ghép chuỗi shell
      const child = spawn(PG_DUMP_PATH, args, {
        env: {
          ...process.env,
          PGPASSWORD: password,
        },
        windowsHide: true,
        timeout: 60000, // Timeout 60 giây
      });

      child.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      child.on('error', (err) => {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTimeMs;
        const errorMsg = sanitizeError(err.message);
        if (fs.existsSync(tempFilePath)) {
          try { fs.unlinkSync(tempFilePath); } catch {}
        }
        const backupId = `pg_${target!.nodeId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        appendBackupHistory({
          backupId,
          sessionId: options?.sessionId,
          backupType: 'POSTGRES',
          database: target!.database,
          nodeId: target!.nodeId,
          fileName,
          originalPath: finalFilePath,
          createdAt: completedAt,
          sizeBytes: 0,
          sizeFormatted: '0 Bytes',
          checksumSHA256: '',
          status: 'FAILED',
          validated: false,
          replicaStatus: 'SKIPPED',
          errorMessage: errorMsg,
          durationMs,
        });
        resolve({
          nodeId: target!.nodeId,
          database: target!.database,
          host: target!.host,
          port: target!.port,
          success: false,
          replicaStatus: 'SKIPPED',
          startedAt,
          completedAt,
          durationMs,
          validated: false,
          errorMessage: errorMsg,
        });
      });

      child.on('close', async (code) => {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTimeMs;

        if (code !== 0) {
          // pg_dump thất bại -> Xóa sạch file tạm (tránh để lại file rỗng / dở dang)
          if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch {}
          }
          const errorMsg = sanitizeError(stderrData) || `pg_dump thoát với mã lỗi ${code}`;
          const backupId = `pg_${target!.nodeId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          appendBackupHistory({
            backupId,
            sessionId: options?.sessionId,
            backupType: 'POSTGRES',
            database: target!.database,
            nodeId: target!.nodeId,
            fileName,
            originalPath: finalFilePath,
            createdAt: completedAt,
            sizeBytes: 0,
            sizeFormatted: '0 Bytes',
            checksumSHA256: '',
            status: 'FAILED',
            validated: false,
            replicaStatus: 'SKIPPED',
            errorMessage: errorMsg,
            durationMs,
          });
          resolve({
            nodeId: target!.nodeId,
            database: target!.database,
            host: target!.host,
            port: target!.port,
            success: false,
            replicaStatus: 'SKIPPED',
            startedAt,
            completedAt,
            durationMs,
            validated: false,
            errorMessage: errorMsg,
          });
          return;
        }

        // Kiểm tra dung lượng file tạm
        if (!fs.existsSync(tempFilePath)) {
          const errorMsg = 'Tệp backup tạm thời không được tạo';
          const backupId = `pg_${target!.nodeId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          appendBackupHistory({
            backupId,
            sessionId: options?.sessionId,
            backupType: 'POSTGRES',
            database: target!.database,
            nodeId: target!.nodeId,
            fileName,
            originalPath: finalFilePath,
            createdAt: completedAt,
            sizeBytes: 0,
            sizeFormatted: '0 Bytes',
            checksumSHA256: '',
            status: 'FAILED',
            validated: false,
            replicaStatus: 'SKIPPED',
            errorMessage: errorMsg,
            durationMs,
          });
          resolve({
            nodeId: target!.nodeId,
            database: target!.database,
            host: target!.host,
            port: target!.port,
            success: false,
            replicaStatus: 'SKIPPED',
            startedAt,
            completedAt,
            durationMs,
            validated: false,
            errorMessage: errorMsg,
          });
          return;
        }

        const stats = fs.statSync(tempFilePath);
        if (stats.size === 0) {
          // File rỗng 0 bytes -> Xóa ngay
          try { fs.unlinkSync(tempFilePath); } catch {}
          const errorMsg = 'pg_dump hoàn tất nhưng sinh tệp 0-byte';
          const backupId = `pg_${target!.nodeId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          appendBackupHistory({
            backupId,
            sessionId: options?.sessionId,
            backupType: 'POSTGRES',
            database: target!.database,
            nodeId: target!.nodeId,
            fileName,
            originalPath: finalFilePath,
            createdAt: completedAt,
            sizeBytes: 0,
            sizeFormatted: '0 Bytes',
            checksumSHA256: '',
            status: 'FAILED',
            validated: false,
            replicaStatus: 'SKIPPED',
            errorMessage: errorMsg,
            durationMs,
          });
          resolve({
            nodeId: target!.nodeId,
            database: target!.database,
            host: target!.host,
            port: target!.port,
            success: false,
            replicaStatus: 'SKIPPED',
            startedAt,
            completedAt,
            durationMs,
            validated: false,
            errorMessage: errorMsg,
          });
          return;
        }

        // Chuyển file tạm thành file chính thức (Atomic rename)
        try {
          fs.renameSync(tempFilePath, finalFilePath);
        } catch (renameErr: any) {
          try { fs.unlinkSync(tempFilePath); } catch {}
          const errorMsg = `Không thể đổi tên file tạm: ${sanitizeError(renameErr)}`;
          const backupId = `pg_${target!.nodeId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          appendBackupHistory({
            backupId,
            sessionId: options?.sessionId,
            backupType: 'POSTGRES',
            database: target!.database,
            nodeId: target!.nodeId,
            fileName,
            originalPath: finalFilePath,
            createdAt: completedAt,
            sizeBytes: 0,
            sizeFormatted: '0 Bytes',
            checksumSHA256: '',
            status: 'FAILED',
            validated: false,
            replicaStatus: 'SKIPPED',
            errorMessage: errorMsg,
            durationMs,
          });
          resolve({
            nodeId: target!.nodeId,
            database: target!.database,
            host: target!.host,
            port: target!.port,
            success: false,
            replicaStatus: 'SKIPPED',
            startedAt,
            completedAt,
            durationMs,
            validated: false,
            errorMessage: errorMsg,
          });
          return;
        }

        // Kiểm tra tính hợp lệ bằng pg_restore --list
        const validation = await this.validatePostgresBackup(finalFilePath);

        // Tính toán checksum SHA-256 và Replica
        let checksumSHA256: string | undefined;
        let replicaRes: ReplicaResult = { status: 'SKIPPED' };

        if (validation.valid) {
          try {
            // 1. Tính toán checksum SHA-256 của file gốc trên D:\backups
            checksumSHA256 = await calculateFileSHA256(finalFilePath);

            // 2. Sao chép và xác minh trên Local Replica (C:\backups_replica)
            replicaRes = await replicateBackupFile(
              finalFilePath,
              path.join('postgres', target!.subDir),
              fileName,
              checksumSHA256
            );
          } catch (repErr: any) {
            replicaRes = {
              status: 'FAILED',
              errorMessage: sanitizeError(repErr.message),
            };
          }
        }

        const backupId = `pg_${target!.nodeId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const metadataRecord: BackupMetadataRecord = {
          backupId,
          sessionId: options?.sessionId,
          backupType: 'POSTGRES',
          database: target!.database,
          nodeId: target!.nodeId,
          fileName,
          originalPath: finalFilePath,
          createdAt: completedAt,
          sizeBytes: stats.size,
          sizeFormatted: formatBytes(stats.size),
          checksumSHA256: checksumSHA256 || '',
          status: validation.valid ? 'SUCCESS' : 'FAILED',
          validated: validation.valid,
          tocOrCollectionsCount: validation.tocEntryCount,
          replicaStatus: replicaRes.status,
          replicaPath: replicaRes.replicaPath,
          replicaChecksumSHA256: replicaRes.replicaChecksum,
          replicaErrorMessage: replicaRes.errorMessage,
          errorMessage: validation.valid ? undefined : validation.error,
          durationMs,
        };

        appendBackupHistory(metadataRecord);

        resolve({
          nodeId: target!.nodeId,
          database: target!.database,
          host: target!.host,
          port: target!.port,
          success: validation.valid,
          filePath: finalFilePath,
          fileName,
          fileSizeBytes: stats.size,
          fileSizeFormatted: formatBytes(stats.size),
          checksumSHA256,
          replicaStatus: replicaRes.status,
          replicaPath: replicaRes.replicaPath,
          replicaChecksumSHA256: replicaRes.replicaChecksum,
          replicaErrorMessage: replicaRes.errorMessage,
          startedAt,
          completedAt,
          durationMs,
          validated: validation.valid,
          tocEntryCount: validation.tocEntryCount,
          errorMessage: validation.valid ? undefined : validation.error,
        });
      });
    });
  }

  /**
   * Backup lần lượt cả 4 PostgreSQL Databases (HN, DN, HCM, Central)
   * Trả về bảng tổng hợp rõ ràng từng database và trạng thái phiên
   */
  public async backupAllPostgres(options?: { sessionId?: string }): Promise<PostgresBackupAllSummary> {
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();
    const targets = this.getPostgresBackupTargets();
    const results: PostgresBackupResult[] = [];

    // Chạy tuần tự từng database để không gây áp lực I/O quá lớn lên ổ đĩa
    for (const target of targets) {
      const res = await this.backupPostgres(target, options);
      results.push(res);
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTimeMs;
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    let status: 'ALL_SUCCESS' | 'PARTIAL_SUCCESS' | 'ALL_FAILED' = 'ALL_SUCCESS';
    if (successCount === 0) {
      status = 'ALL_FAILED';
    } else if (failedCount > 0) {
      status = 'PARTIAL_SUCCESS';
    }

    return {
      total: targets.length,
      successCount,
      failedCount,
      status,
      startedAt,
      completedAt,
      durationMs,
      results,
    };
  }

  /**
   * Kiểm tra các công cụ phục vụ MongoDB Backup (docker, mongodump, mongorestore)
   */
  public async checkMongoToolsExist(containerName: string = MONGO_CONTAINER): Promise<{
    docker: boolean;
    containerRunning: boolean;
    mongodump: boolean;
    mongorestore: boolean;
    error?: string;
  }> {
    try {
      const dockerVer = await runProcess(DOCKER_PATH, ['--version'], { timeout: 5000 });
      if (dockerVer.code !== 0) {
        return {
          docker: false,
          containerRunning: false,
          mongodump: false,
          mongorestore: false,
          error: 'Docker CLI không khả dụng trên host',
        };
      }

      const psCheck = await runProcess(DOCKER_PATH, ['ps', '--filter', `name=${containerName}`, '--format', '{{.Names}}'], { timeout: 5000 });
      const isRunning = psCheck.stdout.split('\n').map((n) => n.trim()).includes(containerName);
      if (!isRunning) {
        return {
          docker: true,
          containerRunning: false,
          mongodump: false,
          mongorestore: false,
          error: `Container ${containerName} hiện không chạy`,
        };
      }

      const dumpCheck = await runProcess(DOCKER_PATH, ['exec', containerName, 'which', 'mongodump'], { timeout: 5000 });
      const restoreCheck = await runProcess(DOCKER_PATH, ['exec', containerName, 'which', 'mongorestore'], { timeout: 5000 });

      return {
        docker: true,
        containerRunning: true,
        mongodump: dumpCheck.code === 0,
        mongorestore: restoreCheck.code === 0,
        error: (dumpCheck.code !== 0 || restoreCheck.code !== 0) ? 'Không tìm thấy mongodump hoặc mongorestore trong container' : undefined,
      };
    } catch (err: any) {
      return {
        docker: false,
        containerRunning: false,
        mongodump: false,
        mongorestore: false,
        error: sanitizeError(err.message),
      };
    }
  }

  /**
   * Kiểm tra tính toàn vẹn của tệp archive MongoDB bằng mongorestore --archive --gzip --dryRun -v
   */
  public async validateMongoBackup(
    filePath: string,
    containerName: string = MONGO_CONTAINER
  ): Promise<MongoValidationResult> {
    if (!fs.existsSync(filePath)) {
      return { valid: false, collections: [], error: `Tệp không tồn tại: ${filePath}` };
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      return { valid: false, collections: [], error: 'Tệp backup có kích thước 0 bytes (rỗng)' };
    }

    const tempContainerValidate = `/tmp/mongoval_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.archive.gz`;

    try {
      // 1. Copy archive tạm vào container để kiểm tra
      const cpIn = await runProcess(DOCKER_PATH, ['cp', filePath, `${containerName}:${tempContainerValidate}`], { timeout: 30000 });
      if (cpIn.code !== 0) {
        return {
          valid: false,
          collections: [],
          error: `Không thể sao chép file vào container để xác thực: ${sanitizeError(cpIn.stderr)}`,
        };
      }

      // 2. Chạy mongorestore dryRun -v
      const restoreRes = await runProcess(
        DOCKER_PATH,
        ['exec', containerName, 'mongorestore', `--archive=${tempContainerValidate}`, '--gzip', '--dryRun', '-v'],
        { timeout: 30000 }
      );

      // 3. Dọn dẹp file tạm trong container
      await runProcess(DOCKER_PATH, ['exec', containerName, 'rm', '-f', tempContainerValidate], { timeout: 10000 });

      if (restoreRes.code !== 0) {
        return {
          valid: false,
          collections: [],
          error: sanitizeError(restoreRes.stderr) || `mongorestore kiểm tra thất bại với mã ${restoreRes.code}`,
        };
      }

      // 4. Trích xuất danh sách collections từ log
      const fullLog = restoreRes.stdout + '\n' + restoreRes.stderr;
      const regex = /found collection `[^.]+\.([^`]+)`/g;
      const collections: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = regex.exec(fullLog)) !== null) {
        if (!collections.includes(match[1])) {
          collections.push(match[1]);
        }
      }

      // Nếu regex trên chưa bắt được thì thử regex prelude
      if (collections.length === 0) {
        const preludeRegex = /archive prelude `[^.]+\.([^`]+)`/g;
        while ((match = preludeRegex.exec(fullLog)) !== null) {
          if (!collections.includes(match[1])) {
            collections.push(match[1]);
          }
        }
      }

      return {
        valid: true,
        collections,
      };
    } catch (err: any) {
      // Đảm bảo dọn dẹp file tạm trong container nếu xảy ra ngoại lệ
      await runProcess(DOCKER_PATH, ['exec', containerName, 'rm', '-f', tempContainerValidate]).catch(() => {});
      return {
        valid: false,
        collections: [],
        error: sanitizeError(err.message),
      };
    }
  }

  /**
   * Backup cơ sở dữ liệu MongoDB (warehouse_events)
   * Định dạng file: warehouse_events_YYYYMMDD_HHmmss.archive.gz
   */
  public async backupMongo(
    targetConfig?: Partial<MongoBackupTarget>,
    options?: { sessionId?: string }
  ): Promise<MongoBackupResult> {
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();

    const containerName = targetConfig?.containerName || process.env.MONGO_CONTAINER || MONGO_CONTAINER;
    const database = targetConfig?.database || process.env.MONGO_DATABASE || MONGO_DATABASE;
    const subDir = targetConfig?.subDir || 'mongodb';

    const outputDir = path.join(BACKUP_BASE_DIR, subDir);
    if (!fs.existsSync(outputDir)) {
      try {
        fs.mkdirSync(outputDir, { recursive: true });
      } catch (err: any) {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTimeMs;
        const errorMsg = `Không thể tạo thư mục lưu trữ MongoDB ${outputDir}: ${sanitizeError(err)}`;
        const backupId = `mongo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        appendBackupHistory({
          backupId,
          sessionId: options?.sessionId,
          backupType: 'MONGODB',
          database,
          nodeId: 'MONGO',
          fileName: '',
          originalPath: '',
          createdAt: completedAt,
          sizeBytes: 0,
          sizeFormatted: '0 Bytes',
          checksumSHA256: '',
          status: 'FAILED',
          validated: false,
          replicaStatus: 'SKIPPED',
          errorMessage: errorMsg,
          durationMs,
        });
        return {
          database,
          containerName,
          success: false,
          replicaStatus: 'SKIPPED',
          startedAt,
          completedAt,
          durationMs,
          validated: false,
          errorMessage: errorMsg,
        };
      }
    }

    const timestamp = generateTimestamp();
    // Tạo tên file tạm duy nhất trên host để tránh xung đột khi chạy đồng thời
    const tempFileName = `${database}_${timestamp}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.archive.gz.tmp`;
    const tempFilePath = path.join(outputDir, tempFileName);
    const containerTempArchive = `/tmp/mongodump_${timestamp}_${Math.random().toString(36).substring(2, 6)}.archive.gz`;

    try {
      // 1. Chạy mongodump vào file tạm bên trong container
      const dumpRes = await runProcess(
        DOCKER_PATH,
        ['exec', containerName, 'mongodump', `--db=${database}`, `--archive=${containerTempArchive}`, '--gzip'],
        { timeout: 60000 }
      );

      if (dumpRes.code !== 0) {
        // Dọn dẹp trong container
        await runProcess(DOCKER_PATH, ['exec', containerName, 'rm', '-f', containerTempArchive]).catch(() => {});
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTimeMs;
        const errorMsg = sanitizeError(dumpRes.stderr) || `mongodump thoát với mã ${dumpRes.code}`;
        const backupId = `mongo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        appendBackupHistory({
          backupId,
          sessionId: options?.sessionId,
          backupType: 'MONGODB',
          database,
          nodeId: 'MONGO',
          fileName: '',
          originalPath: '',
          createdAt: completedAt,
          sizeBytes: 0,
          sizeFormatted: '0 Bytes',
          checksumSHA256: '',
          status: 'FAILED',
          validated: false,
          replicaStatus: 'SKIPPED',
          errorMessage: errorMsg,
          durationMs,
        });
        return {
          database,
          containerName,
          success: false,
          replicaStatus: 'SKIPPED',
          startedAt,
          completedAt,
          durationMs,
          validated: false,
          errorMessage: errorMsg,
        };
      }

      // 2. Sao chép file từ container sang host dưới tên .tmp
      const cpRes = await runProcess(
        DOCKER_PATH,
        ['cp', `${containerName}:${containerTempArchive}`, tempFilePath],
        { timeout: 60000 }
      );

      // 3. Xóa ngay file tạm trong container sau khi sao chép
      await runProcess(DOCKER_PATH, ['exec', containerName, 'rm', '-f', containerTempArchive]).catch(() => {});

      if (cpRes.code !== 0) {
        if (fs.existsSync(tempFilePath)) {
          try { fs.unlinkSync(tempFilePath); } catch {}
        }
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTimeMs;
        const errorMsg = `Lỗi sao chép file backup từ container: ${sanitizeError(cpRes.stderr)}`;
        const backupId = `mongo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        appendBackupHistory({
          backupId,
          sessionId: options?.sessionId,
          backupType: 'MONGODB',
          database,
          nodeId: 'MONGO',
          fileName: '',
          originalPath: '',
          createdAt: completedAt,
          sizeBytes: 0,
          sizeFormatted: '0 Bytes',
          checksumSHA256: '',
          status: 'FAILED',
          validated: false,
          replicaStatus: 'SKIPPED',
          errorMessage: errorMsg,
          durationMs,
        });
        return {
          database,
          containerName,
          success: false,
          replicaStatus: 'SKIPPED',
          startedAt,
          completedAt,
          durationMs,
          validated: false,
          errorMessage: errorMsg,
        };
      }

      // 4. Kiểm tra file tạm trên host
      if (!fs.existsSync(tempFilePath)) {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTimeMs;
        const errorMsg = 'Tệp backup tạm thời không tồn tại trên host';
        const backupId = `mongo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        appendBackupHistory({
          backupId,
          sessionId: options?.sessionId,
          backupType: 'MONGODB',
          database,
          nodeId: 'MONGO',
          fileName: '',
          originalPath: '',
          createdAt: completedAt,
          sizeBytes: 0,
          sizeFormatted: '0 Bytes',
          checksumSHA256: '',
          status: 'FAILED',
          validated: false,
          replicaStatus: 'SKIPPED',
          errorMessage: errorMsg,
          durationMs,
        });
        return {
          database,
          containerName,
          success: false,
          replicaStatus: 'SKIPPED',
          startedAt,
          completedAt,
          durationMs,
          validated: false,
          errorMessage: errorMsg,
        };
      }

      const stats = fs.statSync(tempFilePath);
      if (stats.size === 0) {
        try { fs.unlinkSync(tempFilePath); } catch {}
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTimeMs;
        const errorMsg = 'mongodump hoàn tất nhưng sinh tệp 0-byte';
        const backupId = `mongo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        appendBackupHistory({
          backupId,
          sessionId: options?.sessionId,
          backupType: 'MONGODB',
          database,
          nodeId: 'MONGO',
          fileName: '',
          originalPath: '',
          createdAt: completedAt,
          sizeBytes: 0,
          sizeFormatted: '0 Bytes',
          checksumSHA256: '',
          status: 'FAILED',
          validated: false,
          replicaStatus: 'SKIPPED',
          errorMessage: errorMsg,
          durationMs,
        });
        return {
          database,
          containerName,
          success: false,
          replicaStatus: 'SKIPPED',
          startedAt,
          completedAt,
          durationMs,
          validated: false,
          errorMessage: errorMsg,
        };
      }

      // 5. XÁC THỰC ARCHIVE BẰNG MONGORESTORE --DRYRUN -V TRÊN FILE TẠM (.tmp)
      // Đảm bảo chỉ khi archive thực sự hợp lệ mới được đổi tên thành file chính thức
      const validation = await this.validateMongoBackup(tempFilePath, containerName);
      if (!validation.valid) {
        // Validation thất bại -> Xóa file tạm, TUYỆT ĐỐI KHÔNG TẠO/GIỮ FILE CHÍNH THỨC
        try { fs.unlinkSync(tempFilePath); } catch {}
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTimeMs;
        const errorMsg = `Xác thực archive tạm thất bại: ${validation.error || 'Dữ liệu không hợp lệ qua kiểm tra mongorestore dry-run'}`;
        const backupId = `mongo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        appendBackupHistory({
          backupId,
          sessionId: options?.sessionId,
          backupType: 'MONGODB',
          database,
          nodeId: 'MONGO',
          fileName: '',
          originalPath: '',
          createdAt: completedAt,
          sizeBytes: 0,
          sizeFormatted: '0 Bytes',
          checksumSHA256: '',
          status: 'FAILED',
          validated: false,
          replicaStatus: 'SKIPPED',
          errorMessage: errorMsg,
          durationMs,
        });
        return {
          database,
          containerName,
          success: false,
          replicaStatus: 'SKIPPED',
          startedAt,
          completedAt,
          durationMs,
          validated: false,
          errorMessage: errorMsg,
        };
      }

      // 6. CHỐNG GHI ĐÈ KHI TRÙNG TIMESTAMP TRONG CÙNG MỘT GIÂY HOẶC YÊU CẦU ĐỒNG THỜI
      let finalFileName = `${database}_${timestamp}.archive.gz`;
      let finalFilePath = path.join(outputDir, finalFileName);
      let collisionIndex = 1;
      while (fs.existsSync(finalFilePath)) {
        finalFileName = `${database}_${timestamp}_${collisionIndex}.archive.gz`;
        finalFilePath = path.join(outputDir, finalFileName);
        collisionIndex++;
      }

      // 7. ĐỔI TÊN NGUYÊN TỬ (Atomic rename) từ .tmp sang file chính thức duy nhất
      try {
        fs.renameSync(tempFilePath, finalFilePath);
      } catch (renameErr: any) {
        if (fs.existsSync(tempFilePath)) {
          try { fs.unlinkSync(tempFilePath); } catch {}
        }
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startTimeMs;
        const errorMsg = `Không thể đổi tên file tạm sang file chính thức: ${sanitizeError(renameErr)}`;
        const backupId = `mongo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        appendBackupHistory({
          backupId,
          sessionId: options?.sessionId,
          backupType: 'MONGODB',
          database,
          nodeId: 'MONGO',
          fileName: '',
          originalPath: '',
          createdAt: completedAt,
          sizeBytes: 0,
          sizeFormatted: '0 Bytes',
          checksumSHA256: '',
          status: 'FAILED',
          validated: false,
          replicaStatus: 'SKIPPED',
          errorMessage: errorMsg,
          durationMs,
        });
        return {
          database,
          containerName,
          success: false,
          replicaStatus: 'SKIPPED',
          startedAt,
          completedAt,
          durationMs,
          validated: false,
          errorMessage: errorMsg,
        };
      }

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTimeMs;

      // 8. Tính SHA-256 và Sao chép sang Local Replica
      let checksumSHA256: string | undefined;
      let replicaRes: ReplicaResult = { status: 'SKIPPED' };

      try {
        checksumSHA256 = await calculateFileSHA256(finalFilePath);
        replicaRes = await replicateBackupFile(
          finalFilePath,
          subDir,
          finalFileName,
          checksumSHA256
        );
      } catch (repErr: any) {
        replicaRes = {
          status: 'FAILED',
          errorMessage: sanitizeError(repErr.message),
        };
      }

      const backupId = `mongo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const metadataRecord: BackupMetadataRecord = {
        backupId,
        sessionId: options?.sessionId,
        backupType: 'MONGODB',
        database,
        nodeId: 'MONGO',
        fileName: finalFileName,
        originalPath: finalFilePath,
        createdAt: completedAt,
        sizeBytes: stats.size,
        sizeFormatted: formatBytes(stats.size),
        checksumSHA256: checksumSHA256 || '',
        status: 'SUCCESS',
        validated: true,
        tocOrCollectionsCount: validation.collections?.length || 0,
        replicaStatus: replicaRes.status,
        replicaPath: replicaRes.replicaPath,
        replicaChecksumSHA256: replicaRes.replicaChecksum,
        replicaErrorMessage: replicaRes.errorMessage,
        durationMs,
      };

      appendBackupHistory(metadataRecord);

      return {
        database,
        containerName,
        success: true,
        filePath: finalFilePath,
        fileName: finalFileName,
        fileSizeBytes: stats.size,
        fileSizeFormatted: formatBytes(stats.size),
        checksumSHA256,
        replicaStatus: replicaRes.status,
        replicaPath: replicaRes.replicaPath,
        replicaChecksumSHA256: replicaRes.replicaChecksum,
        replicaErrorMessage: replicaRes.errorMessage,
        startedAt,
        completedAt,
        durationMs,
        validated: true,
        collections: validation.collections,
      };
    } catch (err: any) {
      // Dọn dẹp cả file tạm trên host và container nếu xảy ra ngoại lệ
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }
      await runProcess(DOCKER_PATH, ['exec', containerName, 'rm', '-f', containerTempArchive]).catch(() => {});

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTimeMs;
      const errorMsg = sanitizeError(err.message);
      const backupId = `mongo_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      appendBackupHistory({
        backupId,
        sessionId: options?.sessionId,
        backupType: 'MONGODB',
        database,
        nodeId: 'MONGO',
        fileName: '',
        originalPath: '',
        createdAt: completedAt,
        sizeBytes: 0,
        sizeFormatted: '0 Bytes',
        checksumSHA256: '',
        status: 'FAILED',
        validated: false,
        replicaStatus: 'SKIPPED',
        errorMessage: errorMsg,
        durationMs,
      });

      return {
        database,
        containerName,
        success: false,
        replicaStatus: 'SKIPPED',
        startedAt,
        completedAt,
        durationMs,
        validated: false,
        errorMessage: errorMsg,
      };
    }
  }

  private isBackupRunning: boolean = false;
  private currentLockId: string | null = null;

  /**
   * Cố gắng chiếm lock file và memory lock (ngăn chạy đồng thời đa tiến trình / đa instance)
   * Tuân thủ nghiêm ngặt quy tắc Task 5.4.1:
   * 1. KHÔNG xóa lock chỉ vì file tồn tại quá 15 phút.
   * 2. Nếu PID sở hữu lock vẫn đang hoạt động: KHÔNG được xóa lock.
   * 3. Chỉ xóa stale lock khi PID sở hữu không còn tồn tại trên hệ thống.
   * 4. Nếu lock file bị lỗi/không đọc được PID: KHÔNG tự ý xóa nếu chưa xác minh.
   */
  public acquireLock(triggerType: 'SCHEDULED' | 'MANUAL'): { acquired: boolean; reason?: string } {
    // 1. Kiểm tra in-memory lock của tiến trình hiện tại
    if (this.isBackupRunning) {
      return { acquired: false, reason: 'Một phiên backup khác đang chạy trong tiến trình này (In-process lock)' };
    }

    // 2. Đảm bảo thư mục cơ sở D:\backups tồn tại
    if (!fs.existsSync(BACKUP_BASE_DIR)) {
      try { fs.mkdirSync(BACKUP_BASE_DIR, { recursive: true }); } catch {}
    }

    // 3. Kiểm tra lock file liên tiến trình
    if (fs.existsSync(BACKUP_LOCK_FILE)) {
      let lockMetadata: BackupLockMetadata | null = null;
      let rawContent = '';
      try {
        rawContent = fs.readFileSync(BACKUP_LOCK_FILE, 'utf8');
        lockMetadata = JSON.parse(rawContent);
      } catch {
        // File rỗng hoặc không parse được JSON
      }

      if (!lockMetadata || typeof lockMetadata.pid !== 'number' || isNaN(lockMetadata.pid) || lockMetadata.pid <= 0) {
        // Thông tin PID không hợp lệ hoặc lock không đọc được: KHÔNG tự ý xóa để bảo vệ quyền sở hữu
        return {
          acquired: false,
          reason: `Lock file hiện tại không hợp lệ hoặc không xác định được PID (${rawContent || 'unreadable'}), từ chối xóa tự động để bảo đảm an toàn.`,
        };
      }

      // Kiểm tra trạng thái sống của tiến trình sở hữu lock
      const isAlive = isProcessRunning(lockMetadata.pid);
      if (isAlive) {
        // TIẾN TRÌNH VẪN ĐANG HOẠT ĐỘNG: TUYỆT ĐỐI KHÔNG XÓA DÙ THỜI GIAN BAO LÂU
        return {
          acquired: false,
          reason: `Tiến trình PID ${lockMetadata.pid} sở hữu lock (${lockMetadata.lockId || 'active'}) vẫn đang hoạt động, không được xóa lock.`,
        };
      }

      // TIẾN TRÌNH ĐÃ KẾT THÚC / KHÔNG CÒN TỒN TẠI TRÊN HỆ THỐNG:
      // Xử lý stale lock an toàn từ tiến trình đã chết (crashed)
      console.warn(
        `⚠️ [BACKUP] Phát hiện stale lock từ tiến trình đã kết thúc (PID: ${lockMetadata.pid}, LockId: ${lockMetadata.lockId}). Tiến hành thu hồi an toàn...`
      );
      try {
        fs.unlinkSync(BACKUP_LOCK_FILE);
      } catch (unlinkErr: any) {
        return {
          acquired: false,
          reason: `Không thể dọn dẹp stale lock từ tiến trình đã chết: ${sanitizeError(unlinkErr.message)}`,
        };
      }
    }

    // 4. Tạo lock file với cờ 'wx' (atomic create, lỗi nếu file đã tồn tại)
    const newLockId = `lock_${generateTimestamp()}_${Math.random().toString(36).substring(2, 8)}`;
    try {
      const lockData: BackupLockMetadata = {
        lockId: newLockId,
        pid: process.pid,
        triggerType,
        startedAt: new Date().toISOString(),
      };
      fs.writeFileSync(BACKUP_LOCK_FILE, JSON.stringify(lockData, null, 2), { flag: 'wx' });
      this.isBackupRunning = true;
      this.currentLockId = newLockId;
      return { acquired: true };
    } catch (err: any) {
      return {
        acquired: false,
        reason: `Không thể tạo lock file (tiến trình khác vừa chiếm lock): ${sanitizeError(err.message)}`,
      };
    }
  }

  /**
   * Giải phóng lock sau khi hoàn tất phiên backup
   * Tuân thủ nguyên tắc Task 5.4.1:
   * - Chỉ process sở hữu lock mới được xóa lock đó (kiểm tra PID và lockId).
   * - Không xóa nhầm lock mới do process khác tạo ra.
   */
  public releaseLock(): void {
    this.isBackupRunning = false;
    const lockIdToRelease = this.currentLockId;
    this.currentLockId = null;

    if (!fs.existsSync(BACKUP_LOCK_FILE)) {
      return;
    }

    try {
      const content = fs.readFileSync(BACKUP_LOCK_FILE, 'utf8');
      const metadata: BackupLockMetadata = JSON.parse(content);

      // Xác minh quyền sở hữu: Phải đúng PID và đúng lockId của phiên này
      if (metadata.pid === process.pid && metadata.lockId === lockIdToRelease) {
        fs.unlinkSync(BACKUP_LOCK_FILE);
      } else {
        console.warn(
          `⚠️ [BACKUP] Bỏ qua xóa lock: Lock trên đĩa (PID: ${metadata.pid}, LockId: ${metadata.lockId}) không thuộc phiên này (PID: ${process.pid}, LockId: ${lockIdToRelease}). Không xóa nhầm lock của tiến trình khác.`
        );
      }
    } catch (err: any) {
      console.warn(`⚠️ [BACKUP] Lỗi khi kiểm tra giải phóng lock: ${sanitizeError(err.message)}`);
    }
  }

  /**
   * Kiểm tra trạng thái lock hiện tại
   */
  public isLocked(): boolean {
    return this.isBackupRunning || fs.existsSync(BACKUP_LOCK_FILE);
  }

  /**
   * Đọc metadata của lock file hiện tại (nếu có)
   */
  public getCurrentLockMetadata(): BackupLockMetadata | null {
    if (!fs.existsSync(BACKUP_LOCK_FILE)) return null;
    try {
      return JSON.parse(fs.readFileSync(BACKUP_LOCK_FILE, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Thực hiện phiên sao lưu toàn diện hệ thống (4 PostgreSQL + 1 MongoDB)
   * Tự động chiếm lock và giải phóng lock an toàn
   */
  public async runFullBackup(
    triggerType: 'SCHEDULED' | 'MANUAL' = 'MANUAL',
    options?: {
      mongoTarget?: Partial<MongoBackupTarget>;
    }
  ): Promise<FullBackupSessionResult> {
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();
    const sessionId = `backup_${generateTimestamp()}_${Math.random().toString(36).substring(2, 6)}`;

    // 1. Chiếm lock
    const lock = this.acquireLock(triggerType);
    if (!lock.acquired) {
      const durationMs = Date.now() - startTimeMs;
      console.warn(`⚠️ [BACKUP SESSION ${sessionId}] Bị từ chối: ${lock.reason}`);
      return {
        sessionId,
        triggerType,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs,
        status: 'SKIPPED_ALREADY_RUNNING',
        message: lock.reason,
      };
    }

    console.log(`\n================================================================================`);
    console.log(`🚀 [BACKUP SESSION START] ID: ${sessionId} | Loại: ${triggerType} | Bắt đầu: ${startedAt}`);
    console.log(`================================================================================`);

    try {
      // 2. Chạy backup 4 PostgreSQL databases
      console.log(`📦 [BACKUP] 1/2: Đang sao lưu 4 PostgreSQL databases (HN, DN, HCM, Central)...`);
      const postgresSummary = await this.backupAllPostgres({ sessionId });
      console.log(`   + PostgreSQL: ${postgresSummary.status} (${postgresSummary.successCount}/${postgresSummary.total}) trong ${postgresSummary.durationMs}ms`);

      // 3. Chạy backup MongoDB warehouse_events
      console.log(`📦 [BACKUP] 2/2: Đang sao lưu MongoDB Event Store (warehouse_events)...`);
      const mongoResult = await this.backupMongo(options?.mongoTarget, { sessionId });
      console.log(`   + MongoDB: ${mongoResult.success ? 'SUCCESS' : 'FAILED'} (Validated=${mongoResult.validated}, Size=${mongoResult.fileSizeFormatted}) trong ${mongoResult.durationMs}ms`);

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTimeMs;

      // 4. Tính toán trạng thái tổng hợp (Total 5 DBs: 4 Postgres + 1 Mongo)
      const totalDatabases = 5;
      const totalSuccess = postgresSummary.successCount + (mongoResult.success ? 1 : 0);
      let sessionStatus: 'ALL_SUCCESS' | 'PARTIAL_SUCCESS' | 'ALL_FAILED';

      if (totalSuccess === totalDatabases) {
        sessionStatus = 'ALL_SUCCESS';
      } else if (totalSuccess > 0) {
        sessionStatus = 'PARTIAL_SUCCESS';
      } else {
        sessionStatus = 'ALL_FAILED';
      }

      console.log(`================================================================================`);
      console.log(`🏁 [BACKUP SESSION FINISHED] ID: ${sessionId} | Status: ${sessionStatus} (${totalSuccess}/${totalDatabases}) | Thời gian: ${durationMs}ms`);
      console.log(`================================================================================\n`);

      return {
        sessionId,
        triggerType,
        startedAt,
        completedAt,
        durationMs,
        status: sessionStatus,
        postgresSummary,
        mongoResult,
      };
    } catch (unexpectedErr: any) {
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTimeMs;
      console.error(`❌ [BACKUP SESSION ${sessionId}] Ngoại lệ bất ngờ:`, sanitizeError(unexpectedErr.message));
      return {
        sessionId,
        triggerType,
        startedAt,
        completedAt,
        durationMs,
        status: 'ALL_FAILED',
        message: sanitizeError(unexpectedErr.message),
      };
    } finally {
      // 5. Luôn luôn giải phóng lock trong mọi tình huống (kể cả exception)
      this.releaseLock();
    }
  }
}

// Helper thực thi child process an toàn
export function runProcess(
  command: string,
  args: string[],
  options?: { timeout?: number; env?: NodeJS.ProcessEnv }
): Promise<{ code: number | null; stdout: string; stderr: string; error?: Error }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, {
      windowsHide: true,
      timeout: options?.timeout || 60000,
      env: options?.env || process.env,
    });
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => {
      resolve({ code: -1, stdout, stderr, error: err });
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

export const backupService = new BackupService();
