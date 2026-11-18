import React, { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useWarehouse } from '../contexts/WarehouseContext';
import type { MasterData, TransferListItem } from '../types';
import {
  ArrowRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Package,
  Truck,
  ShieldCheck,
  Inbox,
  AlertTriangle,
  RotateCcw,
  PlusCircle,
  Check,
  Send,
  Search,
  Eye,
} from 'lucide-react';
import {
  PageHeader,
  StatCard,
  DocumentStatusBadge,
  SagaStatusBadge,
  StatusBadge,
  EmptyState,
  ConfirmModal,
  DetailDrawer,
} from '../components/ui';

export default function Transfer() {
  const { user } = useAuth();
  const { selectedWarehouse } = useWarehouse();

  const userRole = user?.vai_tro;
  const userKho = user?.ma_kho;
  const canCreateTransfer = userRole === 'DIEU_PHOI';

  // Master data
  const [master, setMaster] = useState<MasterData | null>(null);
  const [loadingMaster, setLoadingMaster] = useState<boolean>(true);

  // Sinh mã phiếu theo chuẩn quy cách WMS: DC_[MA_KHO]_[YYMMDD]_[4_RANDOM]
  const generateTransferCode = (khoXuat: string) => {
    const prefix = 'DC';
    const kho = khoXuat || 'HN01';
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}_${kho}_${dateStr}_${randomSuffix}`;
  };

  // Form state
  const [formData, setFormData] = useState({
    ma_phieu_dc: generateTransferCode(selectedWarehouse === 'ALL' ? 'HN01' : selectedWarehouse || 'HN01'),
    kho_xuat: selectedWarehouse === 'ALL' ? 'HN01' : selectedWarehouse || 'HN01',
    kho_nhap: selectedWarehouse === 'HN01' ? 'DN01' : 'HN01',
    ma_sp: '',
    so_luong: 1,
  });

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error' | ''; text: string }>({
    type: '',
    text: '',
  });

  // Table & Filter state
  const [transfers, setTransfers] = useState<TransferListItem[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState<boolean>(false);
  const [transfersError, setTransfersError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterWarehouse, setFilterWarehouse] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Selected item for Detail Drawer
  const [selectedTransfer, setSelectedTransfer] = useState<TransferListItem | null>(null);

  // Confirm Modal state
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    maPhieu: string;
    action: 'approve' | 'source-confirm' | 'source-ship' | 'destination-receive';
    actionLabel: string;
    item?: TransferListItem;
  }>({
    isOpen: false,
    maPhieu: '',
    action: 'approve',
    actionLabel: '',
  });
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionStatus, setActionStatus] = useState<{ type: 'success' | 'error' | ''; text: string }>({
    type: '',
    text: '',
  });

  // 1. Tải danh mục Master Data từ Backend
  const fetchMasterData = useCallback(async () => {
    setLoadingMaster(true);
    try {
      const res = await api.get('/master-data');
      const data: MasterData = res.data.data;
      setMaster(data);
      if (data?.san_pham?.length > 0) {
        setFormData((prev) => ({
          ...prev,
          ma_sp: prev.ma_sp || data.san_pham[0].ma_sp,
        }));
      }
    } catch (err: any) {
      console.error('Lỗi tải danh mục Master Data:', err);
    } finally {
      setLoadingMaster(false);
    }
  }, []);

  // 2. Tải danh sách phiếu điều chuyển từ Backend
  const fetchTransfers = useCallback(async () => {
    setLoadingTransfers(true);
    setTransfersError('');
    try {
      const params: Record<string, string> = {};
      if (filterWarehouse) {
        params.ma_kho = filterWarehouse;
      }
      if (filterStatus) {
        params.trang_thai = filterStatus;
      }

      const res = await api.get('/transfer', { params });
      setTransfers(res.data.data || []);
    } catch (err: any) {
      console.error('Lỗi tải danh sách phiếu điều chuyển:', err);
      setTransfersError(err.response?.data?.message || 'Không thể kết nối đến máy chủ để tải phiếu điều chuyển');
    } finally {
      setLoadingTransfers(false);
    }
  }, [filterWarehouse, filterStatus]);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  // Cập nhật mã phiếu khi đổi kho xuất
  const handleKhoXuatChange = (kho: string) => {
    let newKhoNhap = formData.kho_nhap;
    if (kho === newKhoNhap) {
      const availableKhos = (master?.danh_sach_kho || [
        { ma_kho: 'HN01' },
        { ma_kho: 'DN01' },
        { ma_kho: 'HCM01' },
      ]).map((k) => k.ma_kho);
      const other = availableKhos.find((k) => k !== kho);
      newKhoNhap = other || '';
    }
    setFormData((prev) => ({
      ...prev,
      kho_xuat: kho,
      kho_nhap: newKhoNhap,
      ma_phieu_dc: generateTransferCode(kho),
    }));
  };

  // Submit tạo phiếu điều chuyển mới
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus({ type: '', text: '' });

    if (!formData.ma_phieu_dc.trim()) {
      setFormStatus({ type: 'error', text: 'Vui lòng nhập mã phiếu điều chuyển!' });
      return;
    }

    if (formData.kho_xuat === formData.kho_nhap) {
      setFormStatus({ type: 'error', text: 'Kho xuất và kho nhập không được trùng nhau!' });
      return;
    }

    if (!formData.ma_sp) {
      setFormStatus({ type: 'error', text: 'Vui lòng chọn sản phẩm cần điều chuyển!' });
      return;
    }

    if (!formData.so_luong || formData.so_luong <= 0) {
      setFormStatus({ type: 'error', text: 'Số lượng điều chuyển phải lớn hơn 0!' });
      return;
    }

    setFormSubmitting(true);
    try {
      const payload = {
        ma_phieu_dc: formData.ma_phieu_dc.trim(),
        kho_xuat: formData.kho_xuat,
        kho_nhap: formData.kho_nhap,
        ma_sp: formData.ma_sp,
        so_luong: Number(formData.so_luong),
      };

      await api.post('/transfer', payload);

      setFormStatus({
        type: 'success',
        text: `Đã tạo thành công phiếu điều chuyển ${formData.ma_phieu_dc}!`,
      });

      // Tạo mã mới cho lần nhập tiếp theo
      setFormData((prev) => ({
        ...prev,
        ma_phieu_dc: generateTransferCode(prev.kho_xuat),
        so_luong: 1,
      }));

      fetchTransfers();
    } catch (err: any) {
      setFormStatus({
        type: 'error',
        text: `Lỗi: ${err.response?.data?.message || err.message}`,
      });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Mở modal xác nhận thao tác
  const openConfirmModal = (
    item: TransferListItem,
    action: 'approve' | 'source-confirm' | 'source-ship' | 'destination-receive',
    actionLabel: string
  ) => {
    setConfirmModalConfig({
      isOpen: true,
      maPhieu: item.ma_phieu_dc,
      action,
      actionLabel,
      item,
    });
  };

  // Thực thi thao tác vòng đời Saga sau khi xác nhận
  const executeConfirmedAction = async () => {
    const { maPhieu, action, actionLabel } = confirmModalConfig;
    if (!maPhieu) return;

    setActionLoading(true);
    setActionStatus({ type: '', text: '' });

    try {
      await api.post(`/transfer/${maPhieu}/${action}`);

      setActionStatus({
        type: 'success',
        text: `Thao tác "${actionLabel}" phiếu ${maPhieu} thành công!`,
      });

      setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
      await fetchTransfers();

      // Cập nhật lại Drawer nếu đang xem đúng phiếu đó
      if (selectedTransfer && selectedTransfer.ma_phieu_dc === maPhieu) {
        const updated = transfers.find((t) => t.ma_phieu_dc === maPhieu);
        if (updated) setSelectedTransfer(updated);
      }
    } catch (err: any) {
      setActionStatus({
        type: 'error',
        text: `Thao tác "${actionLabel}" thất bại: ${err.response?.data?.message || err.message}`,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Danh sách kho dùng cho dropdown
  const warehouseOptions = master?.danh_sach_kho && master.danh_sach_kho.length > 0
    ? master.danh_sach_kho
    : [
        { ma_kho: 'HN01', ten_kho: 'Kho Hà Nội' },
        { ma_kho: 'DN01', ten_kho: 'Kho Đà Nẵng' },
        { ma_kho: 'HCM01', ten_kho: 'Kho TP.HCM' },
      ];

  // Lọc tìm kiếm
  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      const matchSearch =
        !searchQuery.trim() ||
        t.ma_phieu_dc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.ma_sp.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.ten_sp && t.ten_sp.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.saga_id && t.saga_id.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchSearch;
    });
  }, [transfers, searchQuery]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = transfers.length;
    const pending = transfers.filter((t) => ['PENDING', 'CREATED', 'CHO_XU_LY'].includes(t.trang_thai)).length;
    const inTransit = transfers.filter((t) => t.saga_state === 'IN_TRANSIT').length;
    const completed = transfers.filter((t) => t.saga_state === 'COMPLETED' || t.trang_thai === 'HOAN_THANH').length;
    const failed = transfers.filter((t) => t.saga_state === 'FAILED' || t.saga_state === 'COMPENSATING' || t.saga_state === 'COMPENSATED').length;
    return { total, pending, inTransit, completed, failed };
  }, [transfers]);

  // Render Saga Stepper Timeline
  const renderSagaTimeline = (item: TransferListItem) => {
    const isCompleted = item.saga_state === 'COMPLETED' || item.trang_thai === 'HOAN_THANH';
    const isInTransit = item.saga_state === 'IN_TRANSIT';
    const isReserved = item.saga_state === 'SOURCE_ACCEPTED' || item.saga_state === 'RESERVED';
    const isWaitingConfirm = item.saga_state === 'WAITING_SOURCE_CONFIRMATION';
    const isCompensated = item.saga_state === 'COMPENSATING' || item.saga_state === 'COMPENSATED';
    const isFailed = item.saga_state === 'FAILED';

    const steps = [
      {
        id: 'created',
        label: '1. Khởi tạo',
        desc: 'Lập phiếu điều chuyển',
        active: true,
        done: true,
      },
      {
        id: 'approved',
        label: '2. Duyệt & Giữ hàng',
        desc: 'Khóa tồn kho nguồn',
        active: isWaitingConfirm || isReserved || isInTransit || isCompleted,
        done: isReserved || isInTransit || isCompleted,
      },
      {
        id: 'transit',
        label: '3. Vận chuyển',
        desc: 'Rời kho nguồn',
        active: isInTransit || isCompleted,
        done: isCompleted,
      },
      {
        id: 'received',
        label: '4. Thực nhận',
        desc: 'Ghi nhận kho đích',
        active: isCompleted,
        done: isCompleted,
      },
      {
        id: 'final',
        label: '5. Hoàn tất',
        desc: isCompensated ? 'Đã bồi hoàn' : isFailed ? 'Saga thất bại' : 'Saga commit',
        active: isCompleted || isCompensated || isFailed,
        done: isCompleted,
        error: isCompensated || isFailed,
      },
    ];

    return (
      <div className="py-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {steps.map((st, idx) => (
            <div
              key={st.id}
              className={`p-3 rounded-xl border text-xs transition-all ${
                st.error
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : st.done
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : st.active
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold mb-1">
                {st.error ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                ) : st.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : st.active ? (
                  <RotateCcw className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-slate-300 flex items-center justify-center text-[9px] shrink-0">
                    {idx + 1}
                  </span>
                )}
                <span className="truncate">{st.label}</span>
              </div>
              <div className="text-[10px] opacity-80 leading-tight">{st.desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Bar */}
      <PageHeader
        title="ĐIỀU CHUYỂN LIÊN KHO (SAGA ORCHESTRATION)"
        subtitle="Điều phối luồng hàng hóa phân tán giữa các kho chi nhánh qua mô hình Saga 2 pha, tự động bồi hoàn khi có sự cố"
        breadcrumbs={[
          { label: 'WMS', href: '/' },
          { label: 'Vận Hành Kho' },
          { label: 'Điều Chuyển Hàng' },
        ]}
        badge={
          <div className="flex items-center gap-2">
            <StatusBadge variant="info">
              Vai trò: {userRole || 'Chưa xác định'}
            </StatusBadge>
            {userKho && (
              <StatusBadge variant="neutral">
                Chi nhánh: {userKho}
              </StatusBadge>
            )}
          </div>
        }
        actions={
          <button
            onClick={() => fetchTransfers()}
            disabled={loadingTransfers}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTransfers ? 'animate-spin' : ''}`} />
            <span>Làm mới danh sách</span>
          </button>
        }
      />

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          title="Tổng Phiếu Điều Chuyển"
          value={stats.total}
          unit="phiếu"
          subtitle="Tất cả các chi nhánh"
          icon={Truck}
          variant="primary"
        />
        <StatCard
          title="Chờ Duyệt & Giữ Hàng"
          value={stats.pending}
          unit="phiếu"
          subtitle="Cần kho nguồn xử lý"
          icon={Clock}
          variant="warning"
        />
        <StatCard
          title="Đang Vận Chuyển"
          value={stats.inTransit}
          unit="chuyến"
          subtitle="Đang trên đường giao"
          icon={Truck}
          variant="info"
        />
        <StatCard
          title="Hoàn Tất Thành Công"
          value={stats.completed}
          unit="phiếu"
          subtitle={stats.failed > 0 ? `${stats.failed} phiếu lỗi/bồi hoàn` : '100% commit an toàn'}
          icon={CheckCircle2}
          variant="success"
        />
      </div>

      {/* Thông báo toàn cục cho thao tác */}
      {actionStatus.text && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 ${
            actionStatus.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{actionStatus.text}</span>
          </div>
          <button
            onClick={() => setActionStatus({ type: '', text: '' })}
            className="text-slate-400 hover:text-slate-700 text-xs cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* 3. KHỐI FORM TẠO PHIẾU ĐIỀU CHUYỂN (Chỉ hiển thị cho vai trò DIEU_PHOI) */}
      {canCreateTransfer ? (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Lập Phiếu Điều Chuyển Hàng Mới
                </h2>
                <p className="text-xs text-slate-500">
                  Khởi tạo điều phối phân tán giữa 2 kho chi nhánh độc lập
                </p>
              </div>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
              Quyền Điều Phối Viên
            </span>
          </div>

          {formStatus.text && (
            <div
              className={`p-3 text-xs font-semibold rounded-xl flex items-center gap-2 ${
                formStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {formStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              {formStatus.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Mã Phiếu Điều Chuyển</label>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        ma_phieu_dc: generateTransferCode(prev.kho_xuat),
                      }))
                    }
                    className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Sinh mã mới
                  </button>
                </div>
                <input
                  type="text"
                  required
                  maxLength={20}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono bg-slate-50 font-bold"
                  value={formData.ma_phieu_dc}
                  onChange={(e) => setFormData({ ...formData, ma_phieu_dc: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kho Xuất (Nguồn Giữ Hàng)</label>
                <select
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-semibold cursor-pointer"
                  value={formData.kho_xuat}
                  onChange={(e) => handleKhoXuatChange(e.target.value)}
                >
                  {warehouseOptions.map((k) => (
                    <option key={`xuat-${k.ma_kho}`} value={k.ma_kho}>
                      {k.ten_kho} ({k.ma_kho})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kho Nhập (Đích Nhận Hàng)</label>
                <select
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-semibold cursor-pointer"
                  value={formData.kho_nhap}
                  onChange={(e) => setFormData({ ...formData, kho_nhap: e.target.value })}
                >
                  {warehouseOptions.map((k) => (
                    <option key={`nhap-${k.ma_kho}`} value={k.ma_kho}>
                      {k.ten_kho} ({k.ma_kho})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Sản Phẩm Cần Chuyển</label>
                {loadingMaster ? (
                  <div className="text-xs text-slate-500 py-2">Đang tải danh mục sản phẩm...</div>
                ) : (
                  <select
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-semibold cursor-pointer"
                    value={formData.ma_sp}
                    onChange={(e) => setFormData({ ...formData, ma_sp: e.target.value })}
                    required
                  >
                    <option value="">-- Chọn sản phẩm trong kho --</option>
                    {master?.san_pham?.map((sp) => (
                      <option key={sp.ma_sp} value={sp.ma_sp}>
                        {sp.ten_sp} ({sp.ma_sp}) — ĐVT: {sp.don_vi}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số Lượng Chuyển</label>
                <input
                  type="number"
                  min="1"
                  required
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-bold"
                  value={formData.so_luong}
                  onChange={(e) => setFormData({ ...formData, so_luong: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={formSubmitting}
                className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition shadow-xs disabled:opacity-50 text-xs cursor-pointer"
              >
                {formSubmitting ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" /> Đang tạo phiếu...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Khởi Tạo Phiếu Điều Chuyển
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              Tài khoản hiện tại (<strong className="text-slate-800">{userRole}</strong>) có quyền duyệt và thao tác các bước xuất / nhận hàng theo chi nhánh được phân công. Quyền lập phiếu mới thuộc về <strong>Điều Phối Viên (DIEU_PHOI)</strong>.
            </span>
          </div>
        </div>
      )}

      {/* 4. BẢNG DANH SÁCH PHIẾU ĐIỀU CHUYỂN */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden">
        {/* Bộ lọc bảng */}
        <div className="p-4 border-b border-slate-200/80 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Danh Sách Phiếu Điều Chuyển ({filteredTransfers.length} phiếu)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Quick search input */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-300 text-xs w-full sm:w-56 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Tìm mã phiếu, SKU, Saga ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none w-full text-slate-700 placeholder-slate-400 text-xs"
              />
            </div>

            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs bg-white text-slate-700 font-semibold cursor-pointer"
            >
              <option value="">Tất cả kho</option>
              {warehouseOptions.map((k) => (
                <option key={`filter-${k.ma_kho}`} value={k.ma_kho}>
                  {k.ten_kho} ({k.ma_kho})
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs bg-white text-slate-700 font-semibold cursor-pointer"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="PENDING">Chờ duyệt</option>
              <option value="DANG_XU_LY">Đang xử lý</option>
              <option value="HOAN_THANH">Hoàn tất</option>
              <option value="THAT_BAI">Thất bại / Đã hủy</option>
            </select>
          </div>
        </div>

        {/* Nội dung bảng */}
        {loadingTransfers ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2">
            <RotateCcw className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-sm font-medium">Đang tải danh sách phiếu điều chuyển...</span>
          </div>
        ) : transfersError ? (
          <div className="py-12 px-4 text-center">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-sm text-rose-600 font-semibold mb-3">{transfersError}</p>
            <button
              onClick={() => fetchTransfers()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        ) : filteredTransfers.length === 0 ? (
          <EmptyState
            title="Chưa có phiếu điều chuyển nào phù hợp"
            description={
              searchQuery
                ? `Không có phiếu nào khớp với từ khóa "${searchQuery}".`
                : 'Các phiếu điều chuyển liên chi nhánh sẽ hiển thị và cập nhật trạng thái tại đây.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3.5 px-4">Mã Phiếu</th>
                  <th className="py-3.5 px-4">Tuyến Điều Chuyển</th>
                  <th className="py-3.5 px-4">Sản Phẩm</th>
                  <th className="py-3.5 px-4 text-center">Số Lượng</th>
                  <th className="py-3.5 px-4">Chứng Từ</th>
                  <th className="py-3.5 px-4">Tiến Trình Saga</th>
                  <th className="py-3.5 px-4">Thời Gian Tạo</th>
                  <th className="py-3.5 px-4 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransfers.map((item) => {
                  const isOperating = actionLoading && confirmModalConfig.maPhieu === item.ma_phieu_dc;

                  // 1. Duyệt: QUAN_LY_KHO (hoặc ADMIN), thuộc kho xuất, trạng thái PENDING/CREATED/CHO_XU_LY
                  const canApprove =
                    (userRole === 'ADMIN' || (userRole === 'QUAN_LY_KHO' && userKho === item.kho_xuat)) &&
                    ['PENDING', 'CREATED', 'CHO_XU_LY'].includes(item.trang_thai);

                  // 2. Xác nhận giữ hàng: NHAN_VIEN_KHO (hoặc ADMIN), thuộc kho xuất, Saga WAITING_SOURCE_CONFIRMATION
                  const canConfirmSource =
                    (userRole === 'ADMIN' || (userRole === 'NHAN_VIEN_KHO' && userKho === item.kho_xuat)) &&
                    item.saga_state === 'WAITING_SOURCE_CONFIRMATION';

                  // 3. Xuất gửi đi: NHAN_VIEN_KHO (hoặc ADMIN), thuộc kho xuất, Saga SOURCE_ACCEPTED hoặc RESERVED
                  const canShip =
                    (userRole === 'ADMIN' || (userRole === 'NHAN_VIEN_KHO' && userKho === item.kho_xuat)) &&
                    (item.saga_state === 'SOURCE_ACCEPTED' || item.saga_state === 'RESERVED');

                  // 4. Nhận hàng: NHAN_VIEN_KHO (hoặc ADMIN), thuộc kho nhập đích, Saga IN_TRANSIT
                  const canReceive =
                    (userRole === 'ADMIN' || (userRole === 'NHAN_VIEN_KHO' && userKho === item.kho_nhap)) &&
                    item.saga_state === 'IN_TRANSIT';

                  return (
                    <tr
                      key={item.ma_phieu_dc}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Mã phiếu */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{item.ma_phieu_dc}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedTransfer(item)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Xem chi tiết phiếu & Saga timeline"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {item.saga_id && (
                          <div className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]" title={item.saga_id}>
                            Saga: {item.saga_id.slice(0, 12)}...
                          </div>
                        )}
                      </td>

                      {/* Tuyến điều chuyển */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-bold">
                          <span className="text-slate-800" title={item.ten_kho_xuat || item.kho_xuat}>
                            {item.kho_xuat}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-800" title={item.ten_kho_nhap || item.kho_nhap}>
                            {item.kho_nhap}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.ten_kho_xuat || item.kho_xuat} → {item.ten_kho_nhap || item.kho_nhap}
                        </div>
                      </td>

                      {/* Sản phẩm */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{item.ten_sp || item.ma_sp}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{item.ma_sp}</div>
                      </td>

                      {/* Số lượng */}
                      <td className="py-3 px-4 text-center">
                        <span className="font-black text-slate-900 text-sm">{item.so_luong.toLocaleString()}</span>
                        {item.don_vi && <span className="text-[10px] text-slate-500 ml-1 font-semibold">{item.don_vi}</span>}
                      </td>

                      {/* Trạng thái chứng từ */}
                      <td className="py-3 px-4">
                        <DocumentStatusBadge status={item.trang_thai} />
                      </td>

                      {/* Trạng thái Saga */}
                      <td className="py-3 px-4">
                        <SagaStatusBadge
                          state={item.saga_state || undefined}
                          sagaId={item.saga_id || undefined}
                          errorMessage={item.error_message || undefined}
                        />
                      </td>

                      {/* Thời gian tạo */}
                      <td className="py-3 px-4 text-slate-500 text-[11px] font-mono">
                        {item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : '—'}
                      </td>

                      {/* Thao tác vòng đời */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Nút Duyệt phiếu */}
                          {canApprove && (
                            <button
                              onClick={() => openConfirmModal(item, 'approve', 'Duyệt phiếu')}
                              disabled={isOperating}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs disabled:opacity-50 cursor-pointer"
                              title="Duyệt yêu cầu điều chuyển và khởi tạo Saga"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Duyệt
                            </button>
                          )}

                          {/* Nút Xác nhận giữ hàng */}
                          {canConfirmSource && (
                            <button
                              onClick={() => openConfirmModal(item, 'source-confirm', 'Xác nhận giữ hàng')}
                              disabled={isOperating}
                              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs disabled:opacity-50 cursor-pointer"
                              title="Xác nhận đã giữ hàng tại kho nguồn"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              Giữ hàng
                            </button>
                          )}

                          {/* Nút Xuất gửi đi */}
                          {canShip && (
                            <button
                              onClick={() => openConfirmModal(item, 'source-ship', 'Xuất hàng vận chuyển')}
                              disabled={isOperating}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs disabled:opacity-50 cursor-pointer"
                              title="Xác nhận hàng đã rời kho và đang trên đường giao"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              Xuất hàng
                            </button>
                          )}

                          {/* Nút Nhận hàng */}
                          {canReceive && (
                            <button
                              onClick={() => openConfirmModal(item, 'destination-receive', 'Nhận hàng vào kho')}
                              disabled={isOperating}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs disabled:opacity-50 cursor-pointer"
                              title="Kho đích xác nhận kiểm đếm và nhận hàng vào kho"
                            >
                              <Inbox className="w-3.5 h-3.5" />
                              Nhận hàng
                            </button>
                          )}

                          {/* Nút Chi tiết */}
                          <button
                            onClick={() => setSelectedTransfer(item)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Xem chi tiết phiếu"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. CONFIRMATION MODAL CHO CÁC THAO TÁC SAGA */}
      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        onClose={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={executeConfirmedAction}
        loading={actionLoading}
        title={`Xác nhận: ${confirmModalConfig.actionLabel}`}
        variant={
          confirmModalConfig.action === 'source-ship'
            ? 'primary'
            : confirmModalConfig.action === 'destination-receive'
            ? 'success'
            : 'warning'
        }
        confirmLabel={`Thực hiện ${confirmModalConfig.actionLabel}`}
        message={
          <div>
            Bạn có chắc chắn muốn thực hiện thao tác{' '}
            <strong className="text-slate-900">{confirmModalConfig.actionLabel}</strong> cho phiếu điều chuyển{' '}
            <strong className="text-blue-600 font-mono">{confirmModalConfig.maPhieu}</strong> không?
          </div>
        }
        details={
          confirmModalConfig.item && (
            <div className="space-y-1 text-[11px] text-slate-600">
              <div>
                Tuyến: <strong className="text-slate-800">{confirmModalConfig.item.kho_xuat}</strong> →{' '}
                <strong className="text-slate-800">{confirmModalConfig.item.kho_nhap}</strong>
              </div>
              <div>
                Mặt hàng: <strong className="text-slate-800">{confirmModalConfig.item.ten_sp || confirmModalConfig.item.ma_sp}</strong>
              </div>
              <div>
                Số lượng: <strong className="text-slate-800">{confirmModalConfig.item.so_luong}</strong> {confirmModalConfig.item.don_vi}
              </div>
              {confirmModalConfig.item.saga_id && (
                <div className="font-mono text-slate-500 text-[10px]">
                  Saga ID: {confirmModalConfig.item.saga_id}
                </div>
              )}
            </div>
          )
        }
      />

      {/* 6. DETAIL DRAWER XEM CHI TIẾT SAGA & PHIẾU ĐIỀU CHUYỂN */}
      <DetailDrawer
        isOpen={Boolean(selectedTransfer)}
        onClose={() => setSelectedTransfer(null)}
        title={selectedTransfer?.ma_phieu_dc ? `Chi Tiết Phiếu: ${selectedTransfer.ma_phieu_dc}` : 'Chi Tiết Phiếu'}
        subtitle={`Giao dịch Saga phân tán liên kho • Kho xuất: ${selectedTransfer?.kho_xuat} → Kho nhập: ${selectedTransfer?.kho_nhap}`}
        width="lg"
      >
        {selectedTransfer && (
          <div className="space-y-6 text-xs">
            {/* Saga Visual Progression */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Tiến Trình Giao Dịch Phân Tán (Saga Lifecycle)
              </div>
              {renderSagaTimeline(selectedTransfer)}
            </div>

            {/* Thông tin chứng từ */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                <span className="text-[11px] text-slate-400 font-medium">Kho Xuất (Nguồn)</span>
                <div className="text-sm font-bold text-slate-800">
                  {selectedTransfer.ten_kho_xuat || selectedTransfer.kho_xuat} ({selectedTransfer.kho_xuat})
                </div>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                <span className="text-[11px] text-slate-400 font-medium">Kho Nhập (Đích)</span>
                <div className="text-sm font-bold text-slate-800">
                  {selectedTransfer.ten_kho_nhap || selectedTransfer.kho_nhap} ({selectedTransfer.kho_nhap})
                </div>
              </div>
            </div>

            {/* Thông tin hàng hóa & Số lượng */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Chi Tiết Hàng Hóa Điều Chuyển
              </div>
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {selectedTransfer.ten_sp || selectedTransfer.ma_sp}
                  </div>
                  <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                    Mã SKU: {selectedTransfer.ma_sp}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-black text-slate-900">
                    {selectedTransfer.so_luong.toLocaleString()} {selectedTransfer.don_vi}
                  </div>
                  <div className="text-[10px] text-slate-400">Số lượng điều chuyển</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-1 text-center">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-400 block">SL Yêu Cầu</span>
                  <span className="font-bold text-slate-800">{selectedTransfer.so_luong}</span>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-400 block">SL Đã Xuất</span>
                  <span className="font-bold text-blue-600">
                    {selectedTransfer.so_luong_da_xuat ?? selectedTransfer.so_luong}
                  </span>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-400 block">SL Thực Nhận</span>
                  <span className="font-bold text-emerald-600">
                    {selectedTransfer.so_luong_thuc_nhan ?? (selectedTransfer.trang_thai === 'HOAN_THANH' ? selectedTransfer.so_luong : '—')}
                  </span>
                </div>
              </div>
            </div>

            {/* Metadata & Audit Trace */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-slate-600">
              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Thông Tin Kỹ Thuật Saga
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60 font-mono text-[11px]">
                <span>Saga Orchestrator ID:</span>
                <span className="font-bold text-blue-600">{selectedTransfer.saga_id || 'Chưa gán'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60 font-mono text-[11px]">
                <span>Saga State Machine:</span>
                <span className="font-bold text-purple-700">{selectedTransfer.saga_state || 'PENDING'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60 text-[11px]">
                <span>Thời gian tạo:</span>
                <span>{selectedTransfer.created_at ? new Date(selectedTransfer.created_at).toLocaleString('vi-VN') : '—'}</span>
              </div>
              {selectedTransfer.error_message && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[11px] mt-2">
                  <div className="font-bold flex items-center gap-1.5 text-rose-800">
                    <AlertTriangle className="w-3.5 h-3.5" /> Lỗi phân tán:
                  </div>
                  <div className="mt-0.5">{selectedTransfer.error_message}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
