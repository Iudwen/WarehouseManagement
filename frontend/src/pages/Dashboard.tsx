import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useAuth } from '../contexts/AuthContext';
import type {
  StockItem,
  LowStockAlert,
  IOStatisticsData,
  IOTimelinePoint,
} from '../types';
import {
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Calendar,
  Filter,
  BarChart3,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  FileText,
  Layers,
  ChevronLeft,
  ChevronRight,
  Download,
  Building2,
  Clock,
  Sparkles,
} from 'lucide-react';

export default function Dashboard() {
  const { selectedWarehouse, isWarehouseLocked } = useWarehouse();
  const { user } = useAuth();

  // Kiểm tra quyền được xem toàn quốc
  const canSelectAll =
    user?.vai_tro === 'ADMIN' ||
    user?.vai_tro === 'DIEU_PHOI' ||
    user?.vai_tro === 'DATA_ANALYST';

  // State tồn kho realtime
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [alerts, setAlerts] = useState<LowStockAlert[]>([]);
  const [pendingImports, setPendingImports] = useState<number>(0);
  const [pendingExports, setPendingExports] = useState<number>(0);
  const [loadingStocks, setLoadingStocks] = useState(true);

  // State thống kê Nhập - Xuất
  const [ioWarehouse, setIoWarehouse] = useState<string>(() => {
    if (isWarehouseLocked && user?.ma_kho) return user.ma_kho;
    return 'ALL';
  });
  const [granularity, setGranularity] = useState<'day' | 'month'>('month');
  const [fromDate, setFromDate] = useState<string>('2025-09-18');
  const [toDate, setToDate] = useState<string>('2026-09-18');
  const [ioData, setIoData] = useState<IOStatisticsData | null>(null);
  const [loadingIo, setLoadingIo] = useState(false);
  const [ioError, setIoError] = useState<string | null>(null);

  // State giao diện phụ
  const [topTab, setTopTab] = useState<'import' | 'export'>('import');
  const [tablePage, setTablePage] = useState(1);
  const [hoveredPoint, setHoveredPoint] = useState<IOTimelinePoint | null>(null);
  const rowsPerPage = 10;

  // Đồng bộ kho khi selectedWarehouse thay đổi
  useEffect(() => {
    if (isWarehouseLocked && user?.ma_kho) {
      setIoWarehouse(user.ma_kho);
    }
  }, [selectedWarehouse, isWarehouseLocked, user]);

  // Tải dữ liệu tồn kho realtime và các phiếu chờ xử lý
  const fetchDashboardData = async () => {
    setLoadingStocks(true);
    try {
      const [resSummary, resAlerts] = await Promise.all([
        api.get(`/dashboard/summary?ma_kho=${selectedWarehouse}`),
        api.get(`/alerts/low-stock?ma_kho=${selectedWarehouse}`),
      ]);

      const sumData = resSummary.data.data || resSummary.data;
      setStocks(sumData.stocks || sumData.san_pham || []);
      setAlerts(resAlerts.data.alerts || []);
      setPendingImports(Number(sumData.pending_imports ?? 0));
      setPendingExports(Number(sumData.pending_exports ?? 0));
    } catch (err) {
      console.error('Lỗi load Dashboard summary:', err);
    } finally {
      setLoadingStocks(false);
    }
  };

  // Tải thống kê nhập xuất
  const fetchIOStatistics = async () => {
    setLoadingIo(true);
    setIoError(null);
    try {
      const res = await api.get('/dashboard/io-statistics', {
        params: {
          ma_kho: ioWarehouse,
          granularity,
          from: fromDate,
          to: toDate,
          from_date: fromDate,
          to_date: toDate,
        },
      });
      const payload = res.data?.data || (res.data?.success && res.data.kpi ? res.data : null);
      if (payload) {
        setIoData(payload);
      } else {
        setIoError(res.data?.message || 'Không thể lấy dữ liệu thống kê');
      }
    } catch (err: any) {
      console.error('Lỗi load thống kê nhập xuất:', err);
      setIoError(err.response?.data?.message || 'Lỗi kết nối máy chủ');
    } finally {
      setLoadingIo(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedWarehouse]);

  useEffect(() => {
    fetchIOStatistics();
    setTablePage(1);
  }, [ioWarehouse, granularity, fromDate, toDate]);

  // Bộ lọc nhanh thời gian (Presets)
  const applyPreset = (preset: 'all_history' | 'last_month' | 'last_30' | 'today') => {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().slice(0, 10);

    if (preset === 'all_history') {
      setGranularity('month');
      setFromDate('2025-09-18');
      setToDate('2026-09-18');
    } else if (preset === 'last_month') {
      setGranularity('day');
      setFromDate('2026-09-01');
      setToDate('2026-09-18');
    } else if (preset === 'last_30') {
      const past30 = new Date(today);
      past30.setDate(past30.getDate() - 30);
      setGranularity('day');
      setFromDate(formatDate(past30));
      setToDate(formatDate(today));
    } else if (preset === 'today') {
      setGranularity('day');
      setFromDate(formatDate(today));
      setToDate(formatDate(today));
    }
  };

  // Xuất file CSV báo cáo chuỗi thời gian
  const exportToCSV = () => {
    if (!ioData?.timeline || ioData.timeline.length === 0) return;
    const headers = [
      'Mốc thời gian',
      'Số lượng nhập (SP)',
      'Số phiếu nhập',
      'Số lượng xuất (SP)',
      'Số phiếu xuất',
      'Chênh lệch ròng (Nhập - Xuất)',
    ];
    const rows = ioData.timeline.map((p) => [
      p.moc_thoi_gian,
      p.so_luong_nhap,
      p.so_phieu_nhap,
      p.so_luong_xuat,
      p.so_phieu_xuat,
      p.chenh_lech_rong,
    ]);
    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `thong_ke_nhap_xuat_${ioWarehouse}_${fromDate}_${toDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalQty = stocks.reduce((acc, item) => acc + item.so_luong, 0);

  // Dữ liệu phân trang cho bảng chi tiết
  const timelinePoints = ioData?.timeline || [];
  const totalTablePages = Math.ceil(timelinePoints.length / rowsPerPage) || 1;
  const paginatedTimeline = useMemo(() => {
    const start = (tablePage - 1) * rowsPerPage;
    return timelinePoints.slice(start, start + rowsPerPage);
  }, [timelinePoints, tablePage]);

  // Phân tích biểu đồ SVG
  const chartMetrics = useMemo(() => {
    if (!timelinePoints || timelinePoints.length === 0) return null;
    const maxVal = Math.max(
      ...timelinePoints.map((p) => Math.max(p.so_luong_nhap, p.so_luong_xuat)),
      10
    );
    return { maxVal, count: timelinePoints.length };
  }, [timelinePoints]);

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Header & Title Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              TỔNG QUAN HỆ THỐNG KHO
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Chi nhánh: {selectedWarehouse}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Giám sát tồn kho phân tán và phân tích luồng xuất - nhập hàng hóa toàn quốc
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchDashboardData();
              fetchIOStatistics();
            }}
            disabled={loadingStocks || loadingIo}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loadingStocks || loadingIo ? 'animate-spin' : ''}`}
            />
            <span>Làm mới toàn bộ</span>
          </button>
        </div>
      </div>

      {/* 2. Top 4 Quick KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-start hover:shadow-md transition-shadow">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Tổng Tồn Kho (SKU)
            </span>
            <div className="text-2xl font-black text-slate-800 mt-1">
              {loadingStocks ? '...' : totalQty.toLocaleString()}
            </div>
            <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
              Tại kho {selectedWarehouse} ({stocks.length} mã mặt hàng)
            </span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-start hover:shadow-md transition-shadow">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Phiếu Nhập Chờ Xử Lý
            </span>
            <div className="text-2xl font-black text-amber-600 mt-1">
              {loadingStocks ? '...' : pendingImports}
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">
              Phiếu chờ duyệt & nhập thực tế
            </span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex justify-between items-start hover:shadow-md transition-shadow">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Phiếu Xuất Chờ Xử Lý
            </span>
            <div className="text-2xl font-black text-indigo-600 mt-1">
              {loadingStocks ? '...' : pendingExports}
            </div>
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">
              Phiếu xuất đang chờ xử lý
            </span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-xs flex justify-between items-start hover:shadow-md transition-shadow">
          <div>
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
              Cảnh Báo Sắp Hết Hàng
            </span>
            <div className="text-2xl font-black text-rose-600 mt-1">
              {loadingStocks ? '...' : alerts.length}
            </div>
            <span className="text-[11px] text-rose-500 font-medium mt-1 block">
              Tồn kho dưới ngưỡng an toàn
            </span>
          </div>
          <div className="p-3 bg-rose-100 text-rose-600 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. SECTION TRỌNG TÂM: THỐNG KÊ NHẬP – XUẤT KHO */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        {/* Tiêu đề Section & Nguồn dữ liệu */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-gradient-to-tr from-emerald-500 to-teal-400 text-white rounded-xl shadow-xs">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">
                  THỐNG KÊ NHẬP – XUẤT KHO
                </h2>
                <p className="text-xs text-slate-500">
                  Tổng hợp sản lượng thực tế (Số lượng sản phẩm) và số lượt giao dịch (Số phiếu đã hoàn thành)
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ioData?.source === 'HISTORICAL_DATASET' ? (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Lịch sử giao dịch chuẩn hóa (2025 - 2026)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Dữ liệu PostgreSQL Realtime
              </span>
            )}

            <button
              onClick={exportToCSV}
              disabled={!ioData?.timeline || ioData.timeline.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
              title="Xuất bảng thống kê ra file CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất CSV</span>
            </button>
          </div>
        </div>

        {/* Thanh Điều Khiển & Bộ Lọc Thống Kê */}
        <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Bộ chọn kho */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                Kho phân tích:
              </span>
              {canSelectAll ? (
                <select
                  value={ioWarehouse}
                  onChange={(e) => setIoWarehouse(e.target.value)}
                  className="bg-white text-xs font-bold text-slate-800 px-3 py-1.5 rounded-lg border border-slate-300 focus:outline-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value="ALL">🌐 Toàn Hệ Thống (Tất Cả Các Kho)</option>
                  <option value="HN01">🏢 Kho Hà Nội (HN01)</option>
                  <option value="DN01">🏢 Kho Đà Nẵng (DN01)</option>
                  <option value="HCM01">🏢 Kho TP.HCM (HCM01)</option>
                </select>
              ) : (
                <span className="bg-white text-xs font-bold text-slate-700 px-3 py-1.5 rounded-lg border border-slate-300 shadow-2xs">
                  {ioWarehouse === 'HN01'
                    ? 'Kho Hà Nội (HN01)'
                    : ioWarehouse === 'DN01'
                    ? 'Kho Đà Nẵng (DN01)'
                    : ioWarehouse === 'HCM01'
                    ? 'Kho TP.HCM (HCM01)'
                    : ioWarehouse}
                </span>
              )}
            </div>

            {/* Granularity: Theo Ngày / Theo Tháng */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setGranularity('day')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  granularity === 'day'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo Ngày
              </button>
              <button
                type="button"
                onClick={() => setGranularity('month')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  granularity === 'month'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Theo Tháng
              </button>
            </div>

            {/* Presets Nhanh */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium">Mẫu:</span>
              <button
                type="button"
                onClick={() => applyPreset('all_history')}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 font-semibold shadow-2xs"
              >
                Toàn Bộ Lịch Sử (2025-2026)
              </button>
              <button
                type="button"
                onClick={() => applyPreset('last_month')}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 font-semibold shadow-2xs"
              >
                Tháng 09/2026
              </button>
              <button
                type="button"
                onClick={() => applyPreset('last_30')}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 font-semibold shadow-2xs"
              >
                30 Ngày Gần Nhất
              </button>
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 font-semibold shadow-2xs"
              >
                Hôm Nay
              </button>
            </div>
          </div>

          {/* Chọn Khoảng Thời Gian Custom */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200/60 text-xs">
            <span className="font-bold text-slate-600 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Khoảng ngày:
            </span>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Từ</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-white px-3 py-1 rounded-lg border border-slate-300 font-mono text-slate-800 text-xs shadow-2xs focus:outline-blue-500"
              />
              <span className="text-slate-400">Đến</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-white px-3 py-1 rounded-lg border border-slate-300 font-mono text-slate-800 text-xs shadow-2xs focus:outline-blue-500"
              />
            </div>

            <button
              onClick={fetchIOStatistics}
              disabled={loadingIo}
              className="ml-auto px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Filter className="w-3.5 h-3.5" />
              Áp Dụng Lọc
            </button>
          </div>
        </div>

        {/* Lỗi hiển thị nếu có */}
        {ioError && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{ioError}</span>
          </div>
        )}

        {/* 4 Thẻ KPI Chỉ Số Nhập - Xuất Nổi Bật */}
        {ioData?.kpi && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Tổng Nhập Trong Kỳ */}
            <div className="bg-gradient-to-br from-emerald-50/60 to-white p-5 rounded-2xl border border-emerald-200/80 shadow-2xs space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                  Tổng Hàng Nhập (Kỳ)
                </span>
                <span className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                  <ArrowDownLeft className="w-4 h-4" />
                </span>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-700">
                  {ioData.kpi.tong_nhap_khoang_loc.toLocaleString()}{' '}
                  <span className="text-xs font-semibold text-emerald-600">SP</span>
                </div>
                <div className="text-xs font-bold text-emerald-800/80 mt-0.5">
                  Đã hoàn thành: {ioData.kpi.so_phieu_nhap_khoang_loc.toLocaleString()} phiếu
                </div>
              </div>
              <div className="pt-2 border-t border-emerald-100 text-[11px] text-slate-500 flex justify-between">
                <span>Hôm nay: <strong className="text-emerald-700">{ioData.kpi.tong_nhap_hom_nay} SP</strong></span>
                <span>Tháng này: <strong className="text-emerald-700">{ioData.kpi.tong_nhap_thang_nay.toLocaleString()} SP</strong></span>
              </div>
            </div>

            {/* Card 2: Tổng Xuất Trong Kỳ */}
            <div className="bg-gradient-to-br from-indigo-50/60 to-white p-5 rounded-2xl border border-indigo-200/80 shadow-2xs space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">
                  Tổng Hàng Xuất (Kỳ)
                </span>
                <span className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
              <div>
                <div className="text-2xl font-black text-indigo-700">
                  {ioData.kpi.tong_xuat_khoang_loc.toLocaleString()}{' '}
                  <span className="text-xs font-semibold text-indigo-600">SP</span>
                </div>
                <div className="text-xs font-bold text-indigo-800/80 mt-0.5">
                  Đã hoàn thành: {ioData.kpi.so_phieu_xuat_khoang_loc.toLocaleString()} phiếu
                </div>
              </div>
              <div className="pt-2 border-t border-indigo-100 text-[11px] text-slate-500 flex justify-between">
                <span>Hôm nay: <strong className="text-indigo-700">{ioData.kpi.tong_xuat_hom_nay} SP</strong></span>
                <span>Tháng này: <strong className="text-indigo-700">{ioData.kpi.tong_xuat_thang_nay.toLocaleString()} SP</strong></span>
              </div>
            </div>

            {/* Card 3: Chênh Lệch Luồng Hàng (Net Flow) */}
            <div className="bg-gradient-to-br from-slate-50 to-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  Chênh Lệch Ròng (Nhập - Xuất)
                </span>
                <span
                  className={`p-2 rounded-lg ${
                    ioData.kpi.chenh_lech_rong_khoang_loc >= 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {ioData.kpi.chenh_lech_rong_khoang_loc >= 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                </span>
              </div>
              <div>
                <div
                  className={`text-2xl font-black ${
                    ioData.kpi.chenh_lech_rong_khoang_loc >= 0
                      ? 'text-emerald-700'
                      : 'text-rose-600'
                  }`}
                >
                  {ioData.kpi.chenh_lech_rong_khoang_loc > 0 ? '+' : ''}
                  {ioData.kpi.chenh_lech_rong_khoang_loc.toLocaleString()}{' '}
                  <span className="text-xs font-semibold text-slate-500">SP</span>
                </div>
                <div className="text-xs font-semibold text-slate-500 mt-0.5">
                  {ioData.kpi.chenh_lech_rong_khoang_loc >= 0 ? (
                    <span className="text-emerald-600 font-bold">
                      Nhập siêu (Kho tăng thêm tồn)
                    </span>
                  ) : (
                    <span className="text-rose-600 font-bold">
                      Xuất siêu (Kho giảm bớt tồn)
                    </span>
                  )}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                Tỷ trọng Xuất / Nhập:{' '}
                <strong className="text-slate-700">
                  {ioData.kpi.tong_nhap_khoang_loc > 0
                    ? `${(
                        (ioData.kpi.tong_xuat_khoang_loc /
                          ioData.kpi.tong_nhap_khoang_loc) *
                        100
                      ).toFixed(1)}%`
                    : '---'}
                </strong>
              </div>
            </div>

            {/* Card 4: Tổng Lượt Phiếu Giao Dịch */}
            <div className="bg-gradient-to-br from-blue-50/50 to-white p-5 rounded-2xl border border-blue-200/80 shadow-2xs space-y-2">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
                  Tổng Phiếu Hoàn Thành
                </span>
                <span className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                  <FileText className="w-4 h-4" />
                </span>
              </div>
              <div>
                <div className="text-2xl font-black text-blue-700">
                  {(
                    ioData.kpi.so_phieu_nhap_khoang_loc +
                    ioData.kpi.so_phieu_xuat_khoang_loc
                  ).toLocaleString()}{' '}
                  <span className="text-xs font-semibold text-blue-600">Phiếu</span>
                </div>
                <div className="text-xs font-semibold text-slate-500 mt-0.5">
                  {ioData.kpi.so_phieu_nhap_khoang_loc} phiếu nhập ·{' '}
                  {ioData.kpi.so_phieu_xuat_khoang_loc} phiếu xuất
                </div>
              </div>
              <div className="pt-2 border-t border-blue-100 text-[11px] text-slate-500">
                Trung bình sản lượng:{' '}
                <strong className="text-blue-700">
                  {ioData.kpi.so_phieu_nhap_khoang_loc +
                    ioData.kpi.so_phieu_xuat_khoang_loc >
                  0
                    ? Math.round(
                        (ioData.kpi.tong_nhap_khoang_loc +
                          ioData.kpi.tong_xuat_khoang_loc) /
                          (ioData.kpi.so_phieu_nhap_khoang_loc +
                            ioData.kpi.so_phieu_xuat_khoang_loc)
                      )
                    : 0}{' '}
                  SP/Phiếu
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Biểu đồ Trực Quan SVG So Sánh Nhập vs Xuất theo Chuỗi Thời Gian */}
        <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>BIỂU ĐỒ SO SÁNH SẢN LƯỢNG NHẬP VS XUẤT</span>
                <span className="text-[11px] font-normal text-slate-500">
                  ({granularity === 'day' ? 'Theo từng ngày' : 'Theo từng tháng'} - {timelinePoints.length} mốc dữ liệu)
                </span>
              </h3>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block"></span>
                <span className="text-slate-700">Hàng Nhập (SP)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block"></span>
                <span className="text-slate-700">Hàng Xuất (SP)</span>
              </div>
            </div>
          </div>

          {loadingIo ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-xs font-semibold">Đang tổng hợp dữ liệu thời gian...</span>
            </div>
          ) : timelinePoints.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2 border-2 border-dashed border-slate-200 rounded-xl">
              <Package className="w-8 h-8 text-slate-300" />
              <span className="text-xs font-medium">
                Không tìm thấy dữ liệu giao dịch nhập/xuất trong khoảng thời gian đã chọn
              </span>
            </div>
          ) : (
            <div className="relative">
              {/* Tooltip Hover Overlay */}
              {hoveredPoint && (
                <div className="absolute top-2 right-4 z-10 bg-slate-900/95 backdrop-blur text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 pointer-events-none border border-slate-700">
                  <div className="font-bold text-slate-200 flex items-center gap-1.5 border-b border-slate-800 pb-1">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span>Mốc: {hoveredPoint.moc_thoi_gian}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-emerald-400 font-semibold">
                    <span>Nhập kho:</span>
                    <span>
                      {hoveredPoint.so_luong_nhap.toLocaleString()} SP ({hoveredPoint.so_phieu_nhap} phiếu)
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-indigo-300 font-semibold">
                    <span>Xuất kho:</span>
                    <span>
                      {hoveredPoint.so_luong_xuat.toLocaleString()} SP ({hoveredPoint.so_phieu_xuat} phiếu)
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800 text-slate-300">
                    <span>Chênh lệch:</span>
                    <span
                      className={`font-bold ${
                        hoveredPoint.chenh_lech_rong >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {hoveredPoint.chenh_lech_rong > 0 ? '+' : ''}
                      {hoveredPoint.chenh_lech_rong.toLocaleString()} SP
                    </span>
                  </div>
                </div>
              )}

              {/* Responsive SVG Chart */}
              <div className="overflow-x-auto">
                <svg
                  viewBox="0 0 920 280"
                  className="w-full h-64 select-none min-w-[650px]"
                >
                  {/* Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                    const y = 20 + (1 - ratio) * 210;
                    const val = Math.round((chartMetrics?.maxVal || 100) * ratio);
                    return (
                      <g key={idx}>
                        <line
                          x1="65"
                          y1={y}
                          x2="900"
                          y2={y}
                          stroke="#e2e8f0"
                          strokeDasharray={ratio === 0 ? 'none' : '3 3'}
                        />
                        <text
                          x="55"
                          y={y + 4}
                          textAnchor="end"
                          className="text-[10px] fill-slate-400 font-mono"
                        >
                          {val.toLocaleString()}
                        </text>
                      </g>
                    );
                  })}

                  {/* Bars & Interactive Groups */}
                  {timelinePoints.map((point, idx) => {
                    const n = timelinePoints.length;
                    const chartW = 825;
                    const colWidth = chartW / n;
                    const xCenter = 70 + idx * colWidth + colWidth / 2;
                    const barWidth = Math.max(3, Math.min(18, colWidth * 0.36));
                    const maxV = chartMetrics?.maxVal || 1;

                    const hIn = (point.so_luong_nhap / maxV) * 210;
                    const hOut = (point.so_luong_xuat / maxV) * 210;
                    const yBase = 230;

                    // Nhãn trục X: hiển thị mẫu để tránh đè chữ nếu số điểm quá nhiều
                    const showLabel =
                      n <= 15 ||
                      (n <= 31 && idx % 2 === 0) ||
                      (n > 31 && idx % Math.ceil(n / 12) === 0);

                    return (
                      <g
                        key={idx}
                        className="cursor-pointer group"
                        onMouseEnter={() => setHoveredPoint(point)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        {/* Hover highlight background */}
                        <rect
                          x={70 + idx * colWidth}
                          y={20}
                          width={colWidth}
                          height={210}
                          fill="currentColor"
                          className="text-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"
                        />

                        {/* Bar Nhập (Emerald) */}
                        <rect
                          x={xCenter - barWidth - 1}
                          y={yBase - hIn}
                          width={barWidth}
                          height={Math.max(2, hIn)}
                          rx="2"
                          className="fill-emerald-500 group-hover:fill-emerald-400 transition-colors"
                        />

                        {/* Bar Xuất (Indigo) */}
                        <rect
                          x={xCenter + 1}
                          y={yBase - hOut}
                          width={barWidth}
                          height={Math.max(2, hOut)}
                          rx="2"
                          className="fill-indigo-500 group-hover:fill-indigo-400 transition-colors"
                        />

                        {/* X-axis label */}
                        {showLabel && (
                          <text
                            x={xCenter}
                            y={250}
                            textAnchor="middle"
                            className="text-[10px] fill-slate-500 font-mono"
                          >
                            {granularity === 'month'
                              ? point.moc_thoi_gian
                              : point.moc_thoi_gian.slice(5)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Phân bổ Chi Nhánh & Top Mặt Hàng */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cột Trái: Phân Bổ Theo Chi Nhánh (HN01, DN01, HCM01) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>CƠ CẤU NHẬP - XUẤT THEO CHI NHÁNH</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                Toàn mạng lưới kho
              </span>
            </div>

            <div className="space-y-4 pt-1">
              {(ioData?.warehouse_breakdown || []).map((wh, idx) => {
                const totalIO = wh.so_luong_nhap + wh.so_luong_xuat;
                const grandTotal =
                  (ioData?.kpi.tong_nhap_khoang_loc || 0) +
                  (ioData?.kpi.tong_xuat_khoang_loc || 0);
                const percentOfTotal =
                  grandTotal > 0 ? ((totalIO / grandTotal) * 100).toFixed(1) : '0';

                return (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/70 space-y-2 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        {wh.ten_kho}
                      </span>
                      <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        {percentOfTotal}% sản lượng
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                      <div>
                        <div className="text-[11px] text-slate-400">Nhập kho:</div>
                        <div className="font-bold text-emerald-600">
                          {wh.so_luong_nhap.toLocaleString()} SP{' '}
                          <span className="text-[10px] text-slate-400">
                            ({wh.so_phieu_nhap} phiếu)
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400">Xuất kho:</div>
                        <div className="font-bold text-indigo-600">
                          {wh.so_luong_xuat.toLocaleString()} SP{' '}
                          <span className="text-[10px] text-slate-400">
                            ({wh.so_phieu_xuat} phiếu)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Mini comparison bar */}
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                      <div
                        style={{
                          width: `${
                            totalIO > 0
                              ? (wh.so_luong_nhap / totalIO) * 100
                              : 50
                          }%`,
                        }}
                        className="bg-emerald-500 h-full"
                        title="Tỷ lệ nhập"
                      ></div>
                      <div
                        style={{
                          width: `${
                            totalIO > 0
                              ? (wh.so_luong_xuat / totalIO) * 100
                              : 50
                          }%`,
                        }}
                        className="bg-indigo-500 h-full"
                        title="Tỷ lệ xuất"
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cột Phải: Top Mặt Hàng Biến Động Nhiều Nhất */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>TOP SẢN PHẨM BIẾN ĐỘNG TRONG KỲ</span>
              </h3>

              {/* Tab Nhập / Xuất */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setTopTab('import')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    topTab === 'import'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Nhập Nhiều
                </button>
                <button
                  onClick={() => setTopTab('export')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    topTab === 'export'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Xuất Nhiều
                </button>
              </div>
            </div>

            {/* List Top Sản Phẩm */}
            <div className="space-y-2 pt-1">
              {(() => {
                const list =
                  topTab === 'import'
                    ? ioData?.top_products?.most_imported || []
                    : ioData?.top_products?.most_exported || [];

                if (list.length === 0) {
                  return (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      Chưa có số liệu sản phẩm trong kỳ đã chọn
                    </div>
                  );
                }

                return list.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-black flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-bold text-slate-800 text-xs">
                          {item.ten_sp}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Mã: {item.ma_sp} · {item.don_vi}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-black text-xs ${
                          topTab === 'import' ? 'text-emerald-600' : 'text-indigo-600'
                        }`}
                      >
                        {item.so_luong.toLocaleString()} {item.don_vi}
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium">
                        {item.so_phieu} lượt giao dịch
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* Bảng Chi Tiết Theo Dòng Thời Gian (Có Phân Trang) */}
        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>BẢNG KÊ SẢN LƯỢNG CHI TIẾT THEO MỐC THỜI GIAN</span>
            </h3>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg">
              {timelinePoints.length} bản ghi
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="p-3">Mốc Thời Gian</th>
                  <th className="p-3 text-right">SL Nhập (SP)</th>
                  <th className="p-3 text-center">Số Phiếu Nhập</th>
                  <th className="p-3 text-right">SL Xuất (SP)</th>
                  <th className="p-3 text-center">Số Phiếu Xuất</th>
                  <th className="p-3 text-right">Chênh Lệch Ròng</th>
                  <th className="p-3 text-center">Đánh Giá Luồng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedTimeline.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      Không có dòng dữ liệu nào
                    </td>
                  </tr>
                ) : (
                  paginatedTimeline.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-bold font-mono text-slate-800">
                        {row.moc_thoi_gian}
                      </td>
                      <td className="p-3 text-right font-extrabold text-emerald-600">
                        {row.so_luong_nhap.toLocaleString()}
                      </td>
                      <td className="p-3 text-center text-slate-600">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[11px]">
                          {row.so_phieu_nhap}
                        </span>
                      </td>
                      <td className="p-3 text-right font-extrabold text-indigo-600">
                        {row.so_luong_xuat.toLocaleString()}
                      </td>
                      <td className="p-3 text-center text-slate-600">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[11px]">
                          {row.so_phieu_xuat}
                        </span>
                      </td>
                      <td
                        className={`p-3 text-right font-black ${
                          row.chenh_lech_rong >= 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {row.chenh_lech_rong > 0 ? '+' : ''}
                        {row.chenh_lech_rong.toLocaleString()}
                      </td>
                      <td className="p-3 text-center">
                        {row.chenh_lech_rong > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Nhập siêu
                          </span>
                        ) : row.chenh_lech_rong < 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            Xuất siêu
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                            Cân bằng
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Điều Hướng Phân Trang */}
          {totalTablePages > 1 && (
            <div className="flex justify-between items-center pt-2 text-xs text-slate-500">
              <div>
                Trang {tablePage} / {totalTablePages} ({timelinePoints.length} dòng dữ liệu)
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={tablePage <= 1}
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold flex items-center gap-1 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Trước
                </button>
                <button
                  disabled={tablePage >= totalTablePages}
                  onClick={() => setTablePage((p) => Math.min(totalTablePages, p + 1))}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold flex items-center gap-1 hover:bg-slate-50 disabled:opacity-40"
                >
                  Sau <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Danh Sách Tồn Kho Chi Tiết (Bảng Realtime Hiện Có) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-slate-800 text-base">
            DANH SÁCH TỒN KHO REALTIME ({selectedWarehouse})
          </h2>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
            {stocks.length} Mặt hàng
          </span>
        </div>

        {loadingStocks ? (
          <div className="py-8 text-center text-slate-500 text-sm font-medium">
            Đang tải dữ liệu kho {selectedWarehouse}...
          </div>
        ) : stocks.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm font-medium">
            Kho {selectedWarehouse} chưa có tồn kho.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="p-3">Mã SKU</th>
                  <th className="p-3">Tên Sản Phẩm</th>
                  <th className="p-3">Kho Chi Nhánh</th>
                  <th className="p-3">Vị Trí Kho</th>
                  <th className="p-3 text-center">Số Lượng Tồn</th>
                  <th className="p-3">Trạng Thái</th>
                  <th className="p-3 text-right">Cập Nhật</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {stocks.map((item, idx) => {
                  let statusBadge = (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                      Sẵn hàng
                    </span>
                  );
                  if (item.so_luong <= 5) {
                    statusBadge = (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
                        Cực thấp
                      </span>
                    );
                  } else if (item.so_luong <= 15) {
                    statusBadge = (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
                        Sắp hết
                      </span>
                    );
                  }

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-slate-800">{item.ma_sp}</td>
                      <td className="p-3 font-semibold text-slate-700">{item.ten_sp}</td>
                      <td className="p-3 font-semibold text-blue-600">
                        {item.ten_kho || item.ma_kho}
                      </td>
                      <td className="p-3 font-mono text-slate-500">Vị trí B-0{idx + 1}-02</td>
                      <td className="p-3 font-extrabold text-center text-slate-800 text-sm">
                        {item.so_luong}
                      </td>
                      <td className="p-3">{statusBadge}</td>
                      <td className="p-3 text-right text-slate-400">
                        {item.cap_nhat_luc
                          ? new Date(item.cap_nhat_luc).toLocaleTimeString('vi-VN')
                          : '---'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}