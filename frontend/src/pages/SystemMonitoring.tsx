import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import type { SystemHealthData, NodeStatusData, SystemMetricsData } from '../types';
import {
  Activity,
  Server,
  Database,
  AlertTriangle,
  RefreshCw,
  Clock,
  Layers,
  Radio,
  Lock,
} from 'lucide-react';

const REFRESH_INTERVAL_SECONDS = 12;

export default function SystemMonitoring() {
  const { user } = useAuth();
  const isAdmin = user?.vai_tro === 'ADMIN';

  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [nodes, setNodes] = useState<NodeStatusData[]>([]);
  const [metrics, setMetrics] = useState<SystemMetricsData | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number>(REFRESH_INTERVAL_SECONDS);

  const timerRef = useRef<any>(null);
  const countdownRef = useRef<any>(null);

  const fetchData = useCallback(async (isManual: boolean = false) => {
    if (!isAdmin) return;

    if (isManual) {
      setRefreshing(true);
    }

    try {
      const [resHealth, resNodes, resMetrics] = await Promise.all([
        api.get('/monitoring/health'),
        api.get('/monitoring/nodes'),
        api.get('/monitoring/metrics'),
      ]);

      if (resHealth.data?.success) setHealth(resHealth.data.data);
      if (resNodes.data?.success) setNodes(resNodes.data.data);
      if (resMetrics.data?.success) setMetrics(resMetrics.data.data);

      setErrorMsg(null);
      setLastUpdated(new Date());
      setCountdown(REFRESH_INTERVAL_SECONDS);
    } catch (err: any) {
      console.error('Lỗi khi tải dữ liệu Monitoring:', err);
      const msg = err.response?.data?.message || err.message || 'Lỗi kết nối API Monitoring';
      setErrorMsg(`Cảnh báo: Không thể làm mới dữ liệu (${msg}). Đang giữ dữ liệu đệm gần nhất.`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  // Thiết lập interval tự động cập nhật sau mỗi 12 giây
  useEffect(() => {
    if (!isAdmin) return;

    fetchData();

    // Timer cập nhật dữ liệu
    timerRef.current = setInterval(() => {
      fetchData();
    }, REFRESH_INTERVAL_SECONDS * 1000);

    // Timer đếm lùi hiển thị
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : REFRESH_INTERVAL_SECONDS));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isAdmin, fetchData]);

  // Nếu người dùng không phải ADMIN -> Hiển thị Access Denied (RBAC)
  if (!isAdmin) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-rose-500">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Từ Chối Quyền Truy Cập (403)</h2>
          <p className="text-sm text-slate-400 mb-6">
            Màn hình <strong>Giám Sát Hệ Thống Phân Tán (System Monitoring)</strong> chỉ dành riêng cho tài khoản Quản trị viên (<strong className="text-rose-400">ADMIN</strong>).
          </p>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 text-xs text-slate-300">
            Vai trò hiện tại của bạn: <span className="font-semibold text-amber-400">{user?.vai_tro || 'CHƯA_XÁC_ĐỊNH'}</span>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'ONLINE':
      case 'CONNECTED':
      case 'HEALTHY':
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {status}
          </span>
        );
      case 'DEGRADED':
      case 'IDLE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            {status}
          </span>
        );
      case 'OFFLINE':
      case 'UNHEALTHY':
      case 'ERROR':
      case 'STOPPED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            {status || 'UNKNOWN'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER BẢNG ĐIỀU KHIỂN */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
                  Giám Sát Hệ Thống Phân Tán
                  {health && getStatusBadge(health.status)}
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Theo dõi trạng thái thời gian thực các Node Kho (HN, DN, HCM), Central DC, Databases, Kafka & Outbox
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Countdown Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700/60 text-xs text-slate-300">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Tự cập nhật sau:</span>
              <span className="font-mono font-bold text-blue-400 w-5 text-center">{countdown}s</span>
            </div>

            {/* Manual Refresh Button */}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Đang làm mới...' : 'Làm mới'}</span>
            </button>
          </div>
        </div>

        {/* Timestamp & Alert Banner */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
            <span>Cập nhật gần nhất:</span>
            <strong className="text-slate-200">
              {lastUpdated ? lastUpdated.toLocaleTimeString('vi-VN') : 'Đang tải...'}
            </strong>
            {health?.uptimeSeconds && (
              <span className="text-slate-500">
                (Backend Uptime: {Math.floor(health.uptimeSeconds / 60)} phút)
              </span>
            )}
          </div>
          <div className="text-slate-400 text-[11px] italic">
            * Nguồn trạng thái Node: Suy luận từ kiểm tra kết nối dịch vụ (DB, Relay, Backlog)
          </div>
        </div>

        {/* Warning Error Banner (nếu mất mạng hoặc API lỗi tạm thời) */}
        {errorMsg && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* KHỐI 1: TỔNG QUAN HỆ THỐNG PHÂN TÁN (STAT CARDS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Tổng Số Node</div>
          <div className="text-2xl font-black text-white mt-1.5 flex items-baseline gap-2">
            {health?.nodesSummary.total || 4}
            <span className="text-[11px] text-slate-500 font-normal">nodes</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">3 Kho + 1 Central</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Node Online</div>
          <div className="text-2xl font-black text-emerald-400 mt-1.5 flex items-baseline gap-2">
            {health?.nodesSummary.online ?? (loading ? '-' : 0)}
            <span className="text-[11px] text-slate-500 font-normal">sẵn sàng</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Kết nối ổn định</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">Node Degraded</div>
          <div className="text-2xl font-black text-amber-400 mt-1.5 flex items-baseline gap-2">
            {health?.nodesSummary.degraded ?? (loading ? '-' : 0)}
            <span className="text-[11px] text-slate-500 font-normal">cảnh báo</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Lỗi cục bộ / Outbox</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-medium text-rose-400 uppercase tracking-wider">Node Offline</div>
          <div className="text-2xl font-black text-rose-400 mt-1.5 flex items-baseline gap-2">
            {health?.nodesSummary.offline ?? (loading ? '-' : 0)}
            <span className="text-[11px] text-slate-500 font-normal">mất kết nối</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Cần can thiệp hạ tầng</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Kafka KRaft</div>
          <div className="mt-2">{getStatusBadge(health?.infrastructure.kafkaBroker)}</div>
          <div className="text-[11px] text-slate-400 mt-1.5">
            {metrics?.kafkaMetrics.status === 'ONLINE' ? `${metrics?.kafkaMetrics.topics?.length || 3} topics active` : 'Mất kết nối'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Central DC</div>
          <div className="mt-2">{getStatusBadge(health?.infrastructure.postgresCentral)}</div>
          <div className="text-[11px] text-slate-400 mt-1.5">Postgres + MongoDB</div>
        </div>
      </div>

      {/* KHỐI 2: CHI TIẾT CÁC NODE PHÂN TÁN (DISTRIBUTED NODES) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">Danh Sách Các Node Phân Tán</h2>
          </div>
          <span className="text-xs text-slate-400">Thời gian phản hồi (Latency) đo trực tiếp qua Connection Pool</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {nodes.map((node) => {
            const isOnline = node.status === 'ONLINE';
            const isDegraded = node.status === 'DEGRADED';
            const borderColor = isOnline
              ? 'border-emerald-500/30'
              : isDegraded
              ? 'border-amber-500/40'
              : 'border-rose-500/40';

            return (
              <div
                key={node.nodeId}
                className={`bg-slate-800/60 border ${borderColor} rounded-xl p-4 flex flex-col justify-between transition-all hover:bg-slate-800/90 shadow-sm`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-1.5">
                        {node.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        Node ID: <span className="text-blue-400">{node.nodeId}</span> | {node.postgres.database}
                      </div>
                    </div>
                    {getStatusBadge(node.status)}
                  </div>

                  <div className="mt-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-slate-700/50">
                      <span className="text-slate-400">PostgreSQL Status:</span>
                      <span className={node.postgres.status === 'CONNECTED' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {node.postgres.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-slate-700/50">
                      <span className="text-slate-400">Độ trễ (Latency):</span>
                      <span className="font-mono text-slate-200">
                        {node.latencyMs > 0 ? `${node.latencyMs} ms` : '-'}
                      </span>
                    </div>

                    {node.outbox && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-700/50">
                        <span className="text-slate-400">Outbox Backlog:</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-blue-400" title="Pending">{node.outbox.pending} P</span>
                          <span className="text-rose-400 font-bold" title="Failed">{node.outbox.failed} F</span>
                        </div>
                      </div>
                    )}

                    {node.details?.mongodb && (
                      <div className="flex items-center justify-between py-1 border-b border-slate-700/50">
                        <span className="text-slate-400">MongoDB Event Logs:</span>
                        <span className={node.details.mongodb.status === 'ONLINE' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                          {node.details.mongodb.status} ({node.details.mongodb.latencyMs}ms)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-700/40">
                  <div className="text-[11px] text-slate-400 truncate" title={node.statusText}>
                    {node.statusText}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KHỐI 3: HẠ TẦNG HỆ THỐNG & OUTBOX PIPELINE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BẢNG HẠ TẦNG DỊCH VỤ */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <Database className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">Kiểm Tra Dịch Vụ Hạ Tầng</h2>
          </div>

          <div className="space-y-2.5">
            {/* PostgreSQL Databases */}
            <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">PostgreSQL HN (Cổng 5433)</div>
                  <div className="text-[11px] text-slate-400 font-mono">warehouse_hn</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-400">
                  {metrics?.databaseMetrics.HN?.latencyMs ? `${metrics.databaseMetrics.HN.latencyMs}ms` : ''}
                </span>
                {getStatusBadge(health?.infrastructure.postgresHN)}
              </div>
            </div>

            <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">PostgreSQL DN (Cổng 5434)</div>
                  <div className="text-[11px] text-slate-400 font-mono">warehouse_dn</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-400">
                  {metrics?.databaseMetrics.DN?.latencyMs ? `${metrics.databaseMetrics.DN.latencyMs}ms` : ''}
                </span>
                {getStatusBadge(health?.infrastructure.postgresDN)}
              </div>
            </div>

            <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">PostgreSQL HCM (Cổng 5435)</div>
                  <div className="text-[11px] text-slate-400 font-mono">warehouse_hcm</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-400">
                  {metrics?.databaseMetrics.HCM?.latencyMs ? `${metrics.databaseMetrics.HCM.latencyMs}ms` : ''}
                </span>
                {getStatusBadge(health?.infrastructure.postgresHCM)}
              </div>
            </div>

            <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">PostgreSQL Central (Cổng 5436)</div>
                  <div className="text-[11px] text-slate-400 font-mono">warehouse_central</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-400">
                  {metrics?.databaseMetrics.CENTRAL?.latencyMs ? `${metrics.databaseMetrics.CENTRAL.latencyMs}ms` : ''}
                </span>
                {getStatusBadge(health?.infrastructure.postgresCentral)}
              </div>
            </div>

            {/* MongoDB */}
            <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">MongoDB Event Logs (Cổng 27018)</div>
                  <div className="text-[11px] text-slate-400 font-mono">warehouse_events</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-400">
                  {metrics?.mongoMetrics?.latencyMs ? `${metrics.mongoMetrics.latencyMs}ms` : ''}
                </span>
                {getStatusBadge(health?.infrastructure.mongoDb)}
              </div>
            </div>

            {/* Kafka */}
            <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Radio className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-white">Apache Kafka KRaft Broker (Cổng 9094)</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Cluster ID: {metrics?.kafkaMetrics.clusterId || 'kraft-cluster'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-slate-400">
                  {metrics?.kafkaMetrics?.latencyMs ? `${metrics.kafkaMetrics.latencyMs}ms` : ''}
                </span>
                {getStatusBadge(health?.infrastructure.kafkaBroker)}
              </div>
            </div>
          </div>
        </div>

        {/* OUTBOX MONITORING PIPELINE */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white">Giám Sát Hàng Đợi Outbox & Worker</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Worker Status:</span>
                {getStatusBadge(health?.infrastructure.outboxWorker)}
              </div>
            </div>

            {/* Thẻ thống kê 4 trạng thái Outbox */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-center">
                <div className="text-[11px] font-semibold text-blue-400 uppercase">PENDING</div>
                <div className="text-xl font-black text-white mt-1">
                  {metrics?.outboxBacklogMetrics.totalPending ?? 0}
                </div>
                <div className="text-[10px] text-slate-400">Chờ relay</div>
              </div>

              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-center">
                <div className="text-[11px] font-semibold text-purple-400 uppercase">PROCESSING</div>
                <div className="text-xl font-black text-white mt-1">
                  {metrics?.outboxBacklogMetrics.totalProcessing ?? 0}
                </div>
                <div className="text-[10px] text-slate-400">Đang xử lý</div>
              </div>

              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-center">
                <div className="text-[11px] font-semibold text-rose-400 uppercase">FAILED</div>
                <div className="text-xl font-black text-rose-400 mt-1">
                  {metrics?.outboxBacklogMetrics.totalFailed ?? 0}
                </div>
                <div className="text-[10px] text-slate-400">Cần xử lý</div>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
                <div className="text-[11px] font-semibold text-emerald-400 uppercase">PROCESSED</div>
                <div className="text-xl font-black text-white mt-1">
                  {metrics?.outboxBacklogMetrics.totalProcessed ?? 0}
                </div>
                <div className="text-[10px] text-slate-400">Đã hoàn thành</div>
              </div>
            </div>

            {/* Chi tiết Backlog theo từng Kho */}
            <div className="space-y-2 text-xs">
              <div className="text-slate-400 font-medium mb-1">Phân bố Outbox theo chi nhánh:</div>
              {metrics?.outboxBacklogMetrics?.nodes &&
                Object.entries(metrics.outboxBacklogMetrics.nodes).map(([nodeKey, nodeData]) => (
                  <div
                    key={nodeKey}
                    className="p-2.5 bg-slate-800/40 border border-slate-700/40 rounded-xl flex items-center justify-between"
                  >
                    <span className="font-semibold text-slate-200">Chi nhánh {nodeKey}:</span>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="text-blue-400">{nodeData.pending} Pending</span>
                      <span className="text-slate-500">|</span>
                      <span className={nodeData.failed > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                        {nodeData.failed} Failed
                      </span>
                      <span className="text-slate-500">|</span>
                      <span className="text-emerald-400">{nodeData.processed} Processed</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-800/30 rounded-xl border border-slate-700/30 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Kafka Business Topics:</span>
            <span className="font-mono text-slate-300">
              {metrics?.kafkaMetrics.hasBusinessTopics ? '3/3 Topics Khởi Tạo Đầy Đủ' : 'Chưa đủ topics'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

