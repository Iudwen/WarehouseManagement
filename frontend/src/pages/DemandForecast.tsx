import { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import type {
  DataMiningSummaryData,
  DataMiningForecastItem,
  TimeSeriesPoint,
  AbcXyzAnalysisData,
  MarketBasketData,
  TransferRecommendationData,
  TransferRecommendationItem,
} from '../types';
import {
  BrainCircuit,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Table,
  Layers,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
  BarChart,
  Boxes,
  ShoppingCart,
  Compass,
  ArrowRight,
  ShieldCheck,
  Zap,
  Truck,
  ArrowLeftRight,
} from 'lucide-react';

export default function DemandForecast() {
  // State quản lý dữ liệu
  const [summary, setSummary] = useState<DataMiningSummaryData | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesPoint[]>([]);
  const [forecastItems, setForecastItems] = useState<DataMiningForecastItem[]>([]);
  const [abcData, setAbcData] = useState<AbcXyzAnalysisData | null>(null);
  const [basketData, setBasketData] = useState<MarketBasketData | null>(null);

  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filteredSummary, setFilteredSummary] = useState<{ maeRidge: number; maeBaseline: number; maeLightGBM?: number }>({
    maeRidge: 0,
    maeBaseline: 0,
    maeLightGBM: 0,
  });

  // State bộ lọc & phân trang
  const [selectedKho, setSelectedKho] = useState<string>('ALL');
  const [selectedSp, setSelectedSp] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('2026-08-01');
  const [toDate, setToDate] = useState<string>('2026-09-18');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'table' | 'breakdown' | 'abc_xyz' | 'market_basket' | 'transfer' | 'methodology'>('abc_xyz');
  const [transferData, setTransferData] = useState<TransferRecommendationData | null>(null);
  const [transferFilterPriority, setTransferFilterPriority] = useState<string>('ALL');

  // State giao diện
  const [loading, setLoading] = useState<boolean>(true);
  const [tableLoading, setTableLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Bộ lọc tìm kiếm trong tab ABC-XYZ & Basket
  const [abcSearchText, setAbcSearchText] = useState<string>('');
  const [selectedAbcGroup, setSelectedAbcGroup] = useState<string>('ALL');
  const [basketSearchText, setBasketSearchText] = useState<string>('');

  // Danh mục 20 sản phẩm chuẩn
  const productList = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => {
      const code = `SP${String(i + 1).padStart(3, '0')}`;
      return code;
    });
  }, []);

  // 1. Tải dữ liệu tổng hợp, chuỗi thời gian, ABC-XYZ và Market Basket
  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resSummary, resChart, resAbc, resBasket, resTransfer] = await Promise.all([
        api.get('/data-mining/summary'),
        api.get('/data-mining/time-series', {
          params: { ma_kho: selectedKho, ma_sp: selectedSp },
        }),
        api.get('/data-mining/abc-xyz', {
          params: { ma_kho: selectedKho },
        }),
        api.get('/data-mining/market-basket', {
          params: { ma_kho: selectedKho },
        }),
        api.get('/data-mining/transfer-recommendations', {
          params: { ma_kho: selectedKho },
        }),
      ]);

      if (resSummary.data?.success) {
        setSummary(resSummary.data.data);
      }
      if (resChart.data?.success) {
        setTimeSeries(resChart.data.data || []);
      }
      if (resAbc.data?.success) {
        setAbcData(resAbc.data.data);
      }
      if (resBasket.data?.success) {
        setBasketData(resBasket.data.data);
      }
      if (resTransfer?.data?.success) {
        setTransferData(resTransfer.data.data);
      }
    } catch (err: any) {
      console.error('Lỗi tải Data Mining:', err);
      setError(err.response?.data?.message || 'Không thể kết nối đến API Data Mining.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Tải bảng dữ liệu dự báo chi tiết (hỗ trợ phân trang)
  const fetchTableData = async () => {
    setTableLoading(true);
    try {
      const res = await api.get('/data-mining/forecast-results', {
        params: {
          ma_kho: selectedKho,
          ma_sp: selectedSp,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          page: currentPage,
          limit: 20,
        },
      });

      if (res.data?.success) {
        setForecastItems(res.data.items || []);
        setTotalItems(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
        if (res.data.summaryOfFiltered) {
          setFilteredSummary({
            maeRidge: res.data.summaryOfFiltered.maeRidge,
            maeBaseline: res.data.summaryOfFiltered.maeBaseline,
            maeLightGBM: res.data.summaryOfFiltered.maeLightGBM,
          });
        }
      }
    } catch (err: any) {
      console.error('Lỗi tải bảng kết quả:', err);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [selectedKho, selectedSp, fromDate, toDate]);

  useEffect(() => {
    fetchTableData();
  }, [selectedKho, selectedSp, fromDate, toDate, currentPage]);

  const handleResetFilters = () => {
    setSelectedKho('ALL');
    setSelectedSp('ALL');
    setFromDate('2026-08-01');
    setToDate('2026-09-18');
    setCurrentPage(1);
    setAbcSearchText('');
    setSelectedAbcGroup('ALL');
    setBasketSearchText('');
  };

  // Lọc sản phẩm trong tab ABC-XYZ
  const filteredAbcItems = useMemo(() => {
    if (!abcData?.items) return [];
    return abcData.items.filter((item) => {
      const matchText =
        abcSearchText === '' ||
        item.ma_sp.toLowerCase().includes(abcSearchText.toLowerCase()) ||
        item.ten_sp.toLowerCase().includes(abcSearchText.toLowerCase());
      const matchGroup = selectedAbcGroup === 'ALL' || item.nhom_abc_xyz === selectedAbcGroup || item.nhom_abc === selectedAbcGroup;
      return matchText && matchGroup;
    });
  }, [abcData, abcSearchText, selectedAbcGroup]);

  // Lọc luật trong tab Market Basket
  const filteredBasketRules = useMemo(() => {
    if (!basketData?.rules) return [];
    if (!basketSearchText) return basketData.rules.slice(0, 50);
    const q = basketSearchText.toLowerCase();
    return basketData.rules
      .filter((r) =>
        r.antecedent.toLowerCase().includes(q) ||
        r.antecedent_name.toLowerCase().includes(q) ||
        r.consequent.toLowerCase().includes(q) ||
        r.consequent_name.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [basketData, basketSearchText]);

  // Vẽ biểu đồ SVG Multi-series
  const chartSvgData = useMemo(() => {
    if (!timeSeries.length) return null;
    const width = 850;
    const height = 260;
    const padding = { top: 25, right: 30, bottom: 40, left: 55 };

    const maxVal = Math.max(
      ...timeSeries.map((d) => Math.max(d.thuc_te, d.du_bao_ridge, d.du_bao_baseline, d.du_bao_lgb || 0)),
      10
    );
    const maxY = Math.ceil((maxVal * 1.15) / 10) * 10;

    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const getX = (index: number) => padding.left + (index / (timeSeries.length - 1)) * innerW;
    const getY = (val: number) => padding.top + innerH - (val / maxY) * innerH;

    const actualPoints = timeSeries.map((d, i) => `${getX(i)},${getY(d.thuc_te)}`).join(' ');
    const ridgePoints = timeSeries.map((d, i) => `${getX(i)},${getY(d.du_bao_ridge)}`).join(' ');
    const basePoints = timeSeries.map((d, i) => `${getX(i)},${getY(d.du_bao_baseline)}`).join(' ');
    const lgbPoints = timeSeries.map((d, i) => `${getX(i)},${getY(d.du_bao_lgb || d.du_bao_rf)}`).join(' ');

    const yTicks = [0, maxY * 0.25, maxY * 0.5, maxY * 0.75, maxY].map((v) => Math.round(v));

    return {
      width,
      height,
      padding,
      innerW,
      innerH,
      maxY,
      getX,
      getY,
      actualPoints,
      ridgePoints,
      basePoints,
      lgbPoints,
      yTicks,
    };
  }, [timeSeries]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 uppercase">
              Hệ Thống Hỗ Trợ Quyết Định Kho (DSS) — Giai Đoạn 4
            </span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              ABC-XYZ • Apriori • LightGBM
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
            <BrainCircuit className="w-7 h-7 text-blue-400" />
            Hỗ Trợ Quyết Định Bố Trí Kho & Dự Báo Xuất Hàng
          </h1>
          <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
            Phân loại hàng hóa theo Pareto 80/15/5% & độ biến động nhu cầu, khai phá 378 luật kết hợp giỏ hàng gợi ý gom cụm picking, kết hợp benchmark chuỗi thời gian LightGBM trên 21,960 bản ghi Analytical Gold.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-2.5">
          <button
            onClick={() => {
              fetchAllData();
              fetchTableData();
            }}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md border border-white/10 transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Đồng bộ Dữ liệu
          </button>
        </div>
      </div>

      {/* Banner thông báo lỗi nếu có */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs font-medium">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Cảnh báo an toàn / Lưu ý nghiệp vụ */}
      <div className="flex items-start gap-3 p-3.5 bg-blue-50/80 border border-blue-200/80 rounded-2xl text-blue-900 text-xs">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">Nguyên tắc hỗ trợ quyết định:</span>
          <p className="text-slate-600 text-[11px] leading-relaxed">
            Các đề xuất bố trí lưu kho (ABC-XYZ) và gom cụm vị trí picking (Apriori) mang tính gợi ý khoa học cho thủ kho; hệ thống không tự động ghi đè hoặc di chuyển hàng hóa vật lý khi database chưa lưu trữ sơ đồ tọa độ 3D.
          </p>
        </div>
      </div>

      {/* 3. Thẻ KPI Tổng Thể */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Doanh Thu Thực Tế */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Tổng Giá Trị Xuất Kho
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-800 mt-2">
            {abcData ? (abcData.tong_doanh_thu / 1e12).toFixed(2) + ' nghìn tỷ' : '1.50 nghìn tỷ'}
          </div>
          <div className="text-[11px] text-slate-600 font-medium mt-2">
            {abcData?.tong_san_luong.toLocaleString() || '341,163'} sản phẩm xuất
          </div>
          <p className="text-[11px] text-emerald-600 font-semibold mt-2.5">
            20 mặt hàng chuẩn hóa Gold
          </p>
        </div>

        {/* Card 2: Apriori Market Basket */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Phiếu Xuất & Luật Kết Hợp
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-800 mt-2">
            {basketData?.tong_so_giao_dich.toLocaleString() || '10,952'} phiếu
          </div>
          <div className="text-[11px] text-slate-600 font-medium mt-2">
            {basketData?.tong_so_luat_khai_pha || 378} luật kết hợp hợp lệ
          </div>
          <p className="text-[11px] text-blue-600 font-semibold mt-2.5">
            Top #1: Tai nghe JBL + USB 64GB
          </p>
        </div>

        {/* Card 3: Hiệu năng ML Ridge */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Mô hình Tối ưu (Ridge)
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <BrainCircuit className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-800 mt-2">
            MAE {summary?.models.ridge.mae || '13.9641'}
          </div>
          <div className="text-[11px] text-slate-600 font-medium mt-2">
            Giảm 5.28% sai số so với Baseline
          </div>
          <p className="text-[11px] text-indigo-600 font-semibold mt-2.5">
            LightGBM benchmark: MAE 14.0044
          </p>
        </div>

        {/* Card 4: Nhóm Tỷ Trọng A */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Nhóm Hàng A (Chiếm 80% GT)
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-slate-800 mt-2">
            {abcData?.phan_bo_abc?.['A'] || 6} / 20 mặt hàng
          </div>
          <div className="text-[11px] text-slate-600 font-medium mt-2">
            Ưu tiên bố trí cửa xuất & kiểm kê định kỳ
          </div>
          <p className="text-[11px] text-amber-600 font-semibold mt-2.5">
            Nhóm AX (Ổn định cao): 4 mặt hàng
          </p>
        </div>
      </div>

      {/* 4. Bộ Lọc Tương Tác Đa Chiều */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Bộ Lọc Dữ Liệu Quyết Định (Kho • Sản phẩm • Thời gian)
            </span>
          </div>
          <button
            onClick={handleResetFilters}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Đặt lại bộ lọc
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Lọc Kho */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Chi Nhánh Kho
            </label>
            <select
              value={selectedKho}
              onChange={(e) => {
                setSelectedKho(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
            >
              <option value="ALL">Tất cả chi nhánh (HN, DN, HCM)</option>
              <option value="DN01">Kho Đà Nẵng (DN01)</option>
              <option value="HCM01">Kho TP. Hồ Chí Minh (HCM01)</option>
              <option value="HN01">Kho Hà Nội (HN01)</option>
            </select>
          </div>

          {/* Lọc Sản Phẩm (cho tab Dự Báo) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Mã Sản Phẩm Dự Báo
            </label>
            <select
              value={selectedSp}
              onChange={(e) => {
                setSelectedSp(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
            >
              <option value="ALL">Tất cả 20 sản phẩm</option>
              {productList.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>

          {/* Từ ngày */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Từ Ngày (Test Set)
            </label>
            <input
              type="date"
              value={fromDate}
              min="2026-08-01"
              max="2026-09-18"
              onChange={(e) => {
                setFromDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
            />
          </div>

          {/* Đến ngày */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Đến Ngày (Test Set)
            </label>
            <input
              type="date"
              value={toDate}
              min="2026-08-01"
              max="2026-09-18"
              onChange={(e) => {
                setToDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-700 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
            />
          </div>
        </div>
      </div>

      {/* 5. Tabs Điều Hướng Chức Năng Hỗ Trợ Quyết Định */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('abc_xyz')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'abc_xyz'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>1. Phân Loại ABC-XYZ & Bố Trí Kho</span>
        </button>

        <button
          onClick={() => setActiveTab('market_basket')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'market_basket'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>2. Khai Phá Giỏ Hàng & Gom Cụm Picking</span>
        </button>

        <button
          onClick={() => setActiveTab('breakdown')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'breakdown'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>4. Đánh Giá Mô Hình & Benchmark LightGBM</span>
        </button>

        <button
          onClick={() => setActiveTab('table')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'table'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Table className="w-4 h-4" />
          <span>5. Chi Tiết Dự Báo & Biểu Đồ Lịch Sử</span>
        </button>

        <button
          onClick={() => setActiveTab('methodology')}
          className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs transition-all whitespace-nowrap ${
            activeTab === 'methodology'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Info className="w-4 h-4" />
          <span>6. Phương Pháp Luận & Giới Hạn Nghiệp Vụ</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: PHÂN LOẠI ABC-XYZ & GỢI Ý BỐ TRÍ KHO */}
      {/* ============================================================== */}
      {activeTab === 'abc_xyz' && (
        <div className="space-y-6">
          {/* Ma trận 9 nhóm ABC-XYZ */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-blue-600" />
                  Ma Trận Phân Vùng 9 Nhóm ABC-XYZ ({abcData?.kho_ap_dung || selectedKho})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Phân loại dựa trên tỷ trọng doanh thu thực tế (Pareto 80/15/5%) và hệ số biến thiên nhu cầu ngày (CV).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600">Lọc nhóm nhanh:</span>
                <select
                  value={selectedAbcGroup}
                  onChange={(e) => setSelectedAbcGroup(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 outline-none"
                >
                  <option value="ALL">Tất cả nhóm</option>
                  <option value="A">Nhóm A (Giá trị cao)</option>
                  <option value="B">Nhóm B (Giá trị trung bình)</option>
                  <option value="C">Nhóm C (Giá trị thấp)</option>
                  <option value="AX">AX (Ưu tiên số 1)</option>
                  <option value="AY">AY</option>
                  <option value="BX">BX</option>
                  <option value="CX">CX</option>
                </select>
              </div>
            </div>

            {/* Grid 9 ô Ma trận */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Cột 1: X (Ổn định cao) */}
              <div className="space-y-3">
                <div className="text-center font-bold text-xs py-1.5 bg-slate-100 rounded-lg text-slate-700">
                  Nhóm X (Nhu cầu ổn định, CV &le; 0.65)
                </div>

                {/* Ô AX */}
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-600 text-white">
                      AX
                    </span>
                    <span className="text-sm font-black text-emerald-800">
                      {abcData?.phan_bo_matrix?.['AX'] || 0} sản phẩm
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-emerald-950 mt-2">Vị trí Ưu Tiên Cao Nhất</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Bố trí tại tầng thấp (tầng 1-2), sát cửa xuất hàng, thuận tiện xe nâng tiếp cận nhanh.
                  </p>
                </div>

                {/* Ô BX */}
                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-600 text-white">
                      BX
                    </span>
                    <span className="text-sm font-black text-blue-800">
                      {abcData?.phan_bo_matrix?.['BX'] || 0} sản phẩm
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-blue-950 mt-2">Vị trí Tiêu Chuẩn Giữa</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Bố trí tại dãy kệ trung tâm, khoảng cách di chuyển vừa phải, dự báo nhu cầu định kỳ.
                  </p>
                </div>

                {/* Ô CX */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-600 text-white">
                      CX
                    </span>
                    <span className="text-sm font-black text-slate-800">
                      {abcData?.phan_bo_matrix?.['CX'] || 0} sản phẩm
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-900 mt-2">Vị trí Tối Giản Công Sức</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Lưu trữ theo khối lượng lớn (bulk storage), kiểm kê định kỳ thưa hơn để giảm chi phí.
                  </p>
                </div>
              </div>

              {/* Cột 2: Y (Biến động vừa) */}
              <div className="space-y-3">
                <div className="text-center font-bold text-xs py-1.5 bg-slate-100 rounded-lg text-slate-700">
                  Nhóm Y (Biến động vừa, 0.65 &lt; CV &le; 0.75)
                </div>

                {/* Ô AY */}
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-amber-600 text-white">
                      AY
                    </span>
                    <span className="text-sm font-black text-amber-800">
                      {abcData?.phan_bo_matrix?.['AY'] || 0} sản phẩm
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-amber-950 mt-2">Kiểm Soát An Toàn Linh Hoạt</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Giá trị lớn nhưng nhu cầu dao động; cần tồn kho an toàn linh hoạt, bố trí gần lối xuất.
                  </p>
                </div>

                {/* Ô BY */}
                <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-indigo-600 text-white">
                      BY
                    </span>
                    <span className="text-sm font-black text-indigo-800">
                      {abcData?.phan_bo_matrix?.['BY'] || 0} sản phẩm
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-indigo-950 mt-2">Vị trí Linh Hoạt</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Theo dõi chu kỳ tuần/tháng, điều chỉnh lượng đặt hàng reorder point linh hoạt.
                  </p>
                </div>

                {/* Ô CY */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-500 text-white">
                      CY
                    </span>
                    <span className="text-sm font-black text-slate-700">
                      {abcData?.phan_bo_matrix?.['CY'] || 0} sản phẩm
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-900 mt-2">Khu Vực Phía Sau</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Đặt tại các dãy kệ phía sau, đặt hàng theo đợt lớn để tối ưu chi phí vận chuyển.
                  </p>
                </div>
              </div>

              {/* Cột 3: Z (Khó dự đoán) */}
              <div className="space-y-3">
                <div className="text-center font-bold text-xs py-1.5 bg-slate-100 rounded-lg text-slate-700">
                  Nhóm Z (Khó dự đoán / Không đều, CV &gt; 0.75)
                </div>

                {/* Ô AZ */}
                <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/60 hover:bg-rose-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-rose-600 text-white">
                      AZ
                    </span>
                    <span className="text-sm font-black text-rose-800">
                      {abcData?.phan_bo_matrix?.['AZ'] || 0} sản phẩm
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-rose-950 mt-2">Giám Sát Nghiêm Ngặt</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Giá trị rất cao nhưng nhu cầu thất thường; tránh tồn kho quá mức, đặt hàng theo đơn (JIT).
                  </p>
                </div>

                {/* Ô BZ */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-400 text-white">
                      BZ
                    </span>
                    <span className="text-sm font-black text-slate-600">
                      {abcData?.phan_bo_matrix?.['BZ'] || 0} sản phẩm
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-800 mt-2">Tồn Kho Đệm Tối Thiểu</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Giữ tồn kho đệm tối thiểu, bố trí tại các vị trí kệ tầng cao để tiết kiệm mặt sàn.
                  </p>
                </div>

                {/* Ô CZ */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-slate-400 text-white">
                      CZ
                    </span>
                    <span className="text-sm font-black text-slate-600">
                      {abcData?.phan_bo_matrix?.['CZ'] || 0} sản phẩm
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-800 mt-2">Khu Vực Lưu Trữ Phụ</p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Cân nhắc thanh lý hoặc chuyển sang hình thức gom hàng theo yêu cầu (Drop-shipping).
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bảng Danh Sách 20 Sản Phẩm Phân Loại Chi Tiết */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div className="text-xs text-slate-700 font-bold flex items-center gap-2">
                <span>Bảng Phân Loại 20 Mặt Hàng & Đề Xuất Bố Trí Kho</span>
                <span className="text-[11px] font-medium text-slate-500">
                  (Hiển thị {filteredAbcItems.length}/20 sản phẩm)
                </span>
              </div>
              <input
                type="text"
                placeholder="Tìm mã hoặc tên sản phẩm..."
                value={abcSearchText}
                onChange={(e) => setAbcSearchText(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-700 outline-none w-full sm:w-64"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5">Mã SP</th>
                    <th className="py-3 px-3.5">Tên Sản Phẩm</th>
                    <th className="py-3 px-3 text-right">Lượng xuất</th>
                    <th className="py-3 px-3.5 text-right">Doanh thu thực (VND)</th>
                    <th className="py-3 px-3 text-right">Tỷ lệ %</th>
                    <th className="py-3 px-3 text-right">Tích lũy %</th>
                    <th className="py-3 px-3 text-center">ABC</th>
                    <th className="py-3 px-3 text-right">CV</th>
                    <th className="py-3 px-3 text-center">XYZ</th>
                    <th className="py-3 px-3 text-center">Nhóm</th>
                    <th className="py-3 px-4">Gợi ý nguyên tắc bố trí kho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                        Đang phân tích dữ liệu ABC-XYZ...
                      </td>
                    </tr>
                  ) : filteredAbcItems.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-10 text-center text-slate-400">
                        <Info className="w-5 h-5 mx-auto mb-2 text-slate-400" />
                        Không tìm thấy sản phẩm nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    filteredAbcItems.map((item) => {
                    const abcColor =
                      item.nhom_abc === 'A'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : item.nhom_abc === 'B'
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : 'bg-slate-100 text-slate-700 border-slate-300';

                    const groupColor =
                      item.nhom_abc_xyz === 'AX'
                        ? 'bg-emerald-600 text-white'
                        : item.nhom_abc_xyz === 'AY'
                        ? 'bg-amber-600 text-white'
                        : item.nhom_abc_xyz === 'BX'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-600 text-white';

                    return (
                      <tr key={item.ma_sp} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3.5 font-bold text-slate-900">{item.ma_sp}</td>
                        <td className="py-3 px-3.5 font-medium text-slate-800">{item.ten_sp}</td>
                        <td className="py-3 px-3 text-right font-mono">{item.tong_so_luong.toLocaleString()}</td>
                        <td className="py-3 px-3.5 text-right font-mono font-semibold text-slate-900">
                          {item.tong_gia_tri.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">{item.ty_le_gia_tri}%</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {item.ty_le_tich_luy}%
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-md font-extrabold text-[11px] border ${abcColor}`}>
                            {item.nhom_abc}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">{item.cv}</td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-slate-100 text-slate-800 border border-slate-200">
                            {item.nhom_xyz}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-1 rounded-md font-black text-[11px] shadow-2xs ${groupColor}`}>
                            {item.nhom_abc_xyz}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-700 leading-snug">
                          <span className="font-semibold text-slate-900">{item.nguyen_tac_bo_tri}</span>
                          <span className="block text-[10px] text-slate-500 mt-0.5">{item.ly_do_de_xuat}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: KHAI PHÁ GIỎ HÀNG APRIORI & GỢI Ý PICKING */}
      {/* ============================================================== */}
      {activeTab === 'market_basket' && (
        <div className="space-y-6">
          {/* Header tổng quan Apriori */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-blue-600" />
                  Khai Phá Giỏ Hàng (Market Basket Analysis - Thuật Toán Apriori)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Phân tích trên <span className="font-bold text-slate-700">{basketData?.tong_so_giao_dich.toLocaleString()}</span> phiếu xuất hợp lệ; khai phá <span className="font-bold text-slate-700">{basketData?.tong_so_luat_khai_pha}</span> luật kết hợp có Lift &gt; 1.0 (xuất cùng vượt trội ngẫu nhiên).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                  Phạm vi: {basketData?.kho_ap_dung || selectedKho}
                </span>
              </div>
            </div>

            {/* Top Cặp Sản Phẩm Thường Xuất Chung */}
            <div className="mt-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Top Cặp Sản Phẩm Xuất Cùng Nhiều Nhất (Gợi ý đặt chung kệ picking)
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {(basketData?.top_picking_pairs || []).slice(0, 6).map((pair, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white hover:border-blue-300 hover:shadow-xs transition-all space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        Top #{idx + 1}
                      </span>
                      <span className="text-xs font-black text-slate-900 font-mono">
                        {pair.transaction_count} lần xuất chung
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 pt-1">
                      <span>{pair.item_1_name}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{pair.item_2_name}</span>
                    </div>

                    <p className="text-[11px] text-slate-600 bg-blue-50/50 p-2 rounded-lg border border-blue-100/60 leading-snug">
                      <span className="font-bold text-blue-900">Đề xuất picking:</span> {pair.de_xuat_picking}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bảng Chi Tiết Luật Kết Hợp */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <span className="text-xs font-bold text-slate-800">
                  Bảng Chi Tiết Luật Kết Hợp (Association Rules)
                </span>
                <p className="text-[10px] text-slate-500">
                  Support: Tỷ lệ xuất hiện • Confidence: Xác suất xuất B khi có A • Lift: Độ tương quan vượt trội so với độc lập
                </p>
              </div>

              <input
                type="text"
                placeholder="Tìm sản phẩm trong luật..."
                value={basketSearchText}
                onChange={(e) => setBasketSearchText(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-slate-700 outline-none w-full sm:w-64"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5">Tiền đề (A)</th>
                    <th className="py-3 px-3.5">Kết quả (B)</th>
                    <th className="py-3 px-3 text-right">Lần xuất chung</th>
                    <th className="py-3 px-3 text-right">Support %</th>
                    <th className="py-3 px-3 text-right">Confidence %</th>
                    <th className="py-3 px-3 text-right">Lift</th>
                    <th className="py-3 px-4">Gợi ý gom cụm vị trí picking</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                        Đang khai phá các luật kết hợp...
                      </td>
                    </tr>
                  ) : filteredBasketRules.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        <Info className="w-5 h-5 mx-auto mb-2 text-slate-400" />
                        Không tìm thấy luật kết hợp nào phù hợp với từ khóa tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    filteredBasketRules.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3.5 font-bold text-slate-900">
                        {r.antecedent_name} <span className="text-[10px] text-slate-400">({r.antecedent})</span>
                      </td>
                      <td className="py-3 px-3.5 font-bold text-blue-700">
                        {r.consequent_name} <span className="text-[10px] text-blue-400">({r.consequent})</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                        {r.transaction_count}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">{r.support_pct}%</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-indigo-700">{r.confidence_pct}%</td>
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-emerald-700">
                        {r.lift}x
                      </td>
                      <td className="py-3 px-4 text-[11px] text-slate-700 font-medium">{r.picking_suggestion}</td>
                    </tr>
                  ))
                )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: ĐÁNH GIÁ MÔ HÌNH & BENCHMARK LIGHTGBM */}
      {/* ============================================================== */}
      
      {/* 3. Tab Đề Xuất Điều Chuyển Hàng Liên Kho (DSS) */}
      {activeTab === 'transfer' && (
        <div className="space-y-6">
          {/* Ranh giới nghiệp vụ & Thông điệp DSS */}
          <div className="bg-gradient-to-r from-amber-50 via-blue-50 to-indigo-50 border border-amber-200/80 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl mt-0.5 shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1 text-xs text-slate-700 leading-relaxed">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-slate-900">
                    Hệ Thống Hỗ Trợ Ra Quyết Định Điều Chuyển Hàng (DSS - Decision Support System)
                  </h4>
                  <span className="bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded text-[10px]">
                    Khuyến nghị tự động
                  </span>
                </div>
                <p>
                  Chức năng tính toán dựa trên dữ liệu <strong>Tồn kho thực tế (Gold)</strong>, <strong>Nhu cầu dự báo (LightGBM/Ridge)</strong> và <strong>Định mức tồn an toàn phân loại ABC-XYZ</strong>.
                </p>
                <div className="bg-white/80 border border-amber-200/60 rounded-lg p-2.5 text-[11px] text-amber-900 font-medium">
                  ⚖️ <strong>Ranh giới nghiệp vụ bắt buộc:</strong> Đây là công cụ hỗ trợ quyết định phân tích dữ liệu, <u>KHÔNG</u> tự động tạo phiếu điều chuyển, <u>KHÔNG</u> ghi tăng/giảm tồn kho thực tế, và <u>KHÔNG</u> thay thế quy trình Saga phân tán. Nhân viên điều phối căn cứ đề xuất này để chủ động lập lệnh điều chuyển chính thức.
                </div>
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Tổng Đề Xuất</span>
                <Truck className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                {transferData?.tong_so_de_xuat || 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Cặp kho cần luân chuyển</div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Tổng Giá Trị Đề Xuất</span>
                <Zap className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-emerald-600">
                {transferData ? (transferData.tong_gia_tri_uoc_tinh / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' Tr đ' : '0 đ'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {transferData?.tong_gia_tri_uoc_tinh.toLocaleString('vi-VN')} VNĐ
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Ưu Tiên Khẩn Cấp (Cao)</span>
                <AlertCircle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-2xl font-black text-rose-600">
                {transferData?.phan_bo_muc_do?.HIGH || 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Nguy cơ thiếu hàng &lt; 14 ngày</div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Ưu Tiên Trung Bình</span>
                <Info className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-amber-600">
                {transferData?.phan_bo_muc_do?.MEDIUM || 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Tối ưu hóa đệm an toàn</div>
            </div>
          </div>

          {/* Bảng Đề Xuất Điều Chuyển */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                  Danh Sách Đề Xuất Cân Bằng Tồn Kho Liên Kho
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Phạm vi áp dụng: <strong>{selectedKho === 'ALL' ? 'Toàn bộ hệ thống 3 miền' : 'Kho ' + selectedKho}</strong>
                </p>
              </div>

              {/* Lọc theo mức độ ưu tiên */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Mức độ ưu tiên:</span>
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs">
                  {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setTransferFilterPriority(p)}
                      className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                        transferFilterPriority === p
                          ? 'bg-white text-slate-900 shadow-sm font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {p === 'ALL' ? 'Tất cả' : p === 'HIGH' ? 'Cao (Critical)' : p === 'MEDIUM' ? 'Trung bình' : 'Thấp'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Content Table / Empty State */}
            {(!transferData || transferData.items.length === 0) ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Tồn kho hiện tại đang ở trạng thái cân bằng</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Không phát hiện tình trạng kho nào bị thiếu hụt nghiêm trọng cần điều chuyển gấp từ các kho khác.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">Mã Đề Xuất</th>
                      <th className="py-3 px-4">Sản Phẩm & Phân Nhóm</th>
                      <th className="py-3 px-4">Kho Xuất (Nguồn)</th>
                      <th className="py-3 px-4 text-center">Luân Chuyển</th>
                      <th className="py-3 px-4">Kho Nhập (Đích)</th>
                      <th className="py-3 px-4 text-right">Số Lượng Đề Xuất</th>
                      <th className="py-3 px-4 text-right">Giá Trị Ước Tính</th>
                      <th className="py-3 px-4 text-center">Mức Ưu Tiên</th>
                      <th className="py-3 px-4">Căn Cứ Thuật Toán DSS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transferData.items
                      .filter((rec: TransferRecommendationItem) => transferFilterPriority === 'ALL' || rec.priority_code === transferFilterPriority)
                      .map((rec: TransferRecommendationItem) => (
                        <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {rec.id}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{rec.ten_sp}</div>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                              <span className="font-mono">{rec.ma_sp}</span>
                              <span>•</span>
                              <span>{rec.don_vi}</span>
                              <span>•</span>
                              <span className="bg-blue-100 text-blue-700 font-bold px-1 rounded">
                                Nhóm {rec.nhom_abc_xyz}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800">{rec.kho_nguon}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Tồn: <strong className="text-slate-800">{rec.ton_kho_nguon.toLocaleString('vi-VN')}</strong> sp
                            </div>
                            <div className="text-[10px] text-emerald-600 font-medium">
                              Đủ xuất {rec.dos_kho_nguon} ngày (Dư)
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center text-blue-500">
                              <ArrowRight className="w-5 h-5 animate-pulse" />
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800">{rec.kho_dich}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Tồn: <strong className="text-rose-600">{rec.ton_kho_dich.toLocaleString('vi-VN')}</strong> sp
                            </div>
                            <div className="text-[10px] text-rose-600 font-medium">
                              Chỉ đủ {rec.dos_kho_dich} ngày (Thiếu)
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="inline-block bg-blue-600 text-white font-extrabold px-3 py-1 rounded-lg text-sm shadow-sm">
                              +{rec.so_luong_de_xuat.toLocaleString('vi-VN')} {rec.don_vi}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">
                            {rec.gia_tri_uoc_tinh.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                                rec.priority_code === 'HIGH'
                                  ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                  : rec.priority_code === 'MEDIUM'
                                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                  : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {rec.muc_do_uu_tien}
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-xs text-[11px] text-slate-600 leading-snug">
                            {rec.can_cu_de_xuat}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between items-center">
              <span>Định mức an toàn: Nhóm A = 14 ngày | Nhóm B = 10 ngày | Nhóm C = 7 ngày</span>
              <span>Thời điểm tạo dữ liệu: {transferData?.thoi_diem_tao || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'breakdown' && (
        <div className="space-y-6">
          {/* Bảng so sánh 4 mô hình */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-blue-600" />
              So Sánh Công Bằng 4 Mô Hình Trên Cùng Tập Test Độc Lập (49 Ngày, 2,940 Dòng)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Mô Hình</th>
                    <th className="py-3 px-4">Nguyên Lý Thuật Toán</th>
                    <th className="py-3 px-4 text-right">MAE</th>
                    <th className="py-3 px-4 text-right">RMSE</th>
                    <th className="py-3 px-4 text-right">So Với Baseline</th>
                    <th className="py-3 px-4 text-center">Vai Trò Hệ Thống</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Baseline */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-bold text-slate-700">1. Baseline (Rolling Mean 7)</td>
                    <td className="py-3 px-4 text-[11px] text-slate-500">Trung bình trượt 7 ngày quá khứ gần nhất</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">14.7424</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600">18.2691</td>
                    <td className="py-3 px-4 text-right text-slate-400">Chuẩn mực</td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                        Baseline Nghiệp Vụ
                      </span>
                    </td>
                  </tr>

                  {/* Ridge */}
                  <tr className="bg-emerald-50/50 hover:bg-emerald-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      2. Linear Ridge Regression
                    </td>
                    <td className="py-3 px-4 text-[11px] text-emerald-900">
                      Hồi quy tuyến tính có điều chuẩn L2 (&alpha;=1.0), triệt tiêu đa cộng tuyến
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-emerald-800 text-sm">13.9641</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800">16.9765</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700">-5.28% MAE</td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow-2xs">
                        Mô Hình Chính (Primary)
                      </span>
                    </td>
                  </tr>

                  {/* Random Forest */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-bold text-slate-800">3. Random Forest Regressor</td>
                    <td className="py-3 px-4 text-[11px] text-slate-500">
                      Ensemble 100 cây quyết định, học tương tác phi tuyến tính
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">13.9994</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">17.0254</td>
                    <td className="py-3 px-4 text-right font-semibold text-blue-600">-5.04% MAE</td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                        Ensemble Benchmark
                      </span>
                    </td>
                  </tr>

                  {/* LightGBM */}
                  <tr className="bg-indigo-50/40 hover:bg-indigo-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-indigo-900 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-indigo-600" />
                      4. LightGBM Regressor (Giai Đoạn 4)
                    </td>
                    <td className="py-3 px-4 text-[11px] text-indigo-900">
                      Gradient Boosting tối ưu tốc độ, histogram-based learning, lá (leaf-wise)
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-black text-indigo-800 text-sm">14.0044</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-indigo-800">17.0347</td>
                    <td className="py-3 px-4 text-right font-bold text-indigo-700">-5.01% MAE</td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-600 text-white">
                        GBDT Tốc Độ Cao
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl text-xs text-slate-700 leading-relaxed border border-slate-200">
              <span className="font-bold text-slate-900">Kết luận thử nghiệm LightGBM:</span> Cả 3 mô hình học máy (Ridge, Random Forest, LightGBM) đều vượt trội rõ rệt so với Baseline truyền thống (giảm &gt; 5% sai số). Đặc biệt tại kho <span className="font-bold text-blue-700">DN01 (Đà Nẵng)</span>, LightGBM đạt MAE tốt nhất phân khúc (<span className="font-bold text-emerald-700">13.8967</span>). Hệ thống giữ Linear Ridge làm mô hình chính phục vụ tốc độ suy luận dưới 0.1s và tính giải thích minh bạch, đồng thời lưu trữ LightGBM trong Model Registry làm benchmark nâng cao.
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: CHI TIẾT DỰ BÁO & BIỂU ĐỒ LỊCH SỬ */}
      {/* ============================================================== */}
      {activeTab === 'table' && (
        <div className="space-y-6">
          {/* Biểu đồ chuỗi thời gian */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <BarChart className="w-4 h-4 text-blue-600" />
                  Biểu Đồ So Sánh Nhu Cầu Thực Tế vs Dự Báo (49 Ngày Test Out-of-Sample)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Dữ liệu kiểm thử từ 01/08/2026 đến 18/09/2026 (hoàn toàn out-of-sample).
                </p>
              </div>

              {/* Chú thích màu sắc */}
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-blue-700">
                  <span className="w-3 h-0.5 bg-blue-600 inline-block" /> Thực tế
                </span>
                <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <span className="w-3 h-0.5 bg-emerald-600 inline-block" /> Ridge
                </span>
                <span className="flex items-center gap-1.5 font-medium text-amber-700">
                  <span className="w-3 h-0.5 bg-amber-500 inline-block stroke-dashed" /> Baseline
                </span>
              </div>
            </div>

            {chartSvgData && (
              <div className="relative overflow-x-auto">
                <svg
                  viewBox={`0 0 ${chartSvgData.width} ${chartSvgData.height}`}
                  className="w-full h-auto max-h-72"
                >
                  {/* Đường lưới Y */}
                  {chartSvgData.yTicks.map((val) => {
                    const y = chartSvgData.getY(val);
                    return (
                      <g key={val}>
                        <line
                          x1={chartSvgData.padding.left}
                          y1={y}
                          x2={chartSvgData.width - chartSvgData.padding.right}
                          y2={y}
                          stroke="#f1f5f9"
                          strokeWidth="1"
                        />
                        <text
                          x={chartSvgData.padding.left - 8}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="10"
                          fill="#94a3b8"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* Baseline (Amber) */}
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    points={chartSvgData.basePoints}
                  />

                  {/* Ridge (Emerald) */}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    points={chartSvgData.ridgePoints}
                  />

                  {/* Thực tế (Blue) */}
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    points={chartSvgData.actualPoints}
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Bảng Dữ Liệu Chi Tiết */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div className="text-xs text-slate-600 font-medium">
                Hiển thị <span className="font-bold text-slate-800">{forecastItems.length}</span> / {totalItems.toLocaleString()} dòng
                {filteredSummary.maeRidge > 0 && (
                  <span className="ml-2 font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                    MAE Lọc: Ridge {filteredSummary.maeRidge} vs Baseline {filteredSummary.maeBaseline}
                  </span>
                )}
              </div>

              {/* Điều khiển phân trang */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">
                  Trang {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1 || tableLoading}
                  className="p-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || tableLoading}
                  className="p-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100/75 text-slate-700 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Ngày</th>
                    <th className="py-3 px-4">Kho</th>
                    <th className="py-3 px-4">Mã SP</th>
                    <th className="py-3 px-4 text-right">Thực tế xuất</th>
                    <th className="py-3 px-4 text-right">Dự báo Baseline</th>
                    <th className="py-3 px-4 text-right">Dự báo Ridge</th>
                    <th className="py-3 px-4 text-right">Dự báo RF</th>
                    <th className="py-3 px-4 text-right">Dự báo LightGBM</th>
                    <th className="py-3 px-4 text-center">Đánh giá</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableLoading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                        Đang tải danh sách bản ghi dự báo...
                      </td>
                    </tr>
                  ) : forecastItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <Info className="w-5 h-5 mx-auto mb-2 text-slate-400" />
                        Không có bản ghi nào khớp với điều kiện lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    forecastItems.map((item, index) => {
                      const diffRidge = Math.abs(item.thuc_te - item.du_bao_ridge);
                      const isGood = diffRidge <= 5;
                      return (
                        <tr key={index} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-slate-700">{item.ngay}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-slate-100 text-slate-700">
                              {item.ma_kho}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">{item.ma_sp}</td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-blue-600 text-sm">
                            {item.thuc_te}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-500">{item.du_bao_baseline}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600">
                            {item.du_bao_ridge}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-600">{item.du_bao_rf}</td>
                          <td className="py-3 px-4 text-right font-mono text-indigo-600 font-semibold">
                            {item.du_bao_lgb ?? item.du_bao_rf}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isGood ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {isGood ? 'Chính xác cao' : `Lệch ${diffRidge.toFixed(1)}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: PHƯƠNG PHÁP LUẬN & GIỚI HẠN NGHIỆP VỤ */}
      {/* ============================================================== */}
      {activeTab === 'methodology' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6 text-xs text-slate-700 leading-relaxed">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              Phương Pháp Luận & Ràng Buộc Khoa Học Trong Hệ Thống Hỗ Trợ Quyết Định Kho
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              Bảo đảm nguyên tắc thực nghiệm khách quan, chống rò rỉ dữ liệu (No Data Leakage) và tôn trọng nghiệp vụ thực tế.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Boxes className="w-4 h-4 text-amber-600" />
                1. Phương Pháp Phân Loại ABC-XYZ
              </h4>
              <ul className="list-disc pl-5 space-y-2 text-slate-600">
                <li>
                  <span className="font-semibold text-slate-800">Phân loại ABC:</span> Xếp hạng theo doanh thu thực tế lũy kế từ dữ liệu lịch sử xuất kho; ngưỡng Pareto: Nhóm A (&le; 80%), Nhóm B (80% - 95%), Nhóm C (&gt; 95%). Tuyệt đối không bịa đặt doanh thu giả.
                </li>
                <li>
                  <span className="font-semibold text-slate-800">Phân loại XYZ:</span> Đánh giá độ biến động nhu cầu bằng hệ số biến thiên $CV = \sigma / \mu$ trên chuỗi nhu cầu ngày; xử lý an toàn mẫu nhu cầu rỗng ($CV = 0$ khi không biến động).
                </li>
                <li>
                  <span className="font-semibold text-slate-800">Giới hạn bố trí:</span> Chỉ đề xuất nguyên tắc lưu kho và chính sách tồn kho an toàn; không tự ý khẳng định đã tối ưu tọa độ kệ 3D khi database chưa có sơ đồ không gian.
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                2. Khai Phá Giỏ Hàng (Apriori Market Basket)
              </h4>
              <ul className="list-disc pl-5 space-y-2 text-slate-600">
                <li>
                  <span className="font-semibold text-slate-800">Định nghĩa giao dịch:</span> Mỗi phiếu xuất hợp lệ là một giao dịch độc lập chứa tập các sản phẩm xuất cùng nhau.
                </li>
                <li>
                  <span className="font-semibold text-slate-800">Các chỉ số cốt lõi:</span> Support (tỷ lệ đồng xuất hiện), Confidence (xác suất có điều kiện), Lift (độ tương quan vượt trội so với độc lập).
                </li>
                <li>
                  <span className="font-semibold text-slate-800">Ý nghĩa thực tiễn:</span> Gợi ý bố trí các cặp sản phẩm có Lift cao tại các vị trí kệ gần nhau để tối ưu hóa quãng đường gom hàng (picking route).
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
