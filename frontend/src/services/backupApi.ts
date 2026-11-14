/**
 * backupApi.ts
 * API Client phục vụ màn hình Quản trị Sao lưu & Phục hồi dữ liệu
 */

import api from './api';
import type {
  BackupHistoryResponse,
  RestorePostgresPayload,
  RestoreMongoPayload,
  RestoreResultData,
} from '../types';

export const backupApi = {
  /**
   * Lấy lịch sử sao lưu, số liệu tổng quan và cấu hình scheduler
   */
  getHistory: async (): Promise<BackupHistoryResponse> => {
    const res = await api.get('/backup/history');
    return res.data;
  },

  /**
   * Thực hiện sao lưu toàn diện 5 cơ sở dữ liệu (4 Postgres + 1 Mongo)
   */
  runFullBackup: async () => {
    const res = await api.post('/backup/all');
    return res.data;
  },

  /**
   * Sao lưu PostgreSQL theo Node chỉ định
   */
  backupPostgres: async (nodeId: 'HN' | 'DN' | 'HCM' | 'CENTRAL') => {
    const res = await api.post('/backup/postgres', { nodeId });
    return res.data;
  },

  /**
   * Sao lưu MongoDB Event Store
   */
  backupMongo: async () => {
    const res = await api.post('/backup/mongodb');
    return res.data;
  },

  /**
   * Phục hồi cơ sở dữ liệu PostgreSQL vào database đích an toàn
   */
  restorePostgres: async (payload: RestorePostgresPayload): Promise<{ success: boolean; data: RestoreResultData; message?: string }> => {
    const res = await api.post('/backup/restore/postgres', payload);
    return res.data;
  },

  /**
   * Phục hồi cơ sở dữ liệu MongoDB vào database đích an toàn
   */
  restoreMongo: async (payload: RestoreMongoPayload): Promise<{ success: boolean; data: RestoreResultData; message?: string }> => {
    const res = await api.post('/backup/restore/mongodb', payload);
    return res.data;
  },
};

export default backupApi;
