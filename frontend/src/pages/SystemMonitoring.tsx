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
  Cpu,
  Network,
  Zap,
} from 'lucide-react';
import {
  PageHeader,
  StatCard,
  StatusBadge,
  HealthBadge,
} from '../components/ui';

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

    timerRef.current = setInterval(() => {
      fetchData();
    }, REFRESH_INTERVAL_SECONDS * 1000);

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
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-xl">
          <div className="w-16 h-16 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center mx-auto mb-4 text-rose-600">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Từ Chối Quyền Truy Cập (403)</h2>
          <p className="text-xs text-slate-600 mb-6 leading-relaxed">
            Màn hình <strong>Giám Sát Hệ Thống Phân Tán (System Monitoring)</strong> chỉ dành riêng cho tài khoản Quản trị viên (<strong className="text-rose-600">ADMIN</strong>).
          </p>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
            Vai trò hiện tại của bạn: <span className="font-bold text-amber-700">{user?.vai_tro || 'CHƯA_XÁC_ĐỊNH'}</span>
          </div>
        </div>
      </div>
    );
  }

  // Tách các node theo mô hình 2 máy vật lý
  const machine1Nodes = nodes.filter((n) => n.nodeId === 'HN' || n.nodeId === 'CENTRAL');
  const machine2Nodes = nodes.filter((n) => n.nodeId === 'DN' || n.nodeId === 'HCM');

  // Helper render latency indicator
  const renderLatencyPill = (latencyMs: number) => {
    if (latencyMs <= 0) return <span className="text-slate-400 font-mono text-xs">—</span>;
    let colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (latencyMs > 50) {
      colorClass = 'text-rose-700 bg-rose-50 border-rose-200';
    } else if (latencyMs > 20) {
      colorClass = 'text-amber-800 bg-amber-50 border-amber-200';
    }
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-xs font-bold border ${colorClass}`}>
        <Zap className="w-3 h-3" />
        {latencyMs} ms
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Page Header */}
      <PageHeader
        title="GIÁM SÁT HỆ THỐNG PHÂN TÁN (DISTRIBUTED OBSERVABILITY)"
        subtitle={`Theo dõi thời gian thực kiến trúc 2 máy vật lý, kết nối Connection Pool, hàng đợi Outbox và Kafka Broker${
          lastUpdated ? ` • Cập nhật lúc: ${lastUpdated.toLocaleTimeString('vi-VN')}` : ''
        }`}
        breadcrumbs={[
          { label: 'WMS', href: '/' },
          { label: 'Hạ Tầng & Quản Trị' },
          { label: 'Giám Sát Hệ Thống' },
        ]}
        badge={
          health ? (
            <HealthBadge status={health.status} pulse />
          ) : (
            <StatusBadge variant="neutral">Đang kết nối...</StatusBadge>
          )
        }
        actions={
          <div className="flex items-center gap-3">
            {/* Auto refresh countdown */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600 font-medium">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>Cập nhật sau:</span>
              <span className="font-mono font-bold text-blue-600 w-5 text-center">{countdown}s</span>
            </div>

            {/* Manual refresh button */}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Đang cập nhật...' : 'Làm mới'}</span>
            </button>
          </div>
        }
      />

      {/* Warning Error Banner */}
      {errorMsg && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 2. Top Distributed Infrastructure StatCards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <StatCard
          title="Tổng Số Node"
          value={health?.nodesSummary.total || 4}
          unit="nodes"
          subtitle="3 Chi nhánh + 1 Central"
          icon={Server}
          variant="default"
        />

        <StatCard
          title="Node Trực Tuyến"
          value={health?.nodesSummary.online ?? (loading ? '-' : 0)}
          unit="sẵn sàng"
          subtitle="Kết nối ổn định"
          icon={Activity}
          variant="success"
        />

        <StatCard
          title="Node Cảnh Báo"
          value={health?.nodesSummary.degraded ?? (loading ? '-' : 0)}
          unit="degraded"
          subtitle="Chậm hoặc nghẽn outbox"
          icon={AlertTriangle}
          variant={health?.nodesSummary.degraded ? 'warning' : 'default'}
        />

        <StatCard
          title="Node Mất Kết Nối"
          value={health?.nodesSummary.offline ?? (loading ? '-' : 0)}
          unit="offline"
          subtitle={health?.nodesSummary.offline ? 'Cần can thiệp hạ tầng' : 'Không có node offline'}
          icon={AlertTriangle}
          variant={health?.nodesSummary.offline ? 'danger' : 'default'}
        />

        <StatCard
          title="Apache Kafka KRaft"
          value={health?.infrastructure.kafkaBroker === 'ONLINE' ? 'ONLINE' : 'OFFLINE'}
          subtitle={metrics?.kafkaMetrics.status === 'ONLINE' ? `${metrics?.kafkaMetrics.topics?.length || 3} topics active` : 'Mất kết nối'}
          icon={Radio}
          variant={health?.infrastructure.kafkaBroker === 'ONLINE' ? 'success' : 'danger'}
        />

        <StatCard
          title="Central DC"
          value={health?.infrastructure.postgresCentral === 'ONLINE' ? 'ONLINE' : 'OFFLINE'}
          subtitle="PostgreSQL + MongoDB"
          icon={Database}
          variant={health?.infrastructure.postgresCentral === 'ONLINE' ? 'primary' : 'danger'}
        />
      </div>

      {/* 3. KHỐI CẤU TRÚC PHÂN TÁN 2 MÁY VẬT LÝ (2-MACHINE TOPOLOGY) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900">
              Kiến Trúc Triển Khai Phân Tán 2 Máy Vật Lý
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Độ trễ đo trực tiếp qua Connection Pool Express → PostgreSQL Node
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CỘT 1: MÁY 1 — MÁY CHỦ CHÍNH (MAIN SERVER) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">MÁY 1 — MÁY CHỦ CHÍNH (MAIN SERVER)</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                      Localhost / Host
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Express Backend, PostgreSQL HN, Central DC, MongoDB, Kafka Broker, Outbox Worker
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {machine1Nodes.map((node) => (
                <div
                  key={node.nodeId}
                  className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3 hover:bg-slate-100/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                        <span>{node.name}</span>
                        <span className="font-mono text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          {node.nodeId}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Database: {node.postgres.database} · Cổng: {node.nodeId === 'HN' ? '5433' : '5436'}
                      </div>
                    </div>
                    <HealthBadge status={node.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60">
                    <div className="flex items-center justify-between py-1 text-slate-600">
                      <span>Độ trễ (Latency):</span>
                      {renderLatencyPill(node.latencyMs)}
                    </div>

                    <div className="flex items-center justify-between py-1 text-slate-600">
                      <span>Trạng thái DB:</span>
                      <span className={node.postgres.status === 'CONNECTED' ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                        {node.postgres.status}
                      </span>
                    </div>

                    {node.outbox && (
                      <div className="col-span-2 flex items-center justify-between py-1 text-slate-600 border-t border-slate-200/40">
                        <span>Hàng đợi Outbox:</span>
                        <div className="flex items-center gap-3 font-mono text-xs">
                          <span className="text-blue-600 font-bold" title="Pending">{node.outbox.pending} Pending</span>
                          <span className="text-slate-300">|</span>
                          <span className={node.outbox.failed > 0 ? 'text-rose-600 font-bold' : 'text-slate-500'} title="Failed">
                            {node.outbox.failed} Failed
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-emerald-600" title="Processed">{node.outbox.processed} Processed</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CỘT 2: MÁY 2 — MÁY CHỦ KHO VÙNG (REGIONAL DATABASE NODES) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">MÁY 2 — KHO VÙNG (REGIONAL NODES)</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                      TCP Mạng LAN
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    PostgreSQL DN (Port 5434), PostgreSQL HCM (Port 5435) kết nối độc lập qua IP
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {machine2Nodes.map((node) => (
                <div
                  key={node.nodeId}
                  className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3 hover:bg-slate-100/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                        <span>{node.name}</span>
                        <span className="font-mono text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                          {node.nodeId}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Database: {node.postgres.database} · Cổng: {node.nodeId === 'DN' ? '5434' : '5435'} (LAN)
                      </div>
                    </div>
                    <HealthBadge status={node.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60">
                    <div className="flex items-center justify-between py-1 text-slate-600">
                      <span>Độ trễ qua LAN:</span>
                      {renderLatencyPill(node.latencyMs)}
                    </div>

                    <div className="flex items-center justify-between py-1 text-slate-600">
                      <span>Trạng thái DB:</span>
                      <span className={node.postgres.status === 'CONNECTED' ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                        {node.postgres.status}
                      </span>
                    </div>

                    {node.outbox && (
                      <div className="col-span-2 flex items-center justify-between py-1 text-slate-600 border-t border-slate-200/40">
                        <span>Hàng đợi Outbox:</span>
                        <div className="flex items-center gap-3 font-mono text-xs">
                          <span className="text-blue-600 font-bold" title="Pending">{node.outbox.pending} Pending</span>
                          <span className="text-slate-300">|</span>
                          <span className={node.outbox.failed > 0 ? 'text-rose-600 font-bold' : 'text-slate-500'} title="Failed">
                            {node.outbox.failed} Failed
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-emerald-600" title="Processed">{node.outbox.processed} Processed</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. KHỐI HẠ TẦNG DỊCH VỤ & HÀNG ĐỢI SỰ KIỆN OUTBOX */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BẢNG HẠ TẦNG DỊCH VỤ (INFRASTRUCTURE CHECKS) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <Database className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">Kiểm Tra Dịch Vụ Hạ Tầng & Cơ Sở Dữ Liệu</h2>
          </div>

          <div className="space-y-2.5">
            {/* Postgres HN */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">PostgreSQL HN (Cổng 5433) [Máy 1]</div>
                  <div className="text-[11px] text-slate-500 font-mono">warehouse_hn</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {metrics?.databaseMetrics.HN?.latencyMs ? renderLatencyPill(metrics.databaseMetrics.HN.latencyMs) : null}
                <HealthBadge status={health?.infrastructure.postgresHN} />
              </div>
            </div>

            {/* Postgres DN */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-indigo-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">PostgreSQL DN (Cổng 5434) [Máy 2]</div>
                  <div className="text-[11px] text-slate-500 font-mono">warehouse_dn</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {metrics?.databaseMetrics.DN?.latencyMs ? renderLatencyPill(metrics.databaseMetrics.DN.latencyMs) : null}
                <HealthBadge status={health?.infrastructure.postgresDN} />
              </div>
            </div>

            {/* Postgres HCM */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-indigo-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">PostgreSQL HCM (Cổng 5435) [Máy 2]</div>
                  <div className="text-[11px] text-slate-500 font-mono">warehouse_hcm</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {metrics?.databaseMetrics.HCM?.latencyMs ? renderLatencyPill(metrics.databaseMetrics.HCM.latencyMs) : null}
                <HealthBadge status={health?.infrastructure.postgresHCM} />
              </div>
            </div>

            {/* Postgres Central */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">PostgreSQL Central (Cổng 5436) [Máy 1]</div>
                  <div className="text-[11px] text-slate-500 font-mono">warehouse_central</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {metrics?.databaseMetrics.CENTRAL?.latencyMs ? renderLatencyPill(metrics.databaseMetrics.CENTRAL.latencyMs) : null}
                <HealthBadge status={health?.infrastructure.postgresCentral} />
              </div>
            </div>

            {/* MongoDB */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">MongoDB Event Store (Cổng 27018) [Máy 1]</div>
                  <div className="text-[11px] text-slate-500 font-mono">warehouse_events</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {metrics?.mongoMetrics?.latencyMs ? renderLatencyPill(metrics.mongoMetrics.latencyMs) : null}
                <HealthBadge status={health?.infrastructure.mongoDb} />
              </div>
            </div>

            {/* Kafka KRaft Broker */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Radio className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">Apache Kafka KRaft Broker (Cổng 9094) [Máy 1]</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Cluster ID: {metrics?.kafkaMetrics.clusterId || 'kraft-cluster'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {metrics?.kafkaMetrics?.latencyMs ? renderLatencyPill(metrics.kafkaMetrics.latencyMs) : null}
                <HealthBadge status={health?.infrastructure.kafkaBroker} />
              </div>
            </div>
          </div>
        </div>

        {/* OUTBOX MONITORING PIPELINE */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-amber-600" />
                <h2 className="text-sm font-bold text-slate-900">Giám Sát Hàng Đợi Sự Kiện Outbox & Worker</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Worker Status:</span>
                <HealthBadge status={health?.infrastructure.outboxWorker} />
              </div>
            </div>

            {/* Thẻ thống kê 4 trạng thái Outbox */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 mb-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
                <div className="text-[10px] font-bold text-blue-700 uppercase">PENDING</div>
                <div className="text-xl font-black text-blue-900 mt-1">
                  {metrics?.outboxBacklogMetrics.totalPending ?? 0}
                </div>
                <div className="text-[10px] text-slate-500">Chờ relay</div>
              </div>

              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-center">
                <div className="text-[10px] font-bold text-purple-700 uppercase">PROCESSING</div>
                <div className="text-xl font-black text-purple-900 mt-1">
                  {metrics?.outboxBacklogMetrics.totalProcessing ?? 0}
                </div>
                <div className="text-[10px] text-slate-500">Đang giữ lease</div>
              </div>

              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-center">
                <div className="text-[10px] font-bold text-rose-700 uppercase">FAILED</div>
                <div className="text-xl font-black text-rose-900 mt-1">
                  {metrics?.outboxBacklogMetrics.totalFailed ?? 0}
                </div>
                <div className="text-[10px] text-slate-500">Cần retry</div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <div className="text-[10px] font-bold text-emerald-700 uppercase">PROCESSED</div>
                <div className="text-xl font-black text-emerald-900 mt-1">
                  {metrics?.outboxBacklogMetrics.totalProcessed ?? 0}
                </div>
                <div className="text-[10px] text-slate-500">Đã commit</div>
              </div>
            </div>

            {/* Chi tiết Backlog theo từng Kho */}
            <div className="space-y-2 text-xs">
              <div className="text-slate-500 font-semibold mb-1">Phân bố Outbox theo chi nhánh:</div>
              {metrics?.outboxBacklogMetrics?.nodes &&
                Object.entries(metrics.outboxBacklogMetrics.nodes).map(([nodeKey, nodeData]) => (
                  <div
                    key={nodeKey}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
                  >
                    <span className="font-bold text-slate-800">Chi nhánh {nodeKey}:</span>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="text-blue-600 font-bold">{nodeData.pending} Pending</span>
                      <span className="text-slate-300">|</span>
                      <span className={nodeData.failed > 0 ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                        {nodeData.failed} Failed
                      </span>
                      <span className="text-slate-300">|</span>
                      <span className="text-emerald-700 font-semibold">{nodeData.processed} Processed</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <span>Kafka Business Topics:</span>
            <span className="font-bold text-slate-800">
              {metrics?.kafkaMetrics.hasBusinessTopics ? '3/3 Topics Hoạt Động (inventory, transfer, audit)' : 'Chưa đủ topics'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
