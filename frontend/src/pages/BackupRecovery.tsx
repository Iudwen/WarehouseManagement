/**
 * BackupRecovery.tsx
 * Màn hình Quản trị Sao lưu & Phục hồi Dữ liệu (Phase 5 - Task 5.7)
 * Dành riêng cho Quản trị viên (ADMIN)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import backupApi from '../services/backupApi';
import type {
  BackupRecord,
  BackupStats,
  BackupSchedulerStatus,
} from '../types';
import {
  Database,
  HardDrive,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Calendar,
  Lock,
  RotateCcw,
  Copy,
  Check,
  Search,
  Filter,
  Eye,
  X,
  ShieldCheck,
  Server,
  Layers,
} from 'lucide-react';

const PROTECTED_DATABASES = [
  'warehouse_hn',
  'warehouse_dn',
  'warehouse_hcm',
  'warehouse_central',
  'warehouse_events',
  'postgres',
  'admin',
  'config',
  'local',
];

export default function BackupRecovery() {
  const { user } = useAuth();
  const isAdmin = user?.vai_tro === 'ADMIN';

  // State dữ liệu
  const [history, setHistory] = useState<BackupRecord[]>([]);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [scheduler, setScheduler] = useState<BackupSchedulerStatus | null>(null);

  // State giao diện
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  // Bộ lọc
  const [filterNode, setFilterNode] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal Chi tiết & Modal Restore
  const [selectedRecord, setSelectedRecord] = useState<BackupRecord | null>(null);
  const [restoreModalRecord, setRestoreModalRecord] = useState<BackupRecord | null>(null);

  // Form Restore
  const [targetDatabase, setTargetDatabase] = useState('');
  const [targetNodeId, setTargetNodeId] = useState<'HN' | 'DN' | 'HCM' | 'CENTRAL'>('HN');
  const [createDbIfNotExists, setCreateDbIfNotExists] = useState(true);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ success: boolean; message: string } | null>(null);

  // State copy clipboard
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Tải dữ liệu từ backend
  const fetchBackupData = useCallback(async (isManual: boolean = false) => {
    if (!isAdmin) return;
    if (isManual) setRefreshing(true);

    try {
      const res = await backupApi.getHistory();
      if (res.success) {
        setHistory(res.history || []);
        setStats(res.stats || null);
        setScheduler(res.scheduler || null);
      }
    } catch (err: any) {
      console.error('Lỗi khi tải lịch sử sao lưu:', err);
      setActionMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Không thể kết nối đến API Sao lưu & Phục hồi',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchBackupData();
  }, [fetchBackupData]);

  // Sao chép mã băm SHA-256
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 1. Sao lưu toàn diện (Full Backup)
  const handleRunFullBackup = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await backupApi.runFullBackup();
      if (res.success) {
        setActionMessage({
          type: res.data?.status === 'ALL_SUCCESS' ? 'success' : 'warning',
          text: res.message || 'Đã hoàn tất phiên sao lưu toàn diện 5 database!',
        });
      } else {
        setActionMessage({
          type: 'error',
          text: res.message || 'Sao lưu toàn diện thất bại',
        });
      }
      await fetchBackupData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Lỗi khi kích hoạt sao lưu toàn diện',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Sao lưu PostgreSQL theo Node
  const handleBackupPostgres = async (nodeId: 'HN' | 'DN' | 'HCM' | 'CENTRAL') => {
    if (actionLoading) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await backupApi.backupPostgres(nodeId);
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: res.message || `Sao lưu thành công Node ${nodeId}!`,
        });
      } else {
        setActionMessage({
          type: 'error',
          text: res.message || `Sao lưu Node ${nodeId} thất bại`,
        });
      }
      await fetchBackupData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || `Lỗi khi sao lưu Node ${nodeId}`,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Sao lưu MongoDB
  const handleBackupMongo = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await backupApi.backupMongo();
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: res.message || 'Sao lưu thành công MongoDB Event Store!',
        });
      } else {
        setActionMessage({
          type: 'error',
          text: res.message || 'Sao lưu MongoDB thất bại',
        });
      }
      await fetchBackupData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Lỗi khi sao lưu MongoDB',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Mở hộp thoại Restore
  const handleOpenRestoreModal = (record: BackupRecord) => {
    setRestoreModalRecord(record);
    // Gợi ý tên database tạm an toàn
    const defaultSuggestName =
      record.backupType === 'POSTGRES'
        ? `${record.database}_test_restore`
        : 'warehouse_events_test_restore';
    setTargetDatabase(defaultSuggestName);
    setTargetNodeId(record.nodeId !== 'MONGO' ? record.nodeId : 'HN');
    setCreateDbIfNotExists(true);
    setRestoreConfirmed(false);
    setRestoreResult(null);
  };

  // Kiểm tra tên database đích có bị xung đột production không
  const isTargetProduction = useMemo(() => {
    const trimmed = targetDatabase.trim().toLowerCase();
    return PROTECTED_DATABASES.includes(trimmed);
  }, [targetDatabase]);

  // Thực hiện Restore
  const handleExecuteRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreModalRecord || !restoreConfirmed || isTargetProduction || restoring) return;

    setRestoring(true);
    setRestoreResult(null);

    try {
      if (restoreModalRecord.backupType === 'POSTGRES') {
        const res = await backupApi.restorePostgres({
          backupFilePath: restoreModalRecord.originalPath,
          targetDatabase: targetDatabase.trim(),
          targetNodeId,
          createDbIfNotExists,
        });

        if (res.success) {
          setRestoreResult({
            success: true,
            message: res.message || `Khôi phục thành công ${res.data?.tablesRestoredCount} bảng vào database '${targetDatabase}'!`,
          });
        } else {
          setRestoreResult({
            success: false,
            message: res.message || 'Khôi phục PostgreSQL thất bại',
          });
        }
      } else {
        const res = await backupApi.restoreMongo({
          backupFilePath: restoreModalRecord.originalPath,
          targetDatabase: targetDatabase.trim(),
        });

        if (res.success) {
          setRestoreResult({
            success: true,
            message: res.message || `Khôi phục thành công ${res.data?.collectionsRestoredCount} collections (${res.data?.documentsRestoredCount} documents) vào '${targetDatabase}'!`,
          });
        } else {
          setRestoreResult({
            success: false,
            message: res.message || 'Khôi phục MongoDB thất bại',
          });
        }
      }
    } catch (err: any) {
      setRestoreResult({
        success: false,
        message: err.response?.data?.message || err.message || 'Lỗi khi thực thi khôi phục',
      });
    } finally {
      setRestoring(false);
    }
  };

  // Lọc dữ liệu danh sách
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      // Lọc theo Node
      if (filterNode !== 'ALL') {
        if (filterNode === 'MONGO' && item.backupType !== 'MONGODB') return false;
        if (filterNode !== 'MONGO' && item.nodeId !== filterNode) return false;
      }
      // Lọc theo Trạng thái
      if (filterStatus !== 'ALL') {
        if (item.status !== filterStatus) return false;
      }
      // Lọc theo Từ khóa tìm kiếm
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchFile = item.fileName.toLowerCase().includes(term);
        const matchDb = item.database.toLowerCase().includes(term);
        const matchHash = item.checksumSHA256.toLowerCase().includes(term);
        if (!matchFile && !matchDb && !matchHash) return false;
      }
      return true;
    });
  }, [history, filterNode, filterStatus, searchTerm]);

  // RBAC: Nếu người dùng không phải ADMIN -> Hiển thị Access Denied
  if (!isAdmin) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-rose-500">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Từ Chối Quyền Truy Cập (403)</h2>
          <p className="text-sm text-slate-400 mb-6">
            Màn hình <strong>Sao Lưu & Phục Hồi Dữ Liệu (Backup & Recovery)</strong> chỉ dành riêng cho tài khoản Quản trị viên (<strong className="text-rose-400">ADMIN</strong>).
          </p>
          <div className="p-3 bg-slate-800/60 rounded-xl text-xs text-slate-400">
            Tài khoản hiện tại: <span className="text-slate-200 font-semibold">{user?.ho_ten || 'Người dùng'}</span> ({user?.vai_tro})
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">
                Quản Trị Sao Lưu & Phục Hồi Dữ Liệu
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Bảo vệ 5 nguồn dữ liệu: 4 PostgreSQL Nodes (HN, DN, HCM, Central) & MongoDB Event Store
              </p>
            </div>
          </div>
        </div>

        {/* Nút hành động thao tác Backup */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Nút Full Backup */}
          <button
            onClick={handleRunFullBackup}
            disabled={actionLoading}
            title="Kích hoạt sao lưu toàn diện cả 5 cơ sở dữ liệu"
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            <span>Sao Lưu Toàn Bộ (5 DB)</span>
          </button>

          {/* Nút Backup MongoDB */}
          <button
            onClick={handleBackupMongo}
            disabled={actionLoading}
            title="Sao lưu MongoDB Event Store (warehouse_events)"
            className="px-3 py-2 bg-slate-800 hover:bg-emerald-600/30 hover:border-emerald-500/50 border border-slate-700 disabled:opacity-50 text-emerald-400 hover:text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Backup Mongo</span>
          </button>

          {/* Nhóm nút Backup PostgreSQL Node */}
          <div className="inline-flex rounded-xl bg-slate-800/80 p-0.5 border border-slate-700">
            {(['HN', 'DN', 'HCM', 'CENTRAL'] as const).map((node) => (
              <button
                key={node}
                onClick={() => handleBackupPostgres(node)}
                disabled={actionLoading}
                title={`Sao lưu PostgreSQL Node ${node}`}
                className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-700/60 disabled:opacity-50 text-[11px] font-semibold rounded-lg transition-all cursor-pointer"
              >
                {node}
              </button>
            ))}
          </div>

          {/* Nút Refresh */}
          <button
            onClick={() => fetchBackupData(true)}
            disabled={refreshing}
            title="Làm mới dữ liệu lịch sử"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Thông báo kết quả hành động */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : actionMessage.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : actionMessage.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Overview Stats Cards (Section 3.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Tổng số bản backup */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Tổng Số Bản Backup</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-white tracking-tight">
              {loading ? '...' : stats?.total ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">D:\backups lưu trữ an toàn</div>
          </div>
        </div>

        {/* Card 2: Thành công / Thất bại */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Trạng Thái Backup</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <div className="text-2xl font-black text-emerald-400">
              {loading ? '...' : stats?.successCount ?? 0}
            </div>
            <span className="text-xs text-slate-400">/</span>
            <div className="text-sm font-semibold text-rose-400">
              {loading ? '...' : stats?.failedCount ?? 0} lỗi
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Được kiểm tra toàn vẹn</div>
        </div>

        {/* Card 3: Local Replica */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Local Replica (Ổ C:)</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-purple-400 tracking-tight">
              {loading ? '...' : stats?.replicaSuccessCount ?? 0}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Bản sao khớp SHA-256</div>
          </div>
        </div>

        {/* Card 4: Lần backup gần nhất */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Sao Lưu Gần Nhất</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-sm font-bold text-white truncate" title={stats?.lastBackupTime || ''}>
              {loading ? '...' : stats?.lastBackupTime ? new Date(stats.lastBackupTime).toLocaleTimeString('vi-VN') : 'Chưa có'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {stats?.lastBackupTime ? new Date(stats.lastBackupTime).toLocaleDateString('vi-VN') : '---'}
            </div>
          </div>
        </div>

        {/* Card 5: Lịch Scheduler */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Lập Lịch Tự Động</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-sm font-bold text-cyan-400">
              {scheduler?.config.scheduleTime || '02:00'} (Mỗi ngày)
            </div>
            <div className="text-[11px] text-slate-400 mt-1 truncate" title={scheduler?.nextScheduledTime || ''}>
              Tiếp: {scheduler?.nextScheduledTime ? scheduler.nextScheduledTime.split(' ')[0] : 'Đang hẹn giờ'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Bảng Lịch sử Backup (Section 3.2) */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Thanh công cụ tìm kiếm và lọc */}
        <div className="p-4 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-slate-800 text-slate-300 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white tracking-wide">
              Lịch Sử Sao Lưu Chi Tiết ({filteredHistory.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Ô tìm kiếm */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm file, database, SHA-256..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-800/90 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 w-48 lg:w-60"
              />
            </div>

            {/* Lọc theo Node */}
            <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs text-slate-300">
              <Filter className="w-3 h-3 text-slate-400" />
              <select
                value={filterNode}
                onChange={(e) => setFilterNode(e.target.value)}
                className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-800">Tất cả nguồn</option>
                <option value="HN" className="bg-slate-800">Kho Hà Nội (HN)</option>
                <option value="DN" className="bg-slate-800">Kho Đà Nẵng (DN)</option>
                <option value="HCM" className="bg-slate-800">Kho TP.HCM (HCM)</option>
                <option value="CENTRAL" className="bg-slate-800">Central DC</option>
                <option value="MONGO" className="bg-slate-800">MongoDB Events</option>
              </select>
            </div>

            {/* Lọc theo Trạng thái */}
            <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs text-slate-300">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
              >
                <option value="ALL" className="bg-slate-800">Tất cả trạng thái</option>
                <option value="SUCCESS" className="bg-slate-800">Thành công (SUCCESS)</option>
                <option value="FAILED" className="bg-slate-800">Thất bại (FAILED)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bảng danh sách */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/40 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Thời Gian</th>
                <th className="py-3 px-3">Loại DB</th>
                <th className="py-3 px-3">Database / Node</th>
                <th className="py-3 px-4">Tên File</th>
                <th className="py-3 px-3 text-right">Dung Lượng</th>
                <th className="py-3 px-3 text-center">Trạng Thái</th>
                <th className="py-3 px-3 text-center">Kiểm Tra</th>
                <th className="py-3 px-3">SHA-256</th>
                <th className="py-3 px-3 text-center">Bản Sao C:</th>
                <th className="py-3 px-4 text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                    Đang tải lịch sử sao lưu...
                  </td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Database className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    Không tìm thấy bản ghi sao lưu nào phù hợp
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.backupId} className="hover:bg-slate-800/30 transition-colors">
                    {/* Thời gian */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                      {new Date(item.createdAt).toLocaleString('vi-VN')}
                    </td>

                    {/* Loại DB */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.backupType === 'POSTGRES'
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {item.backupType}
                      </span>
                    </td>

                    {/* Database / Node */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-semibold text-white">{item.database}</div>
                      <div className="text-[10px] text-slate-400">
                        {item.nodeId === 'MONGO' ? 'Event Store' : `Node ${item.nodeId}`}
                      </div>
                    </td>

                    {/* Tên file */}
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-300 max-w-[220px] truncate" title={item.fileName}>
                      {item.fileName}
                    </td>

                    {/* Dung lượng */}
                    <td className="py-3 px-3 whitespace-nowrap text-right font-mono text-slate-300">
                      {item.sizeFormatted}
                    </td>

                    {/* Trạng thái Backup */}
                    <td className="py-3 px-3 whitespace-nowrap text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          item.status === 'SUCCESS'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {item.status === 'SUCCESS' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {item.status}
                      </span>
                    </td>

                    {/* Validation */}
                    <td className="py-3 px-3 whitespace-nowrap text-center">
                      {item.validated ? (
                        <span className="text-emerald-400 text-[10px] font-semibold" title={`TOC / Collections: ${item.tocOrCollectionsCount ?? 'N/A'}`}>
                          Hợp lệ ({item.tocOrCollectionsCount})
                        </span>
                      ) : (
                        <span className="text-rose-400 text-[10px] font-semibold">
                          Chưa đạt
                        </span>
                      )}
                    </td>

                    {/* SHA-256 */}
                    <td className="py-3 px-3 whitespace-nowrap font-mono text-[10px] text-slate-400">
                      {item.checksumSHA256 ? (
                        <div className="flex items-center gap-1.5">
                          <span>{item.checksumSHA256.substring(0, 10)}...</span>
                          <button
                            onClick={() => handleCopy(item.checksumSHA256, item.backupId)}
                            title="Sao chép toàn bộ mã băm SHA-256"
                            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition-colors cursor-pointer"
                          >
                            {copiedId === item.backupId ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        '---'
                      )}
                    </td>

                    {/* Local Replica */}
                    <td className="py-3 px-3 whitespace-nowrap text-center">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          item.replicaStatus === 'SUCCESS'
                            ? 'bg-purple-500/15 text-purple-300'
                            : item.replicaStatus === 'FAILED'
                            ? 'bg-rose-500/15 text-rose-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.replicaStatus}
                      </span>
                    </td>

                    {/* Thao tác */}
                    <td className="py-3 px-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Nút Xem Chi tiết */}
                        <button
                          onClick={() => setSelectedRecord(item)}
                          title="Xem chi tiết metadata của bản backup"
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Nút Phục Hồi (Chỉ hiện khi backup SUCCESS & validated) */}
                        {item.status === 'SUCCESS' && item.validated && (
                          <button
                            onClick={() => handleOpenRestoreModal(item)}
                            title="Khôi phục vào database đích an toàn"
                            className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Phục hồi</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Modal Xem Chi Tiết Metadata */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Chi Tiết Bản Sao Lưu</h3>
                  <p className="text-xs text-slate-400">ID: {selectedRecord.backupId}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-800/40 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block">Database / Nguồn:</span>
                  <span className="font-semibold text-white">{selectedRecord.database} ({selectedRecord.nodeId})</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Loại cơ sở dữ liệu:</span>
                  <span className="font-semibold text-blue-400">{selectedRecord.backupType}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Thời gian sao lưu:</span>
                  <span className="font-mono text-slate-200">{new Date(selectedRecord.createdAt).toLocaleString('vi-VN')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Thời gian thực thi:</span>
                  <span className="font-mono text-slate-200">{selectedRecord.durationMs} ms</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Dung lượng:</span>
                  <span className="font-mono text-slate-200">{selectedRecord.sizeFormatted} ({selectedRecord.sizeBytes} bytes)</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Phiên (Session ID):</span>
                  <span className="font-mono text-slate-300">{selectedRecord.sessionId || 'Độc lập (Single)'}</span>
                </div>
              </div>

              {/* Đường dẫn tệp */}
              <div className="space-y-1.5">
                <span className="text-slate-400 block">Đường dẫn tệp gốc (Ổ D:):</span>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 break-all select-all">
                  {selectedRecord.originalPath}
                </div>
              </div>

              {/* Bản sao C: */}
              {selectedRecord.replicaPath && (
                <div className="space-y-1.5">
                  <span className="text-slate-400 block">Đường dẫn bản sao độc lập (Ổ C:):</span>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-purple-300 break-all select-all">
                    {selectedRecord.replicaPath}
                  </div>
                </div>
              )}

              {/* Checksum SHA-256 */}
              <div className="space-y-1.5">
                <span className="text-slate-400 block">Mã băm toàn vẹn SHA-256:</span>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-emerald-400 break-all select-all flex items-center justify-between">
                  <span>{selectedRecord.checksumSHA256}</span>
                  <button
                    onClick={() => handleCopy(selectedRecord.checksumSHA256, 'modal_sha')}
                    className="p-1 hover:text-white rounded hover:bg-slate-800 cursor-pointer ml-2"
                  >
                    {copiedId === 'modal_sha' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Thông báo lỗi nếu có */}
              {selectedRecord.errorMessage && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300">
                  <strong className="block mb-1">Chi tiết lỗi:</strong>
                  <p className="font-mono text-[11px]">{selectedRecord.errorMessage}</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal Phục Hồi Dữ Liệu An Toàn (Section 3.4) */}
      {restoreModalRecord && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Khôi Phục Dữ Liệu An Toàn</h3>
                  <p className="text-xs text-slate-400">Nguồn: {restoreModalRecord.fileName}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!restoring) setRestoreModalRecord(null);
                }}
                disabled={restoring}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cảnh báo bảo vệ Production */}
            <div className="mt-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-amber-300 font-bold mb-0.5">Hệ thống bảo vệ Production nghiêm ngặt:</strong>
                Tuyệt đối không khôi phục đè lên các database nghiệp vụ đang chạy (<code className="text-amber-100 font-mono">warehouse_hn, dn, hcm, central, warehouse_events</code>). Vui lòng nhập tên database đích thử nghiệm.
              </div>
            </div>

            <form onSubmit={handleExecuteRestore} className="mt-4 space-y-4 text-xs">
              {/* Thông tin nguồn */}
              <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Loại cơ sở dữ liệu:</span>
                  <span className="font-semibold text-blue-400">{restoreModalRecord.backupType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Database nguồn:</span>
                  <span className="font-semibold text-white">{restoreModalRecord.database} ({restoreModalRecord.nodeId})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Dung lượng:</span>
                  <span className="font-mono text-slate-300">{restoreModalRecord.sizeFormatted}</span>
                </div>
              </div>

              {/* Tên Database đích */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Tên Database Đích Cần Khôi Phục: <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={targetDatabase}
                  onChange={(e) => setTargetDatabase(e.target.value)}
                  placeholder="Ví dụ: warehouse_hn_test_restore"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                />
                {isTargetProduction && (
                  <p className="mt-1.5 text-xs text-rose-400 font-semibold flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    Cảnh báo: Đây là Database Production! Hệ thống từ chối restore đè lên database này.
                  </p>
                )}
              </div>

              {/* Lựa chọn Node đích (nếu là PostgreSQL) */}
              {restoreModalRecord.backupType === 'POSTGRES' && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Node PostgreSQL Đích:
                  </label>
                  <select
                    value={targetNodeId}
                    onChange={(e) => setTargetNodeId(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="HN">Kho Hà Nội (Cổng 5433)</option>
                    <option value="DN">Kho Đà Nẵng (Cổng 5434)</option>
                    <option value="HCM">Kho TP.HCM (Cổng 5435)</option>
                    <option value="CENTRAL">Trung Tâm Dữ Liệu (Cổng 5436)</option>
                  </select>
                </div>
              )}

              {/* Checkbox tự động tạo database nếu chưa có */}
              {restoreModalRecord.backupType === 'POSTGRES' && (
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createDbIfNotExists}
                    onChange={(e) => setCreateDbIfNotExists(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>Tự động tạo database đích nếu chưa tồn tại trên máy chủ</span>
                </label>
              )}

              {/* Checkbox xác nhận an toàn */}
              <label className="flex items-start gap-2 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  checked={restoreConfirmed}
                  onChange={(e) => setRestoreConfirmed(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0 mt-0.5"
                />
                <span className="text-slate-300 text-[11px] leading-relaxed">
                  Tôi xác nhận muốn khôi phục dữ liệu từ bản sao lưu này vào database đích <strong className="text-white">{targetDatabase || '...'}</strong> và hiểu rằng thao tác không làm ảnh hưởng đến môi trường Production.
                </span>
              </label>

              {/* Kết quả restore */}
              {restoreResult && (
                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                    restoreResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {restoreResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <p className="leading-relaxed">{restoreResult.message}</p>
                </div>
              )}

              {/* Nút hành động */}
              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  disabled={restoring}
                  onClick={() => setRestoreModalRecord(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={!restoreConfirmed || isTargetProduction || !targetDatabase.trim() || restoring}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-600/20 flex items-center gap-2 cursor-pointer"
                >
                  {restoring ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang Phục Hồi...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Bắt Đầu Khôi Phục</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
