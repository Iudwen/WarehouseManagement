import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import type { MasterData, ImportReceiptListItem, ReceiveItemInput } from '../types';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Lock,
  Sparkles,
  Filter,
  RefreshCw,
  AlertCircle,
  FileText,
  Plus,
  Trash2,
  Eye,
  Check,
  Ban,
  Truck,
  AlertTriangle,
  X
} from 'lucide-react';

interface FormLineItem {
  id: string;
  ma_sp: string;
  so_luong: number;
  don_gia: number;
}

export default function Inventory() {
  const location = useLocation();
  const { selectedWarehouse } = useWarehouse();
  const { user } = useAuth();

  const isImport = location.pathname === '/import';

  const userRole = user?.vai_tro;
  const isQuanLyKho = userRole === 'QUAN_LY_KHO' || userRole === 'ADMIN';
  const isNhanVienKho = userRole === 'NHAN_VIEN_KHO' || userRole === 'ADMIN';

  const [master, setMaster] = useState<MasterData | null>(null);
  const [loadingMaster, setLoadingMaster] = useState<boolean>(true);

  // State cho bảng danh sách phiếu nhập
  const [importReceipts, setImportReceipts] = useState<ImportReceiptListItem[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState<boolean>(false);
  const [receiptsError, setReceiptsError] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Hàm sinh mã khớp 100% với quy chuẩn codeGenerator.ts ở Backend
  const generateFrontendCode = (importing: boolean, kho: string) => {
    const prefix = importing ? 'PN' : 'PX';
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}_${kho}_${dateStr}_${randomSuffix}`;
  };

  const [formHeader, setFormHeader] = useState({
    ma_phieu: generateFrontendCode(isImport, selectedWarehouse),
    ma_kho: selectedWarehouse,
    ma_partner: '',
  });

  const [lineItems, setLineItems] = useState<FormLineItem[]>([
    { id: '1', ma_sp: '', so_luong: 1, don_gia: 0 },
  ]);

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: '', text: '' });

  // Modals state
  const [detailModalReceipt, setDetailModalReceipt] = useState<ImportReceiptListItem | null>(null);
  const [approveRejectModal, setApproveRejectModal] = useState<{
    receipt: ImportReceiptListItem;
    type: 'APPROVE' | 'REJECT';
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [receiveModalReceipt, setReceiveModalReceipt] = useState<ImportReceiptListItem | null>(null);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, number>>({});

  const [shortageModalReceipt, setShortageModalReceipt] = useState<ImportReceiptListItem | null>(null);
  const [shortageAction, setShortageAction] = useState<'ACCEPT' | 'SUPPLEMENT'>('SUPPLEMENT');
  const [shortageNote, setShortageNote] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // 1. Hàm tải danh sách phiếu nhập kho
  const fetchImportReceipts = async () => {
    if (!isImport) return;
    setLoadingReceipts(true);
    setReceiptsError('');
    try {
      const params: Record<string, string> = { ma_kho: selectedWarehouse };
      if (filterStatus) {
        params.trang_thai = filterStatus;
      }
      const res = await api.get('/inventory/import', { params });
      setImportReceipts(res.data?.data || []);
    } catch (err: any) {
      setReceiptsError(err.response?.data?.message || err.message || 'Lỗi tải danh sách phiếu nhập kho');
    } finally {
      setLoadingReceipts(false);
    }
  };

  // 2. Đồng bộ ma_kho và tự sinh mã mới khi đổi Kho hoặc chuyển tab Import/Export
  useEffect(() => {
    setFormHeader((prev) => ({
      ...prev,
      ma_kho: selectedWarehouse,
      ma_phieu: generateFrontendCode(isImport, selectedWarehouse),
    }));
  }, [selectedWarehouse, isImport]);

  useEffect(() => {
    setStatus({ type: '', text: '' });
  }, [location.pathname]);

  // 3. Tải lại danh sách phiếu nhập khi đổi kho, đổi filter status hoặc vào tab import
  useEffect(() => {
    if (isImport) {
      fetchImportReceipts();
    }
  }, [selectedWarehouse, isImport, filterStatus]);

  // 4. Load Master Data & Khởi tạo line item đầu tiên
  useEffect(() => {
    const fetchMaster = async () => {
      setLoadingMaster(true);
      try {
        const res = await api.get(`/master-data?ma_kho=${selectedWarehouse}`);
        const data: MasterData = res.data.data || res.data;
        setMaster(data);

        const defaultPartner = isImport ? data.nha_cung_cap?.[0]?.ma_ncc : data.khach_hang?.[0]?.ma_kh;
        setFormHeader((prev) => ({
          ...prev,
          ma_partner: defaultPartner || '',
        }));

        const defaultSp = data.san_pham?.[0];
        const initialPrice = defaultSp ? Number(isImport ? defaultSp.gia_nhap : defaultSp.gia_ban) : 0;
        setLineItems([
          {
            id: 'item_1',
            ma_sp: defaultSp ? defaultSp.ma_sp : '',
            so_luong: 1,
            don_gia: initialPrice,
          },
        ]);
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu danh mục:', err);
      } finally {
        setLoadingMaster(false);
      }
    };

    fetchMaster();
  }, [selectedWarehouse, isImport]);

  // Thao tác với Line Items
  const handleAddLineItem = () => {
    if (!master?.san_pham || master.san_pham.length === 0) return;
    const selectedSkus = new Set(lineItems.map((item) => item.ma_sp));
    const availableSp = master.san_pham.find((sp) => !selectedSkus.has(sp.ma_sp)) || master.san_pham[0];
    const price = availableSp ? Number(isImport ? availableSp.gia_nhap : availableSp.gia_ban) : 0;

    setLineItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        ma_sp: availableSp.ma_sp,
        so_luong: 1,
        don_gia: price,
      },
    ]);
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleItemProductChange = (id: string, spId: string) => {
    const selectedSp = master?.san_pham.find((item) => item.ma_sp === spId);
    const price = selectedSp ? Number(isImport ? selectedSp.gia_nhap : selectedSp.gia_ban) : 0;

    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ma_sp: spId, don_gia: price } : item))
    );
  };

  const handleItemQtyChange = (id: string, qty: number) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, so_luong: Math.max(1, qty) } : item))
    );
  };

  const totalQuantity = lineItems.reduce((sum, item) => sum + (Number(item.so_luong) || 0), 0);
  const totalAmount = lineItems.reduce((sum, item) => sum + (Number(item.so_luong) || 0) * (Number(item.don_gia) || 0), 0);

  // Xử lý tạo phiếu
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    if (!formHeader.ma_partner) {
      setStatus({ type: 'error', text: isImport ? 'Vui lòng chọn Nhà cung cấp!' : 'Vui lòng chọn Khách hàng!' });
      return;
    }

    if (lineItems.length === 0) {
      setStatus({ type: 'error', text: 'Danh sách sản phẩm không được rỗng!' });
      return;
    }

    const seen = new Set<string>();
    for (const item of lineItems) {
      if (!item.ma_sp) {
        setStatus({ type: 'error', text: 'Vui lòng chọn sản phẩm cho từng dòng!' });
        return;
      }
      if (seen.has(item.ma_sp)) {
        setStatus({ type: 'error', text: `Sản phẩm "${item.ma_sp}" bị trùng lặp trong phiếu!` });
        return;
      }
      seen.add(item.ma_sp);

      if (item.so_luong <= 0) {
        setStatus({ type: 'error', text: `Số lượng sản phẩm ${item.ma_sp} phải lớn hơn 0!` });
        return;
      }
    }

    setFormSubmitting(true);
    try {
      const itemsPayload = lineItems.map((item) => ({
        ma_sp: item.ma_sp,
        so_luong: Number(item.so_luong),
        don_gia: Number(item.don_gia),
      }));

      if (isImport) {
        await api.post('/inventory/import', {
          ma_phieu_nhap: formHeader.ma_phieu,
          ma_kho: formHeader.ma_kho,
          ma_ncc: formHeader.ma_partner,
          items: itemsPayload,
        });
        setStatus({ type: 'success', text: `✅ Tạo phiếu nhập kho (${formHeader.ma_phieu}) thành công! Đã chuyển trạng thái Chờ Duyệt.` });
        fetchImportReceipts();
      } else {
        await api.post('/inventory/export', {
          ma_phieu_xuat: formHeader.ma_phieu,
          ma_kho: formHeader.ma_kho,
          ma_kh: formHeader.ma_partner,
          items: itemsPayload,
        });
        setStatus({ type: 'success', text: `✅ Tạo phiếu xuất kho (${formHeader.ma_phieu}) thành công!` });
      }

      setFormHeader((prev) => ({
        ...prev,
        ma_phieu: generateFrontendCode(isImport, selectedWarehouse),
      }));

      const defaultSp = master?.san_pham?.[0];
      const initialPrice = defaultSp ? Number(isImport ? defaultSp.gia_nhap : defaultSp.gia_ban) : 0;
      setLineItems([
        {
          id: `item_${Date.now()}`,
          ma_sp: defaultSp ? defaultSp.ma_sp : '',
          so_luong: 1,
          don_gia: initialPrice,
        },
      ]);
    } catch (err: any) {
      setStatus({ type: 'error', text: `❌ Lỗi: ${err.response?.data?.message || err.message}` });
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- ACTIONS XỬ LÝ THEO VÒNG ĐỜI ---

  // 1. Duyệt phiếu nhập (QUAN_LY_KHO)
  const handleApprove = async () => {
    if (!approveRejectModal?.receipt) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.post(`/inventory/import/${approveRejectModal.receipt.ma_phieu_nhap}/approve`);
      setStatus({ type: 'success', text: `✅ Đã duyệt phiếu nhập ${approveRejectModal.receipt.ma_phieu_nhap} (Chuyển Đã Duyệt).` });
      setApproveRejectModal(null);
      fetchImportReceipts();
    } catch (err: any) {
      setActionError(err.response?.data?.message || err.message || 'Lỗi duyệt phiếu nhập');
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Từ chối phiếu nhập (QUAN_LY_KHO)
  const handleReject = async () => {
    if (!approveRejectModal?.receipt) return;
    setActionLoading(true);
    setActionError('');
    try {
      await api.post(`/inventory/import/${approveRejectModal.receipt.ma_phieu_nhap}/reject`, {
        ly_do: rejectReason.trim(),
      });
      setStatus({ type: 'success', text: `✅ Đã từ chối phiếu nhập ${approveRejectModal.receipt.ma_phieu_nhap}.` });
      setApproveRejectModal(null);
      setRejectReason('');
      fetchImportReceipts();
    } catch (err: any) {
      setActionError(err.response?.data?.message || err.message || 'Lỗi từ chối phiếu nhập');
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Mở Modal Kiểm đếm nhận hàng (NHAN_VIEN_KHO)
  const openReceiveModal = (receipt: ImportReceiptListItem) => {
    setReceiveModalReceipt(receipt);
    const initialInputs: Record<string, number> = {};
    receipt.items?.forEach((it) => {
      initialInputs[it.ma_sp] = Number(it.so_luong) || 0;
    });
    setReceiveInputs(initialInputs);
    setActionError('');
  };

  // 4. Xác nhận kiểm đếm thực nhận (NHAN_VIEN_KHO)
  const handleConfirmReceive = async () => {
    if (!receiveModalReceipt) return;
    setActionLoading(true);
    setActionError('');

    try {
      const itemsPayload: ReceiveItemInput[] = (receiveModalReceipt.items || []).map((it) => ({
        ma_sp: it.ma_sp,
        so_luong_thuc_nhan: Number(receiveInputs[it.ma_sp]) || 0,
      }));

      for (const p of itemsPayload) {
        if (p.so_luong_thuc_nhan < 0) {
          setActionError(`Số lượng thực nhận sản phẩm ${p.ma_sp} không được âm!`);
          setActionLoading(false);
          return;
        }
      }

      const res = await api.post(`/inventory/import/${receiveModalReceipt.ma_phieu_nhap}/confirm-receive`, {
        items: itemsPayload,
      });

      const resData = res.data?.data;
      if (resData?.has_shortage) {
        setStatus({
          type: 'error',
          text: `⚠️ Phiếu ${receiveModalReceipt.ma_phieu_nhap}: Phát hiện thiếu hàng khi kiểm đếm. Đã ghi nhận đợt nhập này vào tồn kho và chuyển Quản lý xử lý chênh lệch (THIEU_HANG).`,
        });
      } else {
        setStatus({
          type: 'success',
          text: `✅ Phiếu ${receiveModalReceipt.ma_phieu_nhap}: Đã kiểm đếm đủ 100% hàng. Phiếu hoàn tất nhập kho (DA_NHAP).`,
        });
      }

      setReceiveModalReceipt(null);
      fetchImportReceipts();
    } catch (err: any) {
      setActionError(err.response?.data?.message || err.message || 'Lỗi kiểm đếm nhập kho');
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Mở Modal Xử lý thiếu hàng (QUAN_LY_KHO)
  const openShortageModal = (receipt: ImportReceiptListItem) => {
    setShortageModalReceipt(receipt);
    setShortageAction('SUPPLEMENT');
    setShortageNote('');
    setActionError('');
  };

  // 6. Xác nhận Xử lý thiếu hàng (QUAN_LY_KHO)
  const handleShortageSubmit = async () => {
    if (!shortageModalReceipt) return;
    setActionLoading(true);
    setActionError('');

    try {
      if (shortageAction === 'ACCEPT') {
        await api.post(`/inventory/import/${shortageModalReceipt.ma_phieu_nhap}/accept-shortage`, {
          ly_do: shortageNote.trim(),
        });
        setStatus({
          type: 'success',
          text: `✅ Đã chấp nhận số lượng thiếu cho phiếu ${shortageModalReceipt.ma_phieu_nhap}. Phiếu đã chốt hoàn tất (DA_NHAP).`,
        });
      } else {
        await api.post(`/inventory/import/${shortageModalReceipt.ma_phieu_nhap}/request-supplement`, {
          ghi_chu: shortageNote.trim(),
        });
        setStatus({
          type: 'success',
          text: `✅ Đã gửi yêu cầu Nhà cung cấp giao hàng bổ sung cho phiếu ${shortageModalReceipt.ma_phieu_nhap} (Chuyển Chờ Giao Bổ Sung).`,
        });
      }

      setShortageModalReceipt(null);
      fetchImportReceipts();
    } catch (err: any) {
      setActionError(err.response?.data?.message || err.message || 'Lỗi xử lý thiếu hàng');
    } finally {
      setActionLoading(false);
    }
  };

  // Helper hiển thị badge trạng thái
  const getStatusBadge = (trangThai: string) => {
    switch (trangThai) {
      case 'CHO_DUYET':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">Chờ Duyệt</span>;
      case 'DA_DUYET':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">Đã Duyệt</span>;
      case 'THIEU_HANG':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">Thiếu Hàng</span>;
      case 'CHO_GIAO_BO_SUNG':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-orange-50 text-orange-700 border border-orange-200">Chờ Giao Bổ Sung</span>;
      case 'DA_NHAP':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Đã Nhập Kho</span>;
      case 'TU_CHOI':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-300">Từ Chối</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">{trangThai}</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header Trang */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl text-white shadow-md ${isImport ? 'bg-blue-600' : 'bg-purple-600'}`}>
            {isImport ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {isImport ? 'Quản Lý Nhập Kho Hàng' : 'Tạo Phiếu Xuất Kho Hàng'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isImport
                ? 'Quy trình nhập kho 3 giai đoạn: Tạo yêu cầu → Duyệt → Kiểm đếm nhận hàng & Xử lý thiếu'
                : 'Tạo đơn xuất hàng cho Khách Hàng / Chi Nhánh'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            isImport ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-purple-100 text-purple-700 border border-purple-200'
          }`}>
            VAI TRÒ: {userRole || 'KHÁCH'}
          </span>
        </div>
      </div>

      {/* Thông báo trạng thái */}
      {status.text && (
        <div className={`p-4 text-sm font-semibold rounded-xl border flex items-center justify-between shadow-sm ${
          status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <span>{status.text}</span>
          <button onClick={() => setStatus({ type: '', text: '' })} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Form Container (Hỗ trợ đa sản phẩm) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <span>{isImport ? 'Tạo Yêu Cầu Nhập Kho Mới' : 'Tạo Đơn Xuất Kho'}</span>
          </h2>
          <span className="text-xs text-slate-400">Trạng thái ban đầu: <strong>CHO_DUYET</strong></span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Thông tin chung */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                Mã Phiếu Giao Dịch <Sparkles className="w-3 h-3 text-amber-500" />
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  className="w-full border border-slate-200 bg-slate-100 p-2.5 rounded-lg text-xs font-mono font-bold text-slate-700 cursor-not-allowed pr-14"
                  value={formHeader.ma_phieu}
                />
                <span className="absolute right-2 top-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-sans uppercase font-bold">
                  AUTO
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                Kho Tiếp Nhận <Lock className="w-3 h-3 text-slate-400" />
              </label>
              <div className="w-full border border-slate-200 bg-slate-100 p-2.5 rounded-lg text-xs font-bold text-slate-700 flex items-center justify-between cursor-not-allowed">
                <span>{selectedWarehouse} - Chi Nhánh</span>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded uppercase font-semibold">Cố định</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {isImport ? 'Nhà Cung Cấp (Đối tác)' : 'Khách Hàng / Bên Nhận'}
              </label>
              <select
                className="w-full border border-slate-300 p-2 rounded-lg text-xs focus:outline-blue-500 disabled:bg-slate-100 font-medium"
                value={formHeader.ma_partner}
                disabled={loadingMaster}
                onChange={(e) => setFormHeader({ ...formHeader, ma_partner: e.target.value })}
              >
                {isImport
                  ? master?.nha_cung_cap?.map((ncc) => (
                      <option key={ncc.ma_ncc} value={ncc.ma_ncc}>{ncc.ten_ncc} ({ncc.ma_ncc})</option>
                    ))
                  : master?.khach_hang?.map((kh) => (
                      <option key={kh.ma_kh} value={kh.ma_kh}>{kh.ten_kh} ({kh.ma_kh})</option>
                    ))}
              </select>
            </div>
          </div>

          {/* Danh sách mặt hàng (Dynamic Line Items) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Danh Sách Sản Phẩm Trong Phiếu ({lineItems.length})
              </label>
              <button
                type="button"
                onClick={handleAddLineItem}
                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm Sản Phẩm</span>
              </button>
            </div>

            <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
              {lineItems.map((item, index) => {
                const spInfo = master?.san_pham.find((s) => s.ma_sp === item.ma_sp);
                const lineTotal = (Number(item.so_luong) || 0) * (Number(item.don_gia) || 0);

                return (
                  <div key={item.id} className="grid grid-cols-12 gap-3 items-center bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="col-span-1 text-xs font-bold text-slate-400 text-center">#{index + 1}</span>

                    <div className="col-span-4">
                      <select
                        className="w-full border border-slate-300 p-2 rounded-lg text-xs font-semibold text-slate-800 focus:outline-blue-500 bg-white"
                        value={item.ma_sp}
                        onChange={(e) => handleItemProductChange(item.id, e.target.value)}
                      >
                        {master?.san_pham?.map((sp) => (
                          <option key={sp.ma_sp} value={sp.ma_sp}>
                            {sp.ten_sp} ({sp.ma_sp})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          className="w-full border border-slate-300 p-2 rounded-lg text-xs font-bold text-slate-800 focus:outline-blue-500 text-right pr-8"
                          value={item.so_luong}
                          onChange={(e) => handleItemQtyChange(item.id, Number(e.target.value))}
                        />
                        <span className="absolute right-2 top-2 text-[10px] text-slate-400">
                          {spInfo?.don_vi || 'cái'}
                        </span>
                      </div>
                    </div>

                    <div className="col-span-2">
                      <div className="relative">
                        <input
                          type="text"
                          readOnly
                          className="w-full border border-slate-200 bg-slate-100 p-2 rounded-lg text-xs font-mono font-semibold text-slate-600 text-right pr-8"
                          value={Number(item.don_gia).toLocaleString('vi-VN')}
                        />
                        <span className="absolute right-2 top-2 text-[10px] text-slate-400">đ</span>
                      </div>
                    </div>

                    <div className="col-span-2 text-right font-mono font-bold text-xs text-slate-800">
                      {lineTotal.toLocaleString('vi-VN')} đ
                    </div>

                    <div className="col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(item.id)}
                        disabled={lineItems.length <= 1}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                        title="Xóa dòng"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Bar & Tổng kết */}
          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <div className="flex items-center gap-6 text-xs text-slate-600">
              <div>Tổng số lượng: <strong className="text-slate-800 font-mono text-sm">{totalQuantity.toLocaleString('vi-VN')}</strong></div>
              <div>Tổng tiền: <strong className="text-blue-700 font-mono text-sm">{totalAmount.toLocaleString('vi-VN')} VNĐ</strong></div>
            </div>

            <button
              type="submit"
              disabled={formSubmitting || !isNhanVienKho}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-white text-xs shadow-md transition-all cursor-pointer ${
                formSubmitting || !isNhanVienKho
                  ? 'bg-slate-400 cursor-not-allowed'
                  : isImport
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                  : 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{formSubmitting ? 'Đang gửi...' : isImport ? 'Gửi Yêu Cầu Nhập Kho' : 'Xác Nhận Xuất Kho'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Bảng Danh Sách Phiếu Nhập Kho (Chỉ hiển thị khi ở tab Nhập kho) */}
      {isImport && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>Danh Sách Phiếu Nhập Kho</span>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
                  {importReceipts.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Theo dõi toàn bộ vòng đời và thực hiện duyệt, nhận hàng, xử lý thiếu</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-xs border border-slate-200 bg-slate-50 font-medium p-1.5 rounded-lg focus:outline-blue-500"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="CHO_DUYET">Chờ Duyệt (CHO_DUYET)</option>
                  <option value="DA_DUYET">Đã Duyệt (DA_DUYET)</option>
                  <option value="THIEU_HANG">Thiếu Hàng (THIEU_HANG)</option>
                  <option value="CHO_GIAO_BO_SUNG">Chờ Giao Bổ Sung (CHO_GIAO_BO_SUNG)</option>
                  <option value="DA_NHAP">Đã Nhập (DA_NHAP)</option>
                  <option value="TU_CHOI">Từ Chối (TU_CHOI)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={fetchImportReceipts}
                disabled={loadingReceipts}
                className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                title="Tải lại danh sách"
              >
                <RefreshCw className={`w-4 h-4 ${loadingReceipts ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {receiptsError && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{receiptsError}</span>
            </div>
          )}

          {loadingReceipts && (
            <div className="py-8 text-center text-slate-400 text-xs font-medium flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Đang tải danh sách phiếu nhập kho...</span>
            </div>
          )}

          {!loadingReceipts && !receiptsError && importReceipts.length === 0 && (
            <div className="py-10 text-center text-slate-400 space-y-2">
              <FileText className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-medium">Chưa có phiếu nhập nào tại kho {selectedWarehouse} {filterStatus ? `với trạng thái ${filterStatus}` : ''}</p>
            </div>
          )}

          {!loadingReceipts && !receiptsError && importReceipts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase font-bold tracking-wider">
                    <th className="py-2.5 px-3">Mã Phiếu</th>
                    <th className="py-2.5 px-3">Nhà Cung Cấp</th>
                    <th className="py-2.5 px-3">Ngày Nhập</th>
                    <th className="py-2.5 px-3 text-right">Tổng SL</th>
                    <th className="py-2.5 px-3 text-right">Tổng Tiền</th>
                    <th className="py-2.5 px-3 text-center">Trạng Thái</th>
                    <th className="py-2.5 px-3 text-center">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {importReceipts.map((receipt) => (
                    <tr key={receipt.ma_phieu_nhap} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        {receipt.ma_phieu_nhap}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-700">
                        {receipt.ten_ncc || receipt.ma_ncc || '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                        {new Date(receipt.ngay_nhap).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                        {receipt.tong_so_luong.toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold text-slate-700">
                        {receipt.tong_tien.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="py-3 px-3 text-center">
                        {getStatusBadge(receipt.trang_thai)}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Nút Xem chi tiết (luôn có) */}
                          <button
                            type="button"
                            onClick={() => setDetailModalReceipt(receipt)}
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            title="Xem chi tiết phiếu"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Nhóm nút Duyệt / Từ chối (Dành cho Quản lý kho khi CHO_DUYET) */}
                          {receipt.trang_thai === 'CHO_DUYET' && isQuanLyKho && (
                            <>
                              <button
                                type="button"
                                onClick={() => setApproveRejectModal({ receipt, type: 'APPROVE' })}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                                title="Duyệt yêu cầu"
                              >
                                <Check className="w-3 h-3" />
                                <span>Duyệt</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setApproveRejectModal({ receipt, type: 'REJECT' })}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                                title="Từ chối yêu cầu"
                              >
                                <Ban className="w-3 h-3" />
                                <span>Từ chối</span>
                              </button>
                            </>
                          )}

                          {/* Nhóm nút Kiểm đếm nhận hàng (Dành cho Nhân viên kho khi DA_DUYET hoặc CHO_GIAO_BO_SUNG) */}
                          {(receipt.trang_thai === 'DA_DUYET' || receipt.trang_thai === 'CHO_GIAO_BO_SUNG') && isNhanVienKho && (
                            <button
                              type="button"
                              onClick={() => openReceiveModal(receipt)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-[11px] shadow-2xs transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <Truck className="w-3 h-3" />
                              <span>{receipt.trang_thai === 'CHO_GIAO_BO_SUNG' ? 'Nhận bổ sung' : 'Kiểm đếm nhận'}</span>
                            </button>
                          )}

                          {/* Nhóm nút Xử lý thiếu hàng (Dành cho Quản lý kho khi THIEU_HANG) */}
                          {receipt.trang_thai === 'THIEU_HANG' && isQuanLyKho && (
                            <button
                              type="button"
                              onClick={() => openShortageModal(receipt)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded text-[11px] shadow-2xs transition-colors cursor-pointer flex items-center gap-1 animate-pulse"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              <span>Xử lý thiếu</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: XEM CHI TIẾT PHIẾU */}
      {detailModalReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span>Chi Tiết Phiếu Nhập:</span>
                  <span className="font-mono text-blue-600">{detailModalReceipt.ma_phieu_nhap}</span>
                </h3>
                <p className="text-xs text-slate-400">Kho: {detailModalReceipt.ma_kho} • NCC: {detailModalReceipt.ten_ncc || detailModalReceipt.ma_ncc}</p>
              </div>
              <button onClick={() => setDetailModalReceipt(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg">
                <span>Trạng thái: <strong>{getStatusBadge(detailModalReceipt.trang_thai)}</strong></span>
                <span>Ngày tạo: <strong>{new Date(detailModalReceipt.ngay_nhap).toLocaleString('vi-VN')}</strong></span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                    <tr>
                      <th className="py-2 px-3">Mã SKU</th>
                      <th className="py-2 px-3">Tên Sản Phẩm</th>
                      <th className="py-2 px-3 text-right">Số Lượng</th>
                      <th className="py-2 px-3 text-right">Đơn Giá</th>
                      <th className="py-2 px-3 text-right">Thành Tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {detailModalReceipt.items?.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{it.ma_sp}</td>
                        <td className="py-2.5 px-3 text-slate-800">{it.ten_sp || '—'}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">{it.so_luong} {it.don_vi || ''}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">{Number(it.don_gia).toLocaleString('vi-VN')} đ</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                          {(Number(it.so_luong) * Number(it.don_gia)).toLocaleString('vi-VN')} đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center text-xs font-bold pt-2 border-t border-slate-100">
                <span className="text-slate-500">Tổng cộng: {detailModalReceipt.tong_so_luong.toLocaleString('vi-VN')} sản phẩm</span>
                <span className="text-blue-700 text-sm font-mono">{detailModalReceipt.tong_tien.toLocaleString('vi-VN')} VNĐ</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailModalReceipt(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DUYỆT / TỪ CHỐI (QUAN_LY_KHO) */}
      {approveRejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">
                {approveRejectModal.type === 'APPROVE' ? 'Xác Nhận Duyệt Phiếu Nhập' : 'Từ Chối Phiếu Nhập'}
              </h3>
              <button onClick={() => setApproveRejectModal(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {actionError}
              </div>
            )}

            <p className="text-xs text-slate-600 leading-relaxed">
              Phiếu nhập: <strong className="font-mono text-slate-800">{approveRejectModal.receipt.ma_phieu_nhap}</strong>
              <br />
              Nhà cung cấp: <strong>{approveRejectModal.receipt.ten_ncc || approveRejectModal.receipt.ma_ncc}</strong>
              <br />
              Tổng số lượng: <strong className="font-mono">{approveRejectModal.receipt.tong_so_luong}</strong> • Tổng tiền: <strong className="font-mono">{approveRejectModal.receipt.tong_tien.toLocaleString('vi-VN')} đ</strong>
            </p>

            {approveRejectModal.type === 'APPROVE' ? (
              <p className="text-xs text-emerald-700 bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                Sau khi duyệt, phiếu chuyển trạng thái <strong>ĐÃ DUYỆT (DA_DUYET)</strong> để nhân viên kho tiếp nhận và kiểm đếm thực tế.
              </p>
            ) : (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">Lý do từ chối (tùy chọn):</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-xs focus:outline-blue-500 font-medium"
                  rows={3}
                  placeholder="Nhập lý do từ chối phiếu (sai giá, vượt ngân sách...)"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApproveRejectModal(null)}
                disabled={actionLoading}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Hủy
              </button>
              {approveRejectModal.type === 'APPROVE' ? (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={actionLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Đang duyệt...' : 'Xác Nhận Duyệt'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={actionLoading}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'Đang xử lý...' : 'Xác Nhận Từ Chối'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: KIỂM ĐẾM NHẬN HÀNG (NHAN_VIEN_KHO) */}
      {receiveModalReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base">
                  Kiểm Đếm Thực Nhận: <span className="font-mono text-blue-600">{receiveModalReceipt.ma_phieu_nhap}</span>
                </h3>
                <p className="text-xs text-slate-400">
                  {receiveModalReceipt.trang_thai === 'CHO_GIAO_BO_SUNG'
                    ? 'Đợt nhận bổ sung: Nhập số lượng thực nhận đợt này'
                    : 'Đợt nhận đầu tiên: Đối chiếu số lượng thực tế với đơn hàng'}
                </p>
              </div>
              <button onClick={() => setReceiveModalReceipt(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {actionError}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 bg-slate-50 p-2.5 rounded-lg">
                <span>Nhà cung cấp: <strong>{receiveModalReceipt.ten_ncc || receiveModalReceipt.ma_ncc}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    const full: Record<string, number> = {};
                    receiveModalReceipt.items?.forEach((it) => {
                      full[it.ma_sp] = Number(it.so_luong);
                    });
                    setReceiveInputs(full);
                  }}
                  className="text-blue-600 hover:text-blue-800 text-xs font-bold cursor-pointer underline"
                >
                  Điền đủ 100%
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {receiveModalReceipt.items?.map((it) => (
                  <div key={it.ma_sp} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg bg-white">
                    <div>
                      <div className="text-xs font-bold text-slate-800">{it.ten_sp || it.ma_sp}</div>
                      <div className="text-[11px] text-slate-400 font-mono">SKU: {it.ma_sp} • Cần nhận: <strong className="text-slate-700">{it.so_luong}</strong> {it.don_vi || ''}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-semibold text-slate-500">Thực nhận:</label>
                      <input
                        type="number"
                        min="0"
                        className="w-24 border border-slate-300 p-1.5 rounded-lg text-xs font-mono font-bold text-right focus:outline-blue-500 text-slate-800"
                        value={receiveInputs[it.ma_sp] ?? it.so_luong}
                        onChange={(e) =>
                          setReceiveInputs({
                            ...receiveInputs,
                            [it.ma_sp]: Math.max(0, Number(e.target.value)),
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-500 italic bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                * Lưu ý: Nếu nhập thiếu so với số lượng đã duyệt, phiếu sẽ chuyển sang <strong>THIEU_HANG</strong> và số lượng thực nhận đợt này sẽ được ghi tăng kho và sổ cái ngay lập tức.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReceiveModalReceipt(null)}
                disabled={actionLoading}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmReceive}
                disabled={actionLoading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Đang ghi nhận...' : 'Xác Nhận Kiểm Đếm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: XỬ LÝ THIẾU HÀNG (QUAN_LY_KHO) */}
      {shortageModalReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span>Xử Lý Phiếu Thiếu Hàng</span>
              </h3>
              <button onClick={() => setShortageModalReceipt(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {actionError}
              </div>
            )}

            <div className="space-y-3">
              <div className="text-xs bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg leading-relaxed">
                Phiếu: <strong className="font-mono">{shortageModalReceipt.ma_phieu_nhap}</strong>
                <br />
                Phát hiện chênh lệch thiếu hàng khi kiểm đếm thực tế. Vui lòng chọn phương án giải quyết:
              </div>

              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  shortageAction === 'SUPPLEMENT' ? 'border-orange-500 bg-orange-50/50 ring-1 ring-orange-400' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <input
                    type="radio"
                    name="shortage_action"
                    checked={shortageAction === 'SUPPLEMENT'}
                    onChange={() => setShortageAction('SUPPLEMENT')}
                    className="mt-0.5 text-orange-600 focus:ring-orange-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">1. Yêu cầu Nhà cung cấp giao bổ sung (Khuyên dùng)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Chuyển trạng thái phiếu sang <strong>CHO_GIAO_BO_SUNG</strong>. Khi NCC giao phần thiếu, nhân viên kho tiếp tục kiểm đếm đợt tiếp theo.
                    </div>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  shortageAction === 'ACCEPT' ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-400' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <input
                    type="radio"
                    name="shortage_action"
                    checked={shortageAction === 'ACCEPT'}
                    onChange={() => setShortageAction('ACCEPT')}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-800">2. Chấp nhận thiếu & Chốt phiếu hoàn tất</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Điều chỉnh số lượng hóa đơn về đúng số lượng thực tế đã nhận và chuyển sang <strong>DA_NHAP</strong> (Hoàn tất).
                    </div>
                  </div>
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  {shortageAction === 'SUPPLEMENT' ? 'Ghi chú giao bổ sung (hạn giao, thỏa thuận...):' : 'Lý do chấp nhận thiếu:'}
                </label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:outline-blue-500 font-medium"
                  placeholder={shortageAction === 'SUPPLEMENT' ? 'Vd: Hẹn giao nốt trong 3 ngày' : 'Vd: Nhà cung cấp hết hàng đợt này'}
                  value={shortageNote}
                  onChange={(e) => setShortageNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShortageModalReceipt(null)}
                disabled={actionLoading}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleShortageSubmit}
                disabled={actionLoading}
                className={`px-5 py-2 text-white font-bold text-xs rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-50 ${
                  shortageAction === 'SUPPLEMENT' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {actionLoading ? 'Đang xử lý...' : shortageAction === 'SUPPLEMENT' ? 'Gửi Yêu Cầu Giao Bổ Sung' : 'Chấp Nhận Thiếu & Chốt Phiếu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}