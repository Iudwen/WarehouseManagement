import React, { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';

export default function Transfer() {
  const { user } = useAuth();
  const { selectedWarehouse } = useWarehouse();

  const userRole = user?.vai_tro;
  const userKho = user?.ma_kho;
  const canCreateTransfer = userRole === 'DIEU_PHOI';

  // Master data
  const [master, setMaster] = useState<MasterData | null>(null);
  const [loadingMaster, setLoadingMaster] = useState<boolean>(true);

  // Sinh mã phiếu theo chuẩn quy cách WMS: DC_[MA_KHO]_[YYMMDD]_[4_RANDOM] (19 ký tự <= VARCHAR(20))
  const generateTransferCode = (khoXuat: string) => {
    const prefix = 'DC';
    const kho = khoXuat || 'HN01';
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}_${kho}_${dateStr}_${randomSuffix}`;
  };

  // Form state
  const [formData, setFormData] = useState({
    ma_phieu_dc: generateTransferCode(selectedWarehouse || 'HN01'),
    kho_xuat: selectedWarehouse || 'HN01',
    kho_nhap: selectedWarehouse === 'HN01' ? 'DN01' : 'HN01',
    ma_sp: '',
    so_luong: 1,
  });

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error' | ''; text: string }>({
    type: '',
    text: '',
  });

  // Table state
  const [transfers, setTransfers] = useState<TransferListItem[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState<boolean>(false);
  const [transfersError, setTransfersError] = useState<string>('');
  const [filterWarehouse, setFilterWarehouse] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Action state (Duyệt, Xuất, Nhận)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{ type: 'success' | 'error' | ''; text: string }>({
    type: '',
    text: '',
  });

  // Bằng chứng xác thực reservation từ response của Backend API POST /transfer/:maPhieu/source-confirm
  // Hợp đồng API trả về: { success: true, data: { saga_id, global_id, ma_kho, event_type: 'TRANSFER_ACCEPTED' } }
  const [verifiedReservations, setVerifiedReservations] = useState<
    Record<string, { saga_id: string; global_id: string; ma_kho: string; event_type: string; confirmed_at: number }>
  >({});

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
      // Đổi kho nhập sang kho khác nếu trùng
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

      // Tải lại danh sách phiếu
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

  // Thao tác vòng đời phiếu
  const handleLifecycleAction = async (
    maPhieu: string,
    action: 'approve' | 'source-confirm' | 'source-ship' | 'destination-receive',
    actionLabel: string
  ) => {
    // Guard chống thao tác lặp / gọi đồng thời khi đang có thao tác xử lý
    if (actionLoadingId) return;

    setActionLoadingId(maPhieu);
    setActionStatus({ type: '', text: '' });

    try {
      const res = await api.post(`/transfer/${maPhieu}/${action}`);

      // Xác thực bằng chứng reservation từ response chính thức của API Backend
      if (action === 'source-confirm') {
        const resData = res.data?.data;
        if (resData && resData.event_type === 'TRANSFER_ACCEPTED' && resData.success) {
          setVerifiedReservations((prev) => ({
            ...prev,
            [maPhieu]: {
              saga_id: resData.saga_id,
              global_id: resData.global_id,
              ma_kho: resData.ma_kho,
              event_type: resData.event_type,
              confirmed_at: Date.now(),
            },
          }));
        }
      } else if (action === 'source-ship') {
        // Sau khi đã xuất chuyển thành công, giải phóng bằng chứng reservation của phiếu
        setVerifiedReservations((prev) => {
          const next = { ...prev };
          delete next[maPhieu];
          return next;
        });
      }

      setActionStatus({
        type: 'success',
        text: `Thao tác "${actionLabel}" phiếu ${maPhieu} thành công!`,
      });
      // Tải lại danh sách từ nguồn dữ liệu backend
      await fetchTransfers();
    } catch (err: any) {
      // Nếu thao tác thất bại, hiển thị lỗi và không đánh dấu bước đó là thành công
      setActionStatus({
        type: 'error',
        text: `Thao tác "${actionLabel}" thất bại: ${err.response?.data?.message || err.message}`,
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Render badge trạng thái chứng từ
  const renderDocumentStatus = (status: string) => {
    switch (status) {
      case 'PENDING':
      case 'CHO_XU_LY':
      case 'CREATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3" />
            Chờ duyệt
          </span>
        );
      case 'DANG_XU_LY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            <RotateCcw className="w-3 h-3 animate-spin" />
            Đang xử lý
          </span>
        );
      case 'HOAN_THANH':
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
            <CheckCircle2 className="w-3 h-3" />
            Hoàn tất
          </span>
        );
      case 'THAT_BAI':
      case 'FAILED':
      case 'DA_HUY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
            <AlertTriangle className="w-3 h-3" />
            Thất bại / Đã hủy
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  // Render badge tiến trình Saga phân tán
  const renderSagaStatus = (item: TransferListItem) => {
    if (!item.saga_id && !item.saga_state) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-normal bg-slate-100 text-slate-500">
          Chưa khởi tạo Saga
        </span>
      );
    }

    const state = item.saga_state;
    switch (state) {
      case 'WAITING_SOURCE_CONFIRMATION': {
        const isReserved = Boolean(
          verifiedReservations[item.ma_phieu_dc]?.event_type === 'TRANSFER_ACCEPTED'
        );
        if (isReserved) {
          return (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800 border border-teal-200"
              title={`Saga ID: ${item.saga_id} — Giữ hàng xác thực: TRANSFER_ACCEPTED`}
            >
              <CheckCircle2 className="w-3 h-3 text-teal-600" />
              Đã giữ hàng (Sẵn sàng xuất)
            </span>
          );
        }
        return (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200"
            title={`Saga ID: ${item.saga_id}`}
          >
            <Clock className="w-3 h-3" />
            Chờ kho xuất giữ hàng
          </span>
        );
      }
      case 'IN_TRANSIT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-cyan-100 text-cyan-800 border border-cyan-200" title={`Saga ID: ${item.saga_id}`}>
            <Truck className="w-3 h-3" />
            Đang vận chuyển
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200" title={`Saga ID: ${item.saga_id}`}>
            <CheckCircle2 className="w-3 h-3" />
            Saga hoàn tất
          </span>
        );
      case 'COMPENSATING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200" title={`Saga ID: ${item.saga_id}`}>
            <RotateCcw className="w-3 h-3 animate-spin" />
            Đang bồi hoàn
          </span>
        );
      case 'COMPENSATED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-800 border border-stone-200" title={`Saga ID: ${item.saga_id}`}>
            <AlertCircle className="w-3 h-3" />
            Đã bồi hoàn
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200" title={`Lỗi: ${item.error_message || 'Thất bại'}`}>
            <AlertTriangle className="w-3 h-3" />
            Saga thất bại
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-normal bg-indigo-50 text-indigo-700">
            {state || item.saga_status || 'Đang xử lý'}
          </span>
        );
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Tiêu đề trang & Thanh công cụ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="w-7 h-7 text-indigo-600" />
            Điều Chuyển Hàng Liên Chi Nhánh (Saga Orchestration)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Điều phối hàng hóa giữa các kho phân tán qua giao thức Saga. Đăng nhập với vai trò:{' '}
            <span className="font-semibold text-indigo-600">{userRole || 'Chưa đăng nhập'}</span>
            {userKho && (
              <span>
                {' '}— Kho chi nhánh: <span className="font-semibold text-indigo-600">{userKho}</span>
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchTransfers()}
            disabled={loadingTransfers}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTransfers ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Thông báo toàn cục cho thao tác */}
      {actionStatus.text && (
        <div
          className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
            actionStatus.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {actionStatus.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          )}
          <span>{actionStatus.text}</span>
        </div>
      )}

      {/* KHỐI 1: FORM TẠO PHIẾU ĐIỀU CHUYỂN (Chỉ hiển thị cho vai trò DIEU_PHOI) */}
      {canCreateTransfer ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4 border-b pb-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-indigo-600" />
              Lập Phiếu Điều Chuyển Hàng Mới
            </h2>
            <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
              Quyền Điều Phối Viên
            </span>
          </div>

          {formStatus.text && (
            <div
              className={`p-3 mb-4 text-sm font-semibold rounded-lg flex items-center gap-2 ${
                formStatus.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {formStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {formStatus.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">Mã Phiếu Điều Chuyển</label>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        ma_phieu_dc: generateTransferCode(prev.kho_xuat),
                      }))
                    }
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                  >
                    <RefreshCw className="w-3 h-3" /> Sinh lại mã
                  </button>
                </div>
                <input
                  type="text"
                  required
                  maxLength={20}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 font-mono bg-slate-50"
                  value={formData.ma_phieu_dc}
                  onChange={(e) => setFormData({ ...formData, ma_phieu_dc: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kho Xuất (Nguồn)</label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kho Nhập (Đích)</label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sản Phẩm Cần Chuyển</label>
                {loadingMaster ? (
                  <div className="text-xs text-slate-500 py-2">Đang tải danh mục sản phẩm...</div>
                ) : (
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                    value={formData.ma_sp}
                    onChange={(e) => setFormData({ ...formData, ma_sp: e.target.value })}
                    required
                  >
                    <option value="">-- Chọn sản phẩm --</option>
                    {master?.san_pham?.map((sp) => (
                      <option key={sp.ma_sp} value={sp.ma_sp}>
                        {sp.ten_sp} ({sp.ma_sp}) - ĐVT: {sp.don_vi}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Số Lượng Chuyển</label>
                <input
                  type="number"
                  min="1"
                  required
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                  value={formData.so_luong}
                  onChange={(e) => setFormData({ ...formData, so_luong: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={formSubmitting}
                className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition shadow disabled:opacity-50 text-sm"
              >
                {formSubmitting ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" /> Đang tạo phiếu...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Lập Phiếu Điều Chuyển
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
            <span>
              Tài khoản hiện tại ({userRole}) có quyền xem và xử lý các bước phê duyệt / xuất nhập kho theo phân công chi nhánh. Quyền lập phiếu điều chuyển mới thuộc về Điều Phối Viên (DIEU_PHOI).
            </span>
          </div>
        </div>
      )}

      {/* KHỐI 2: BẢNG DANH SÁCH PHIẾU ĐIỀU CHUYỂN */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Bộ lọc bảng */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-800">
              Danh Sách Phiếu Điều Chuyển ({transfers.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:ring-1 focus:ring-indigo-500"
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
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:ring-1 focus:ring-indigo-500"
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
          <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
            <RotateCcw className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-sm">Đang tải danh sách phiếu điều chuyển...</span>
          </div>
        ) : transfersError ? (
          <div className="py-8 px-4 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 font-medium mb-3">{transfersError}</p>
            <button
              onClick={() => fetchTransfers()}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 transition"
            >
              Thử lại
            </button>
          </div>
        ) : transfers.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium">Chưa có phiếu điều chuyển nào phù hợp</p>
            <p className="text-xs text-slate-400 mt-0.5">Các phiếu điều chuyển liên chi nhánh sẽ hiển thị tại đây</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/75 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="py-3 px-4">Mã Phiếu</th>
                  <th className="py-3 px-4">Tuyến Điều Chuyển</th>
                  <th className="py-3 px-4">Sản Phẩm</th>
                  <th className="py-3 px-4 text-center">Số Lượng</th>
                  <th className="py-3 px-4">Trạng Thái Phiếu</th>
                  <th className="py-3 px-4">Tiến Trình Saga</th>
                  <th className="py-3 px-4">Thời Gian Tạo</th>
                  <th className="py-3 px-4 text-center">Thao Tác Vòng Đời</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((item) => {
                  const isOperating = actionLoadingId === item.ma_phieu_dc;

                  // Kiểm tra bằng chứng backend xác thực reservation đã được tạo thành công
                  const hasReservationEvidence = Boolean(
                    verifiedReservations[item.ma_phieu_dc]?.event_type === 'TRANSFER_ACCEPTED'
                  );

                  // Điều kiện các nút nghiệp vụ theo Backend:
                  // 1. Duyệt: QUAN_LY_KHO, thuộc kho xuất, trạng thái PENDING/CREATED/CHO_XU_LY
                  const canApprove =
                    userRole === 'QUAN_LY_KHO' &&
                    userKho === item.kho_xuat &&
                    ['PENDING', 'CREATED', 'CHO_XU_LY'].includes(item.trang_thai);

                  // 2. Xác nhận giữ hàng: NHAN_VIEN_KHO, thuộc kho xuất, Saga WAITING_SOURCE_CONFIRMATION,
                  // VÀ CHƯA CÓ bằng chứng reservation đã hoàn tất
                  const canConfirmSource =
                    userRole === 'NHAN_VIEN_KHO' &&
                    userKho === item.kho_xuat &&
                    item.saga_state === 'WAITING_SOURCE_CONFIRMATION' &&
                    !hasReservationEvidence;

                  // 3. Xuất gửi đi: NHAN_VIEN_KHO, thuộc kho xuất, Saga WAITING_SOURCE_CONFIRMATION,
                  // VÀ BẮT BUỘC ĐÃ CÓ bằng chứng backend chứng thực giữ hàng thành công (TRANSFER_ACCEPTED)
                  const canShip =
                    userRole === 'NHAN_VIEN_KHO' &&
                    userKho === item.kho_xuat &&
                    item.saga_state === 'WAITING_SOURCE_CONFIRMATION' &&
                    hasReservationEvidence;

                  // 4. Nhận hàng: NHAN_VIEN_KHO, thuộc kho nhập đích, Saga IN_TRANSIT
                  const canReceive =
                    userRole === 'NHAN_VIEN_KHO' &&
                    userKho === item.kho_nhap &&
                    item.saga_state === 'IN_TRANSIT';

                  const hasAction = canApprove || canConfirmSource || canShip || canReceive;

                  return (
                    <tr key={item.ma_phieu_dc} className="hover:bg-slate-50/75 transition-colors">
                      {/* Mã phiếu */}
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {item.ma_phieu_dc}
                      </td>

                      {/* Tuyến điều chuyển */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="text-slate-800" title={item.ten_kho_xuat || item.kho_xuat}>
                            {item.kho_xuat}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-800" title={item.ten_kho_nhap || item.kho_nhap}>
                            {item.kho_nhap}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {item.ten_kho_xuat || item.kho_xuat} → {item.ten_kho_nhap || item.kho_nhap}
                        </div>
                      </td>

                      {/* Sản phẩm */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{item.ten_sp || item.ma_sp}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{item.ma_sp}</div>
                      </td>

                      {/* Số lượng */}
                      <td className="py-3 px-4 text-center">
                        <span className="font-bold text-slate-800 text-sm">{item.so_luong}</span>
                        {item.don_vi && <span className="text-[11px] text-slate-500 ml-1">{item.don_vi}</span>}
                      </td>

                      {/* Trạng thái phiếu */}
                      <td className="py-3 px-4">{renderDocumentStatus(item.trang_thai)}</td>

                      {/* Trạng thái Saga */}
                      <td className="py-3 px-4">{renderSagaStatus(item)}</td>

                      {/* Thời gian tạo */}
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : '—'}
                      </td>

                      {/* Thao tác vòng đời */}
                      <td className="py-3 px-4 text-center">
                        {hasAction ? (
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Nút Duyệt phiếu */}
                            {canApprove && (
                              <button
                                onClick={() => handleLifecycleAction(item.ma_phieu_dc, 'approve', 'Duyệt phiếu')}
                                disabled={isOperating}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-xs font-semibold flex items-center gap-1 shadow-sm disabled:opacity-50"
                                title="Quản lý kho xuất duyệt yêu cầu và khởi tạo giao dịch Saga"
                              >
                                {isOperating ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Duyệt
                              </button>
                            )}

                            {/* Nút Xác nhận giữ hàng */}
                            {canConfirmSource && (
                              <button
                                onClick={() =>
                                  handleLifecycleAction(item.ma_phieu_dc, 'source-confirm', 'Xác nhận giữ hàng')
                                }
                                disabled={isOperating}
                                className="px-2.5 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-xs font-semibold flex items-center gap-1 shadow-sm disabled:opacity-50"
                                title="Nhân viên kho xuất xác nhận đã giữ hàng tại kho"
                              >
                                {isOperating ? <RotateCcw className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                                Giữ hàng
                              </button>
                            )}

                            {/* Nút Xuất gửi đi */}
                            {canShip && (
                              <button
                                onClick={() =>
                                  handleLifecycleAction(item.ma_phieu_dc, 'source-ship', 'Xuất hàng vận chuyển')
                                }
                                disabled={isOperating}
                                className="px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-xs font-semibold flex items-center gap-1 shadow-sm disabled:opacity-50"
                                title="Nhân viên kho xuất xác nhận đã xuất kho gửi đi"
                              >
                                {isOperating ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                                Xuất chuyển
                              </button>
                            )}

                            {/* Nút Nhận hàng */}
                            {canReceive && (
                              <button
                                onClick={() =>
                                  handleLifecycleAction(item.ma_phieu_dc, 'destination-receive', 'Nhận hàng vào kho')
                                }
                                disabled={isOperating}
                                className="px-2.5 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs font-semibold flex items-center gap-1 shadow-sm disabled:opacity-50"
                                title="Nhân viên kho đích xác nhận đã nhận hàng vào kho"
                              >
                                {isOperating ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Inbox className="w-3 h-3" />}
                                Nhận hàng
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
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