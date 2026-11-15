import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useAuth } from '../contexts/AuthContext';
import slottingApi from '../services/slottingApi';
import type {
  SlottingOverviewData,
  StorageBinItem,
  SlottingAdvisorData,
  SlottingRecommendationItem,
  StorageBinFilters,
} from '../types';
import {
  MapPin,
  RefreshCw,
  Building2,
  Layers,
  Package,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Search,
  Filter,
  ArrowRightLeft,
  X,
  Sparkles,
  TrendingUp,
  Info,
  Box,
  Compass,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export default function WarehouseMap() {
  const { selectedWarehouse, setSelectedWarehouse, isWarehouseLocked } = useWarehouse();
  const { user } = useAuth();

  // Kiểm tra quyền đổi kho (chỉ dành cho trung tâm)
  const canSwitchWarehouse =
    user?.vai_tro === 'ADMIN' ||
    user?.vai_tro === 'DIEU_PHOI' ||
    user?.vai_tro === 'DATA_ANALYST';

  // Kiểm tra quyền thực hiện Move Bin
  const canMoveBin =
    user?.vai_tro === 'ADMIN' ||
    user?.vai_tro === 'DIEU_PHOI' ||
    user?.vai_tro === 'QUAN_LY_KHO' ||
    user?.vai_tro === 'NHAN_VIEN_KHO';

  // State dữ liệu chính từ API
  const [overview, setOverview] = useState<SlottingOverviewData | null>(null);
  const [bins, setBins] = useState<StorageBinItem[]>([]);
  const [advisor, setAdvisor] = useState<SlottingAdvisorData | null>(null);
  const [selectedBin, setSelectedBin] = useState<StorageBinItem | null>(null);

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bộ lọc
  const [filterRack, setFilterRack] = useState<string>('ALL');
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [filterZone, setFilterZone] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [onlyOccupied, setOnlyOccupied] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Tab hiển thị
  const [activeTab, setActiveTab] = useState<'map' | 'advisor'>('map');

  // State Modal Move Bin
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [moveSourceBin, setMoveSourceBin] = useState<StorageBinItem | null>(null);
  const [moveTargetBinCode, setMoveTargetBinCode] = useState<string>('');
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveMessage, setMoveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tải dữ liệu toàn bộ phân hệ từ Backend API
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);

    try {
      const filters: StorageBinFilters = {};
      if (filterZone !== 'ALL') filters.vung_luu_tru = filterZone;
      if (filterStatus !== 'ALL') filters.trang_thai = filterStatus;
      if (filterRack !== 'ALL') filters.day_ke = filterRack;
      if (filterLevel !== 'ALL') filters.tang = Number(filterLevel);
      if (onlyOccupied) filters.only_occupied = true;

      const [overviewData, binsData, advisorData] = await Promise.all([
        slottingApi.getOverview(selectedWarehouse),
        slottingApi.getBins(selectedWarehouse, filters),
        slottingApi.getAdvisor(selectedWarehouse),
      ]);

      setOverview(overviewData);
      setBins(binsData);
      setAdvisor(advisorData);

      // Cập nhật selectedBin nếu đang chọn
      if (selectedBin) {
        const updated = binsData.find((b) => b.ma_vi_tri === selectedBin.ma_vi_tri);
        if (updated) setSelectedBin(updated);
      }
    } catch (err: any) {
      console.error('Lỗi tải dữ liệu Warehouse Slotting:', err);
      setError(err.response?.data?.message || err.message || 'Không thể kết nối đến máy chủ.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedWarehouse, filterZone, filterStatus, filterRack, filterLevel, onlyOccupied, selectedBin]);

  useEffect(() => {
    loadData();
  }, [selectedWarehouse, filterZone, filterStatus, filterRack, filterLevel, onlyOccupied]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  // Tra cứu xem ô kệ có nằm trong danh sách cảnh báo của Slotting Advisor không
  const advisorMap = useMemo(() => {
    const map = new Map<string, SlottingRecommendationItem>();
    if (advisor?.danh_sach_khuyen_nghi) {
      for (const rec of advisor.danh_sach_khuyen_nghi) {
        map.set(rec.ma_vi_tri_hien_tai, rec);
      }
    }
    return map;
  }, [advisor]);

  // Lọc bins hiển thị theo từ khóa tìm kiếm (mã vị trí, tên SP, SKU)
  const filteredBins = useMemo(() => {
    if (!searchTerm.trim()) return bins;
    const term = searchTerm.trim().toLowerCase();
    return bins.filter((b) => {
      const matchCode = b.ma_vi_tri.toLowerCase().includes(term);
      const matchSp = b.san_pham?.ten_sp.toLowerCase().includes(term);
      const matchSku = b.san_pham?.ma_sp.toLowerCase().includes(term);
      return matchCode || matchSp || matchSku;
    });
  }, [bins, searchTerm]);

  // Gom nhóm bins theo Dãy kệ (A, B, C) -> Tầng (5 đến 1) -> Ngăn (1 đến 3)
  const racksData = useMemo(() => {
    const racks: Record<string, Record<number, StorageBinItem[]>> = {
      A: { 5: [], 4: [], 3: [], 2: [], 1: [] },
      B: { 5: [], 4: [], 3: [], 2: [], 1: [] },
      C: { 5: [], 4: [], 3: [], 2: [], 1: [] },
    };

    for (const b of filteredBins) {
      if (racks[b.day_ke] && racks[b.day_ke][b.tang]) {
        racks[b.day_ke][b.tang].push(b);
      }
    }

    // Sắp xếp các ngăn 1, 2, 3 tăng dần
    for (const r of ['A', 'B', 'C']) {
      for (let t = 1; t <= 5; t++) {
        racks[r][t].sort((x, y) => x.ngan - y.ngan);
      }
    }

    return racks;
  }, [filteredBins]);

  // Danh sách các ô trống có thể nhận hàng (cho Move Bin)
  const availableTargetBins = useMemo(() => {
    return bins.filter((b) => b.trang_thai === 'ACTIVE' && b.so_luong_hien_tai === 0);
  }, [bins]);

  // Mở modal Move Bin cho ô được chọn
  const handleOpenMoveModal = (sourceBin: StorageBinItem, targetSuggestion?: string) => {
    setMoveSourceBin(sourceBin);
    setMoveTargetBinCode(targetSuggestion || '');
    setMoveMessage(null);
    setIsMoveModalOpen(true);
  };

  // Thực hiện Move Bin
  const handleConfirmMove = async () => {
    if (!moveSourceBin || !moveTargetBinCode) {
      setMoveMessage({ type: 'error', text: 'Vui lòng chọn ô kệ đích.' });
      return;
    }

    if (!moveSourceBin.san_pham) {
      setMoveMessage({ type: 'error', text: 'Ô nguồn không có sản phẩm để di chuyển.' });
      return;
    }

    setMoveLoading(true);
    setMoveMessage(null);

    try {
      const res = await slottingApi.moveBin({
        ma_kho: selectedWarehouse,
        ma_sp: moveSourceBin.san_pham.ma_sp,
        from_bin: moveSourceBin.ma_vi_tri,
        to_bin: moveTargetBinCode,
        so_luong: moveSourceBin.so_luong_hien_tai, // Single-bin policy: chuyển toàn bộ
      });

      setMoveMessage({ type: 'success', text: res.message || 'Di chuyển thành công!' });
      // Tải lại dữ liệu ngay sau khi di chuyển
      await loadData(true);

      setTimeout(() => {
        setIsMoveModalOpen(false);
        setMoveMessage(null);
      }, 1500);
    } catch (err: any) {
      setMoveMessage({
        type: 'error',
        text: err.response?.data?.message || err.message || 'Lỗi khi di chuyển sản phẩm.',
      });
    } finally {
      setMoveLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* 1. HEADER & WAREHOUSE SELECTOR */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-800 tracking-tight">SƠ ĐỒ VỊ TRÍ KỆ HÀNG (WAREHOUSE SLOTTING)</h1>
              <span className="px-2.5 py-0.5 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                Phase 6 Core
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Quản lý 45 ô lưu trữ, giám sát tỷ lệ lấp đầy và tối ưu hóa bố trí Golden Zone theo ma trận ABC-XYZ.
            </p>
          </div>
        </div>

        {/* Warehouse Selector & Actions */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            <Building2 className="w-4 h-4 text-slate-500 ml-2" />
            <span className="text-xs font-semibold text-slate-600">Kho:</span>
            {canSwitchWarehouse && !isWarehouseLocked ? (
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="bg-white border border-slate-300 text-xs font-bold text-slate-800 rounded-lg px-3 py-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="HN01">HN01 · Kho Hà Nội</option>
                <option value="DN01">DN01 · Kho Đà Nẵng</option>
                <option value="HCM01">HCM01 · Kho TP. Hồ Chí Minh</option>
              </select>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 text-slate-800 rounded-lg text-xs font-bold">
                <span>{selectedWarehouse}</span>
                <span className="text-[10px] text-slate-500 font-medium">(Trực thuộc)</span>
              </div>
            )}
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition-all"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>{refreshing ? 'Đang tải...' : 'Làm mới'}</span>
          </button>
        </div>
      </div>

      {/* LOADING STATE */}
      {loading && !overview && (
        <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="text-xs font-bold text-slate-600">Đang tải dữ liệu sơ đồ vị trí kho {selectedWarehouse}...</span>
        </div>
      )}

      {/* ERROR ALERT */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-red-700 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => loadData()} className="font-bold underline hover:text-red-900">
            Thử lại
          </button>
        </div>
      )}

      {/* 2. OVERVIEW KPI CARDS (7 METRICS) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Tổng số ô */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng Số Ô</span>
            <span className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
              <Layers className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2">{overview?.total_bins ?? 45}</div>
          <div className="text-[11px] text-slate-400 mt-1">3 Dãy × 5 Tầng × 3 Ngăn</div>
        </div>

        {/* Ô có hàng */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Ô Có Hàng</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Package className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-2">{overview?.used_bins ?? 0}</div>
          <div className="text-[11px] text-slate-400 mt-1">Lưu trữ 20 mặt hàng</div>
        </div>

        {/* Ô trống */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Ô Trống</span>
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Box className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-blue-600 mt-2">{overview?.empty_bins ?? 0}</div>
          <div className="text-[11px] text-slate-400 mt-1">Sẵn sàng nhận hàng</div>
        </div>

        {/* Ô bảo trì */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Ô Bảo Trì</span>
            <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Wrench className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-amber-600 mt-2">{overview?.maintenance_bins ?? 0}</div>
          <div className="text-[11px] text-slate-400 mt-1">Tạm dừng tiếp nhận</div>
        </div>

        {/* Tổng SKU */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng Số SKU</span>
            <span className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
              <ShieldCheck className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-purple-600 mt-2">{overview?.total_skus ?? 0}</div>
          <div className="text-[11px] text-slate-400 mt-1">Single-bin per SKU</div>
        </div>

        {/* Tỷ lệ chiếm dụng ô */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Chiếm Dụng Ô</span>
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-indigo-600 mt-2">
            {overview?.occupancy_rate ?? 0}%
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(overview?.occupancy_rate || 0, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Tỷ lệ sử dụng sức chứa */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sử Dụng Sức Chứa</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Zap className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2">
            {overview?.space_utilization_rate ?? 0}%
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(overview?.space_utilization_rate || 0, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* 3. NAVIGATION TABS & FILTER TOOLBAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-3">
          {/* Main Navigation Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('map')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'map'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Sơ Đồ Kệ 2D (Slotting Layout)</span>
            </button>

            <button
              onClick={() => setActiveTab('advisor')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all relative ${
                activeTab === 'advisor'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Slotting Advisor (Đề Xuất Tối Ưu)</span>
              {(advisor?.tong_so_khuyen_nghi ?? 0) > 0 && (
                <span className="px-1.5 py-0.2 bg-red-500 text-white text-[10px] font-black rounded-full animate-pulse">
                  {advisor?.tong_so_khuyen_nghi}
                </span>
              )}
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm mã ô, tên SP, SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Filter Toolbar (Chỉ hiển thị khi xem tab map) */}
        {activeTab === 'map' && (
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="flex items-center gap-1 font-bold text-slate-500">
              <Filter className="w-3.5 h-3.5" /> Bộ Lọc:
            </span>

            {/* Dãy kệ */}
            <select
              value={filterRack}
              onChange={(e) => setFilterRack(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-semibold focus:outline-none"
            >
              <option value="ALL">Tất Cả Dãy (A, B, C)</option>
              <option value="A">Dãy Kệ A</option>
              <option value="B">Dãy Kệ B</option>
              <option value="C">Dãy Kệ C</option>
            </select>

            {/* Tầng */}
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-semibold focus:outline-none"
            >
              <option value="ALL">Tất Cả Tầng (1 - 5)</option>
              <option value="5">Tầng 5 (Top Storage)</option>
              <option value="4">Tầng 4 (Mid Zone)</option>
              <option value="3">Tầng 3 (Mid Zone)</option>
              <option value="2">Tầng 2 (Golden Zone)</option>
              <option value="1">Tầng 1 (Golden Zone)</option>
            </select>

            {/* Vùng lưu trữ */}
            <select
              value={filterZone}
              onChange={(e) => setFilterZone(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-semibold focus:outline-none"
            >
              <option value="ALL">Tất Cả Vùng (Zone)</option>
              <option value="GOLDEN_ZONE">🌟 Golden Zone (Tầng 1-2)</option>
              <option value="MID_ZONE">📦 Mid Zone (Tầng 3-4)</option>
              <option value="TOP_STORAGE">🏗️ Top Storage (Tầng 5)</option>
            </select>

            {/* Trạng thái */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-semibold focus:outline-none"
            >
              <option value="ALL">Tất Cả Trạng Thái</option>
              <option value="ACTIVE">Hoạt Động (ACTIVE)</option>
              <option value="MAINTENANCE">Bảo Trì (MAINTENANCE)</option>
            </select>

            {/* Chỉ ô có hàng */}
            <label className="flex items-center gap-1.5 cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg text-slate-700 font-semibold select-none">
              <input
                type="checkbox"
                checked={onlyOccupied}
                onChange={(e) => setOnlyOccupied(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Chỉ Ô Có Hàng</span>
            </label>

            {/* Nút reset lọc */}
            {(filterRack !== 'ALL' || filterLevel !== 'ALL' || filterZone !== 'ALL' || filterStatus !== 'ALL' || onlyOccupied || searchTerm) && (
              <button
                onClick={() => {
                  setFilterRack('ALL');
                  setFilterLevel('ALL');
                  setFilterZone('ALL');
                  setFilterStatus('ALL');
                  setOnlyOccupied(false);
                  setSearchTerm('');
                }}
                className="text-blue-600 hover:text-blue-800 font-bold ml-auto"
              >
                Đặt Lại Lọc
              </button>
            )}
          </div>
        )}
      </div>

      {/* 4. MAIN CONTENT AREA */}
      {activeTab === 'map' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* A. SƠ ĐỒ KỆ HÀNG 2D (9 CỘT) */}
          <div className="xl:col-span-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-black text-slate-800 tracking-tight">SƠ ĐỒ LƯỚI 3 DÃY KỆ (A - B - C)</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Quy cách: 5 tầng (Tầng 5 trên cùng, Tầng 1 dưới cùng), mỗi tầng có 3 ngăn chứa.
                </p>
              </div>

              {/* Chú giải trạng thái */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-emerald-100 border border-emerald-400 rounded"></span> Có hàng
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-slate-100 border border-slate-300 rounded"></span> Ô trống
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-amber-100 border border-amber-400 rounded"></span> Bảo trì
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span> Advisor
                </span>
              </div>
            </div>

            {/* Bố cục 3 Dãy kệ song song */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {['A', 'B', 'C'].map((rackName) => (
                <div key={rackName} className="bg-slate-50/60 p-4 rounded-2xl border border-slate-200 space-y-3">
                  {/* Rack Header */}
                  <div className="flex justify-between items-center bg-slate-800 text-white px-3 py-2 rounded-xl">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-400" />
                      <span className="font-black text-xs tracking-wider">DÃY KỆ {rackName}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">15 Vị Trí</span>
                  </div>

                  {/* 5 Tầng theo thứ tự từ trên xuống dưới: 5 -> 4 -> 3 -> 2 -> 1 */}
                  <div className="space-y-2.5">
                    {[5, 4, 3, 2, 1].map((levelNum) => {
                      const levelBins = racksData[rackName]?.[levelNum] || [];
                      const isGolden = levelNum <= 2;
                      const isTop = levelNum === 5;

                      return (
                        <div key={levelNum} className="space-y-1">
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 px-1">
                            <span>Tầng {levelNum}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                              isGolden ? 'bg-amber-100 text-amber-800' : isTop ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {isGolden ? 'Golden Zone' : isTop ? 'Top Storage' : 'Mid Zone'}
                            </span>
                          </div>

                          {/* 3 Ngăn trong 1 Tầng */}
                          <div className="grid grid-cols-3 gap-2">
                            {levelBins.map((bin) => {
                              const isOccupied = bin.so_luong_hien_tai > 0;
                              const isMaintenance = bin.trang_thai === 'MAINTENANCE';
                              const isSelected = selectedBin?.ma_vi_tri === bin.ma_vi_tri;
                              const rec = advisorMap.get(bin.ma_vi_tri);

                              // Màu sắc theo trạng thái
                              let cellBg = 'bg-white border-slate-200 text-slate-700 hover:border-slate-300';
                              if (isMaintenance) {
                                cellBg = 'bg-amber-50/70 border-amber-300 text-amber-900';
                              } else if (isOccupied) {
                                cellBg = 'bg-emerald-50/80 border-emerald-300 text-emerald-950 hover:border-emerald-400';
                              }

                              if (isSelected) {
                                cellBg += ' ring-2 ring-blue-600 border-blue-600 shadow-md';
                              }

                              return (
                                <button
                                  key={bin.ma_vi_tri}
                                  onClick={() => setSelectedBin(bin)}
                                  className={`p-2 rounded-xl border text-left flex flex-col justify-between h-20 transition-all cursor-pointer relative group ${cellBg}`}
                                  title={`${bin.ma_vi_tri}: ${bin.san_pham?.ten_sp || (isMaintenance ? 'Bảo trì' : 'Ô trống')}`}
                                >
                                  {/* Cảnh báo Advisor (nếu có) */}
                                  {rec && (
                                    <span
                                      className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full animate-pulse"
                                      title={`Gợi ý tối ưu: ${rec.ly_do_de_xuat}`}
                                    />
                                  )}

                                  <div className="flex justify-between items-start w-full">
                                    <span className="font-black text-[11px] tracking-tight">{bin.ma_vi_tri.split('-').slice(1).join('-')}</span>
                                    <span className={`text-[8px] font-black px-1 rounded ${
                                      isMaintenance ? 'bg-amber-200 text-amber-900' : isOccupied ? 'bg-emerald-200 text-emerald-900' : 'bg-slate-200 text-slate-700'
                                    }`}>
                                      {isMaintenance ? 'M' : isOccupied ? `${bin.ty_le_lap_day}%` : 'T'}
                                    </span>
                                  </div>

                                  {/* Tên SP hoặc tình trạng */}
                                  <div className="text-[10px] leading-tight font-medium truncate w-full mt-1">
                                    {isMaintenance ? (
                                      <span className="text-amber-700 font-bold flex items-center gap-0.5">
                                        <Wrench className="w-2.5 h-2.5 inline" /> Bảo trì
                                      </span>
                                    ) : isOccupied ? (
                                      <span className="font-bold text-slate-800 truncate block">
                                        {bin.san_pham?.ten_sp}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 italic">Trống</span>
                                    )}
                                  </div>

                                  {/* Mini Progress Bar lấp đầy */}
                                  <div className="w-full bg-slate-200/60 h-1 rounded-full overflow-hidden mt-1">
                                    <div
                                      className={`h-full rounded-full ${
                                        isMaintenance
                                          ? 'bg-amber-500'
                                          : bin.ty_le_lap_day > 80
                                          ? 'bg-red-500'
                                          : 'bg-emerald-500'
                                      }`}
                                      style={{ width: `${Math.min(bin.ty_le_lap_day, 100)}%` }}
                                    />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* B. CHI TIẾT Ô VỊ TRÍ KỆ (BIN DETAIL SIDEBAR - 4 CỘT) */}
          <div className="xl:col-span-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6 sticky top-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-base tracking-tight">CHI TIẾT Ô VỊ TRÍ</h3>
              </div>
              {selectedBin && (
                <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${
                  selectedBin.trang_thai === 'MAINTENANCE'
                    ? 'bg-amber-100 text-amber-800'
                    : selectedBin.so_luong_hien_tai > 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {selectedBin.trang_thai === 'MAINTENANCE' ? 'Đang bảo trì' : selectedBin.so_luong_hien_tai > 0 ? 'Có hàng' : 'Ô trống'}
                </span>
              )}
            </div>

            {selectedBin ? (
              <div className="space-y-5 text-xs">
                {/* Thông số vị trí */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Mã Vị Trí:</span>
                    <span className="font-black text-slate-900 text-sm">{selectedBin.ma_vi_tri}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Kho Sở Hữu:</span>
                    <span className="font-bold text-slate-800">{selectedBin.ma_kho}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Tọa Độ Vật Lý:</span>
                    <span className="font-bold text-slate-800">
                      Dãy {selectedBin.day_ke} · Tầng {selectedBin.tang} · Ngăn {selectedBin.ngan}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Phân Vùng Lưu Trữ:</span>
                    <span className={`font-black px-2 py-0.5 rounded text-[10px] ${
                      selectedBin.vung_luu_tru === 'GOLDEN_ZONE'
                        ? 'bg-amber-100 text-amber-800'
                        : selectedBin.vung_luu_tru === 'TOP_STORAGE'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {selectedBin.vung_luu_tru}
                    </span>
                  </div>
                </div>

                {/* Sức chứa và độ đầy */}
                <div className="space-y-2">
                  <div className="flex justify-between text-slate-500">
                    <span>Độ Lấp Đầy Ô:</span>
                    <span className="font-black text-slate-800">
                      {selectedBin.so_luong_hien_tai.toLocaleString()} / {selectedBin.suc_chua_toi_da.toLocaleString()} units ({selectedBin.ty_le_lap_day}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        selectedBin.trang_thai === 'MAINTENANCE'
                          ? 'bg-amber-500'
                          : selectedBin.ty_le_lap_day > 80
                          ? 'bg-red-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(selectedBin.ty_le_lap_day, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Thông tin sản phẩm trong ô */}
                {selectedBin.san_pham ? (
                  <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-black text-slate-900 text-sm">{selectedBin.san_pham.ten_sp}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">SKU: {selectedBin.san_pham.ma_sp}</div>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-200 text-emerald-900 font-black rounded text-[10px]">
                        {selectedBin.san_pham.don_vi_tinh || 'Cái'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-emerald-200/60">
                      <span className="text-slate-600 font-medium">Tồn Kho Tại Ô:</span>
                      <span className="font-black text-emerald-700 text-base">
                        {selectedBin.san_pham.so_luong.toLocaleString()} units
                      </span>
                    </div>

                    {/* Nút hành động Move Bin */}
                    {canMoveBin && (
                      <button
                        onClick={() => handleOpenMoveModal(selectedBin)}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer mt-2"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Di Chuyển Hàng (Move Bin)</span>
                      </button>
                    )}
                  </div>
                ) : selectedBin.trang_thai === 'MAINTENANCE' ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <Wrench className="w-4 h-4 text-amber-600" />
                      <span>Ô Đang Bảo Trì Kỹ Thuật</span>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      Vị trí này đang tạm ngưng tiếp nhận hàng hóa để phục vụ kiểm tra khung giá đỡ và thiết bị an toàn.
                    </p>
                  </div>
                ) : (
                  <div className="p-5 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-slate-500 space-y-1.5">
                    <Box className="w-8 h-8 text-slate-400 mx-auto" />
                    <div className="font-bold text-slate-700">Ô Kệ Đang Trống</div>
                    <p className="text-[11px] text-slate-400">
                      Vị trí này sẵn sàng tiếp nhận hàng nhập mới hoặc di chuyển hàng từ ô khác sang.
                    </p>
                  </div>
                )}

                {/* Nếu có khuyến nghị từ Advisor cho ô này */}
                {advisorMap.has(selectedBin.ma_vi_tri) && (
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-1.5 text-purple-800 font-bold">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      <span>Đề Xuất Từ Slotting Advisor:</span>
                    </div>
                    <p className="text-[11px] text-purple-900 leading-relaxed">
                      {advisorMap.get(selectedBin.ma_vi_tri)?.ly_do_de_xuat}
                    </p>
                    {advisorMap.get(selectedBin.ma_vi_tri)?.o_ke_goi_y.length! > 0 && (
                      <div className="pt-1">
                        <span className="text-[10px] text-purple-700 font-semibold">Gợi ý ô trống: </span>
                        <span className="font-mono font-bold text-purple-900">
                          {advisorMap.get(selectedBin.ma_vi_tri)?.o_ke_goi_y.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <Compass className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="font-bold text-slate-600">Chưa Chọn Ô Kệ</div>
                <p className="text-[11px]">Nhấn vào bất kỳ ô nào trên sơ đồ lưới để xem chi tiết sản phẩm và sức chứa.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* C. SLOTTING ADVISOR TAB (DANH SÁCH ĐỀ XUẤT TỐI ƯU) */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h2 className="text-base font-black text-slate-800 tracking-tight">SLOTTING ADVISOR · TỐI ƯU BỐ TRÍ VỊ TRÍ HÀNG HÓA</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Phát hiện các mặt hàng xếp sai vùng lưu trữ dựa trên tần suất xuất kho và phân loại ABC-XYZ thực tế từ hệ thống.
              </p>
            </div>

            <span className="px-3 py-1 bg-purple-100 text-purple-800 font-black rounded-xl text-xs">
              {advisor?.tong_so_khuyen_nghi ?? 0} Đề Xuất
            </span>
          </div>

          {advisor?.danh_sach_khuyen_nghi && advisor.danh_sach_khuyen_nghi.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {advisor.danh_sach_khuyen_nghi.map((item) => {
                const sourceBinObj = bins.find((b) => b.ma_vi_tri === item.ma_vi_tri_hien_tai);

                return (
                  <div
                    key={item.ma_sp}
                    className="p-5 rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50/40 to-white shadow-sm space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 text-sm">{item.ten_sp}</span>
                          <span className="text-xs font-mono font-bold text-slate-500">({item.ma_sp})</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded">
                            Nhóm: {item.nhom_abc_xyz || item.nhom_abc || 'A'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Xuất: <strong className="text-slate-800">{item.tong_luong_xuat.toLocaleString()} units</strong> ({item.so_dong_xuat} dòng phiếu)
                          </span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${
                        item.muc_do_uu_tien === 'CAO' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        Ưu tiên: {item.muc_do_uu_tien}
                      </span>
                    </div>

                    {/* So sánh Vị trí Hiện tại vs Đề xuất */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-white rounded-xl border border-slate-200/70 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Vị trí hiện tại:</span>
                        <div className="font-black text-slate-800 mt-0.5">{item.ma_vi_tri_hien_tai}</div>
                        <span className="text-[10px] text-purple-700 font-semibold">{item.vung_hien_tai} (T{item.tang_hien_tai})</span>
                      </div>
                      <div className="border-l border-slate-100 pl-3">
                        <span className="text-slate-400 block text-[10px]">Vùng đề xuất:</span>
                        <div className="font-black text-emerald-700 mt-0.5">{item.vung_de_xuat}</div>
                        <span className="text-[10px] text-emerald-600 font-semibold">Tối ưu lấy hàng</span>
                      </div>
                    </div>

                    {/* Lý do chi tiết */}
                    <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {item.ly_do_de_xuat}
                    </p>

                    {/* Ô trống gợi ý & Nút thực hiện Move */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2 border-t border-purple-100">
                      <div className="text-xs">
                        <span className="text-slate-500 font-medium">Ô trống phù hợp: </span>
                        {item.o_ke_goi_y.length > 0 ? (
                          <span className="font-mono font-bold text-blue-700">{item.o_ke_goi_y.join(', ')}</span>
                        ) : (
                          <span className="text-slate-400 italic">Chưa có ô trống khả dụng</span>
                        )}
                      </div>

                      {canMoveBin && sourceBinObj && (
                        <button
                          onClick={() => handleOpenMoveModal(sourceBinObj, item.o_ke_goi_y[0])}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>Áp Dụng Di Chuyển</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <div className="font-bold text-slate-700 text-base">Kho Đang Ở Trạng Thái Bố Trí Tối Ưu!</div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Tất cả các sản phẩm luân chuyển cao đã được đặt tại Golden Zone và các mặt hàng ít xuất đang được lưu trữ hợp lý tại tầng cao.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 5. MODAL DI CHUYỂN HÀNG (MOVE BIN MODAL) */}
      {isMoveModalOpen && moveSourceBin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-scaleUp">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-base">DI CHUYỂN SẢN PHẨM GIỮA CÁC Ô</h3>
                  <p className="text-[11px] text-slate-500">Kho thao tác: {selectedWarehouse}</p>
                </div>
              </div>
              <button
                onClick={() => setIsMoveModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {moveMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  moveMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {moveMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{moveMessage.text}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Thông tin mặt hàng di chuyển */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="text-slate-500 font-medium">Sản phẩm di chuyển:</div>
                <div className="font-black text-slate-900 text-sm">{moveSourceBin.san_pham?.ten_sp}</div>
                <div className="flex justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-200">
                  <span>Mã SKU: <strong className="text-slate-800">{moveSourceBin.san_pham?.ma_sp}</strong></span>
                  <span>Số lượng: <strong className="text-blue-700">{moveSourceBin.so_luong_hien_tai.toLocaleString()} units</strong></span>
                </div>
              </div>

              {/* Ô nguồn */}
              <div>
                <label className="block text-slate-500 font-bold mb-1">Ô Nguồn (From Bin):</label>
                <input
                  type="text"
                  disabled
                  value={`${moveSourceBin.ma_vi_tri} (${moveSourceBin.vung_luu_tru})`}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-700 cursor-not-allowed"
                />
              </div>

              {/* Ô đích */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Chọn Ô Đích (To Bin) · Chỉ ô trống ACTIVE:
                </label>
                <select
                  value={moveTargetBinCode}
                  onChange={(e) => setMoveTargetBinCode(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Chọn một ô kệ trống --</option>
                  {availableTargetBins.map((tb) => (
                    <option key={tb.ma_vi_tri} value={tb.ma_vi_tri}>
                      {tb.ma_vi_tri} · {tb.vung_luu_tru} · Sức chứa: {tb.suc_chua_toi_da.toLocaleString()}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Chỉ hiển thị các ô đang hoạt động (ACTIVE) và chưa có hàng.
                </span>
              </div>

              {/* Quy định nghiệp vụ Single-Bin */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] flex gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Chính sách Single-Bin:</strong> Để bảo đảm tính nhất quán với bảng <code>ton_kho</code>, hệ thống sẽ di chuyển toàn bộ {moveSourceBin.so_luong_hien_tai.toLocaleString()} sản phẩm sang vị trí mới trong một giao dịch cơ sở dữ liệu duy nhất.
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsMoveModalOpen(false)}
                disabled={moveLoading}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmMove}
                disabled={moveLoading || !moveTargetBinCode}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                {moveLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{moveLoading ? 'Đang Xử Lý...' : 'Xác Nhận Di Chuyển'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
