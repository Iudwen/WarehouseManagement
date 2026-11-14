/**
 * backupController.ts
 * Controller điều khiển các tác vụ Sao lưu & Phục hồi (Phase 5 - Task 5.7)
 * Cung cấp API cho trang Quản trị Backup & Recovery trên Frontend
 */

import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  backupService,
  getBackupHistory,
  BackupMetadataRecord,
} from '../services/backupService';
import { backupScheduler } from '../services/backupScheduler';
import {
  restoreService,
  PROTECTED_POSTGRES_DBS,
  PROTECTED_MONGO_DBS,
  isValidDatabaseName,
} from '../services/restoreService';

/**
 * 1. Lấy lịch sử backup, số liệu tổng quan (Stats) và trạng thái Scheduler
 * GET /api/v1/backup/history
 */
export const getBackupHistoryController = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const history: BackupMetadataRecord[] = getBackupHistory();
    // Đảo ngược mảng để bản ghi mới nhất hiển thị lên đầu
    const sortedHistory = [...history].reverse();

    const total = history.length;
    const successCount = history.filter((r) => r.status === 'SUCCESS').length;
    const failedCount = history.filter((r) => r.status === 'FAILED').length;
    const replicaSuccessCount = history.filter((r) => r.replicaStatus === 'SUCCESS').length;
    const lastBackupTime = history.length > 0 ? history[history.length - 1].createdAt : null;

    const schedulerStatus = backupScheduler.getStatus();

    res.json({
      success: true,
      stats: {
        total,
        successCount,
        failedCount,
        replicaSuccessCount,
        lastBackupTime,
      },
      scheduler: schedulerStatus,
      history: sortedHistory,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Lỗi khi tải lịch sử sao lưu',
    });
  }
};

/**
 * 2. Thực hiện sao lưu toàn diện hệ thống (4 PostgreSQL + 1 MongoDB)
 * POST /api/v1/backup/all
 */
export const runFullBackupController = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const result = await backupService.runFullBackup('MANUAL');
    const isSuccess = result.status === 'ALL_SUCCESS' || result.status === 'PARTIAL_SUCCESS';

    res.json({
      success: isSuccess,
      data: result,
      message:
        result.status === 'ALL_SUCCESS'
          ? 'Sao lưu toàn diện 5/5 cơ sở dữ liệu thành công'
          : result.status === 'PARTIAL_SUCCESS'
          ? 'Sao lưu hoàn tất một phần (có database gặp lỗi, xem chi tiết)'
          : result.message || 'Phiên sao lưu thất bại',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Lỗi bất ngờ khi thực thi sao lưu toàn diện',
    });
  }
};

/**
 * 3. Thực hiện sao lưu PostgreSQL theo Node (HN, DN, HCM, Central)
 * POST /api/v1/backup/postgres
 */
export const backupPostgresController = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { nodeId } = req.body;
    if (!nodeId || !['HN', 'DN', 'HCM', 'CENTRAL'].includes(nodeId)) {
      res.status(400).json({
        success: false,
        message: 'Node ID không hợp lệ. Chỉ chấp nhận: HN, DN, HCM, CENTRAL',
      });
      return;
    }

    const result = await backupService.backupPostgres(nodeId);
    res.json({
      success: result.success,
      data: result,
      message: result.success
        ? `Sao lưu thành công database ${result.database} (${nodeId})`
        : `Sao lưu thất bại: ${result.errorMessage}`,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Lỗi khi thực thi sao lưu PostgreSQL',
    });
  }
};

/**
 * 4. Thực hiện sao lưu MongoDB (warehouse_events)
 * POST /api/v1/backup/mongodb
 */
export const backupMongoController = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const result = await backupService.backupMongo();
    res.json({
      success: result.success,
      data: result,
      message: result.success
        ? `Sao lưu thành công MongoDB Event Store (${result.database})`
        : `Sao lưu thất bại: ${result.errorMessage}`,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Lỗi khi thực thi sao lưu MongoDB',
    });
  }
};

/**
 * 5. Khôi phục cơ sở dữ liệu PostgreSQL từ tệp dump
 * POST /api/v1/backup/restore/postgres
 */
export const restorePostgresController = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { backupFilePath, targetDatabase, targetNodeId = 'HN', createDbIfNotExists = false } = req.body;

    if (!backupFilePath || typeof backupFilePath !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Đường dẫn tệp backup (backupFilePath) không được để trống',
      });
      return;
    }

    if (!targetDatabase || !isValidDatabaseName(targetDatabase)) {
      res.status(400).json({
        success: false,
        message: `Tên database đích không hợp lệ: '${targetDatabase}'. Chỉ cho phép chữ cái, số và dấu gạch dưới (2-63 ký tự).`,
      });
      return;
    }

    // Bảo vệ production tuyệt đối
    if (PROTECTED_POSTGRES_DBS.includes(targetDatabase)) {
      res.status(403).json({
        success: false,
        message: `Từ chối an toàn: Tuyệt đối không cho phép restore trực tiếp đè lên database production '${targetDatabase}'. Vui lòng khôi phục vào database tạm (staging/test).`,
      });
      return;
    }

    const result = await restoreService.restorePostgres({
      backupFilePath,
      targetDatabase,
      targetNodeId,
      createDbIfNotExists: Boolean(createDbIfNotExists),
      allowProductionOverwrite: false,
      allowExistingDataOverwrite: false,
    });

    if (result.success) {
      res.json({
        success: true,
        data: result,
        message: `Khôi phục thành công ${result.tablesRestoredCount} bảng vào database '${targetDatabase}'`,
      });
    } else {
      res.status(400).json({
        success: false,
        data: result,
        message: result.errorMessage || 'Khôi phục PostgreSQL thất bại',
      });
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Lỗi bất ngờ khi phục hồi PostgreSQL',
    });
  }
};

/**
 * 6. Khôi phục cơ sở dữ liệu MongoDB từ tệp archive.gz
 * POST /api/v1/backup/restore/mongodb
 */
export const restoreMongoController = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { backupFilePath, targetDatabase } = req.body;

    if (!backupFilePath || typeof backupFilePath !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Đường dẫn tệp backup (backupFilePath) không được để trống',
      });
      return;
    }

    if (!targetDatabase || !isValidDatabaseName(targetDatabase)) {
      res.status(400).json({
        success: false,
        message: `Tên database MongoDB đích không hợp lệ: '${targetDatabase}'. Chỉ cho phép chữ cái, số và dấu gạch dưới (2-63 ký tự).`,
      });
      return;
    }

    // Bảo vệ production tuyệt đối
    if (PROTECTED_MONGO_DBS.includes(targetDatabase)) {
      res.status(403).json({
        success: false,
        message: `Từ chối an toàn: Tuyệt đối không cho phép restore trực tiếp đè lên database production '${targetDatabase}'. Vui lòng khôi phục vào database test/staging.`,
      });
      return;
    }

    const result = await restoreService.restoreMongo({
      backupFilePath,
      targetDatabase,
      allowProductionOverwrite: false,
      allowExistingDataOverwrite: false,
    });

    if (result.success) {
      res.json({
        success: true,
        data: result,
        message: `Khôi phục thành công ${result.collectionsRestoredCount} collections (${result.documentsRestoredCount} docs) vào database '${targetDatabase}'`,
      });
    } else {
      res.status(400).json({
        success: false,
        data: result,
        message: result.errorMessage || 'Khôi phục MongoDB thất bại',
      });
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Lỗi bất ngờ khi phục hồi MongoDB',
    });
  }
};
