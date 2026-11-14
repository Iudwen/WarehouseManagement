import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { useWarehouse } from '../contexts/WarehouseContext';
import {
  ClipboardCheck,
  RefreshCw,
  Search,
  Filter,
  Boxes,
  ArrowLeftRight,
  ShoppingCart,
  Activity,
  Building2,
  X,
  FileCode2,
  CheckCircle2,
  Download,
} from 'lucide-react';

interface NormalizedAuditLog {
  _id: string;
  event_id: string;
  event_type: string;
  category: 'INVENTORY' | 'TRANSFER' | 'SALES' | 'SYSTEM' | 'WAREHOUSE';
  ma_kho: string;
  title: string;
  description: string;
  details?: any;
  user?: string;
  status: string;
  timestamp: string;
  raw: any;
}

interface AuditSummary {
  total: number;
  inventory: number;
  transfer: number;
  sales: number;
  system: number;
  warehouse: number;
  active_nodes: number;
}

export default function AuditLogs() {
  const { selectedWarehouse } = useWarehouse();
  const [logs, setLogs] = useState<NormalizedAuditLog[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Bộ lọc
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [searchText, setSearchText] = useState<string>('');
  const [selectedLogForJson, setSelectedLogForJson] = useState<NormalizedAuditLog | null>(null);

  // Tải dữ liệu nhật ký sự kiện từ backend
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/audit/logs', {
        params: {
          ma_kho: selectedWarehouse,
          category: activeCategory,
          limit: 100,
        },
      });

      if (res.data?.success) {
        setLogs(res.data.data || []);
        if (res.data.summary) {
          setSummary(res.data.summary);
        }
      } else {
        // Fallback backward compatibility
        const rawList = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setLogs(rawList);
      }
    } catch (err) {
      console.error('Lỗi khi tải Audit Logs từ MongoDB:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedWarehouse, activeCategory]);

  // Tìm kiếm cục bộ
  const filteredLogs = useMemo(() => {
    if (!searchText.trim()) return logs;
    const q = searchText.toLowerCase().trim();
    return logs.filter((log) => {
      const idMatch = (log.event_id || '').toLowerCase().includes(q);
      const titleMatch = (log.title || '').toLowerCase().includes(q);
      const descMatch = (log.description || '').toLowerCase().includes(q);
      const userMatch = (log.user || '').toLowerCase().includes(q);
      const khoMatch = (log.ma_kho || '').toLowerCase().includes(q);
      return idMatch || titleMatch || descMatch || userMatch || khoMatch;
    });
  }, [logs, searchText]);

  // Xuất file JSON nhật ký
  const exportLogsToJson = () => {
    if (!filteredLogs.length) return;
    const blob = new Blob([JSON.stringify(filteredLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `mongodb_audit_logs_${selectedWarehouse}_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header Banner */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase font-mono">
              MongoDB Event Store
            </span>
            <span className="text-slate-300 text-xs">•</span>
            <span className="text-xs text-slate-500 font-mono">Distributed Event Sourcing</span>
            <span className="text-slate-300 text-xs">•</span>
            <span className="text-xs text-blue-700 font-mono font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              3 Node Postgres + MongoDB Replicas
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2.5">
            <ClipboardCheck className="w-6 h-6 text-blue-600 shrink-0" />
            Nhật Ký Sự Kiện & Kiểm Toán Hệ Thống (Audit Trail)
          </h1>
          <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
            Giám sát thời gian thực mọi biến động xuất nhập tồn kho, giao dịch điều chuyển phân tán 2 pha (2PC Saga), và các hành động kiểm kê vật lý lưu trữ dạng bất biến (Immutable Events) trên MongoDB.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={exportLogsToJson}
            title="Tải toàn bộ nhật ký sự kiện đang hiển thị dưới dạng JSON"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Xuất JSON
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới nhật ký
          </button>
        </div>
      </div>

      {/* 2. Top 4 KPI Cards Thống Kê Sự Kiện */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-2 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              Tổng Sự Kiện Đã Ghi Nhận
            </span>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <ClipboardCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {summary?.total || logs.length} <span className="text-xs font-normal text-slate-500">events</span>
          </div>
          <p className="text-xs text-blue-700 font-semibold font-mono">
            {selectedWarehouse === 'ALL' ? 'Toàn quốc (3 chi nhánh)' : `Chi nhánh: ${selectedWarehouse}`}
          </p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-2 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              Biến Động Tồn Kho (Inventory)
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-700">
            {summary?.inventory || logs.filter((l) => l.category === 'INVENTORY').length} <span className="text-xs font-normal text-slate-500">lượt</span>
          </div>
          <p className="text-xs text-emerald-600 font-semibold font-mono">
            Nhập • Xuất • Điều chỉnh kiểm kê
          </p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-2 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              Điều Chuyển Liên Kho (Saga)
            </span>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-purple-700">
            {summary?.transfer || logs.filter((l) => l.category === 'TRANSFER').length} <span className="text-xs font-normal text-slate-500">lệnh</span>
          </div>
          <p className="text-xs text-purple-600 font-semibold font-mono">
            Giao dịch phân tán 2 pha an toàn
          </p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-2 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              Xuất Bán & Vận Hành
            </span>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {(summary?.sales || 0) + (summary?.system || 0) + (summary?.warehouse || 0)} <span className="text-xs font-normal text-slate-500">bản ghi</span>
          </div>
          <p className="text-xs text-amber-600 font-semibold font-mono">
            Giao dịch POS & System Cron
          </p>
        </div>
      </div>

      {/* 3. Bộ Lọc Cục Bộ & Tìm Kiếm */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'Tất Cả Sự Kiện', icon: ClipboardCheck },
              { id: 'INVENTORY', label: 'Tồn Kho (Inventory)', icon: Boxes },
              { id: 'TRANSFER', label: 'Điều Chuyển (Transfer)', icon: ArrowLeftRight },
              { id: 'SALES', label: 'Xuất Bán (Sales)', icon: ShoppingCart },
              { id: 'SYSTEM', label: 'Hệ Thống (System)', icon: Activity },
              { id: 'WAREHOUSE', label: 'Chi Nhánh (Warehouse)', icon: Building2 },
            ].map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Ô Tìm Kiếm */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Tìm theo mã SKU, sự kiện, người dùng..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-64 transition-all"
            />
          </div>
        </div>

        {/* Thông tin ngữ cảnh */}
        <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
          <div>
            Chi nhánh đang xem: <span className="font-bold text-blue-700">{selectedWarehouse === 'ALL' ? 'Toàn quốc (Tất cả kho)' : selectedWarehouse}</span>
          </div>
          <div>
            Hiển thị: <span className="font-bold text-slate-900">{filteredLogs.length}</span> bản ghi sự kiện
          </div>
        </div>

        {/* 4. Bảng Dữ Liệu Sự Kiện (Event Stream Table) */}
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs font-mono space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
            <div>Đang tải dòng sự kiện từ MongoDB Event Store...</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs font-mono bg-slate-50/50 rounded-xl border border-dashed border-slate-200 space-y-2">
            <Filter className="w-8 h-8 mx-auto text-slate-300" />
            <div className="font-bold text-slate-700">Chưa ghi nhận sự kiện nào phù hợp</div>
            <p className="text-[11px] text-slate-500">
              Hãy thử chọn danh mục khác hoặc chuyển chi nhánh tại Header toàn cục.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Mã Sự Kiện</th>
                  <th className="py-3 px-4">Thời Gian</th>
                  <th className="py-3 px-4">Chi Nhánh</th>
                  <th className="py-3 px-4">Phân Loại</th>
                  <th className="py-3 px-4">Nội Dung Biến Động</th>
                  <th className="py-3 px-4">Người Thực Hiện</th>
                  <th className="py-3 px-4 text-center">Payload JSON</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredLogs.map((log, idx) => {
                  const formattedTime = log.timestamp
                    ? new Date(log.timestamp).toLocaleString('vi-VN')
                    : '---';

                  let badgeColor = 'bg-slate-100 text-slate-700 border-slate-200';
                  if (log.category === 'INVENTORY') badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                  else if (log.category === 'TRANSFER') badgeColor = 'bg-purple-50 text-purple-800 border-purple-200';
                  else if (log.category === 'SALES') badgeColor = 'bg-blue-50 text-blue-800 border-blue-200';
                  else if (log.category === 'SYSTEM') badgeColor = 'bg-amber-50 text-amber-800 border-amber-200';

                  return (
                    <tr key={log._id || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold text-blue-700">{log.event_id}</td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{formattedTime}</td>
                      <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px]">
                          {log.ma_kho}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                          {log.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <div className="font-bold text-slate-900 text-xs">{log.title}</div>
                        <div className="text-[11px] text-slate-500 leading-snug truncate max-w-md">
                          {log.description}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-sans whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px]">
                          {log.user || 'system'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedLogForJson(log)}
                          className="px-2.5 py-1 text-[11px] font-sans font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 transition-colors cursor-pointer flex items-center gap-1 mx-auto"
                        >
                          <FileCode2 className="w-3 h-3" />
                          Xem JSON
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Modal Xem Chi Tiết JSON Payload */}
      {selectedLogForJson && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileCode2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900 font-mono">
                  Chi Tiết MongoDB Event Payload: {selectedLogForJson.event_id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLogForJson(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">Loại sự kiện</div>
                <div className="font-bold text-slate-900 mt-0.5">{selectedLogForJson.event_type}</div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">Chi nhánh</div>
                <div className="font-bold text-blue-700 mt-0.5">{selectedLogForJson.ma_kho}</div>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">Thời gian phát sinh</div>
                <div className="font-bold text-slate-700 mt-0.5">
                  {new Date(selectedLogForJson.timestamp).toLocaleTimeString('vi-VN')}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-700 uppercase font-mono">
                Dữ Liệu JSON Gốc (MongoDB Document)
              </span>
              <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-80 leading-relaxed">
                {JSON.stringify(selectedLogForJson.raw || selectedLogForJson, null, 2)}
              </pre>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-mono font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Dữ liệu bất biến được bảo đảm bởi Event Sourcing
              </div>
              <button
                onClick={() => setSelectedLogForJson(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}