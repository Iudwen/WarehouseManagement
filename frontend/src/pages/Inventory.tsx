import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useWarehouse } from '../contexts/WarehouseContext';
import api from '../services/api';
import type { MasterData } from '../types';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Lock, Sparkles } from 'lucide-react';

export default function Inventory() {
  const location = useLocation();
  const { selectedWarehouse } = useWarehouse();
  
  const isImport = location.pathname === '/import';
  const mode = isImport ? 'IMPORT' : 'EXPORT';

  const [master, setMaster] = useState<MasterData | null>(null);
  const [loadingMaster, setLoadingMaster] = useState<boolean>(true);
  
  // Hàm sinh mã khớp 100% với quy chuẩn codeGenerator.ts ở Backend
  const generateFrontendCode = (importing: boolean, kho: string) => {
    const prefix = importing ? 'PN' : 'PX';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}_${kho}_${dateStr}_${randomSuffix}`;
  };

  const [formData, setFormData] = useState({
    ma_phieu: generateFrontendCode(isImport, selectedWarehouse),
    ma_kho: selectedWarehouse,
    ma_partner: '',
    ma_sp: '',
    so_luong: 1,
    don_gia: 0,
  });

  const [status, setStatus] = useState({ type: '', text: '' });

  // 1. Đồng bộ ma_kho và tự sinh mã mới khi đổi Kho hoặc chuyển tab Import/Export
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      ma_kho: selectedWarehouse,
      ma_phieu: generateFrontendCode(isImport, selectedWarehouse),
    }));
  }, [selectedWarehouse, isImport]);

  useEffect(() => {
    setStatus({ type: '', text: '' });
  }, [location.pathname]);

  // 2. Load Master Data & Điền đơn giá mặc định từ DB
  useEffect(() => {
    const fetchMaster = async () => {
      setLoadingMaster(true);
      try {
        const res = await api.get(`/master-data?ma_kho=${selectedWarehouse}`);
        const data: MasterData = res.data.data || res.data;
        setMaster(data);

        const defaultSp = data.san_pham?.[0];
        const defaultPartner = isImport ? data.nha_cung_cap?.[0]?.ma_ncc : data.khach_hang?.[0]?.ma_kh;
        const initialPrice = defaultSp ? Number(isImport ? defaultSp.gia_nhap : defaultSp.gia_ban) : 0;

        setFormData((prev) => ({
          ...prev,
          ma_sp: defaultSp ? defaultSp.ma_sp : '',
          don_gia: initialPrice,
          ma_partner: defaultPartner || '',
        }));
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu danh mục:', err);
      } finally {
        setLoadingMaster(false);
      }
    };

    fetchMaster();
  }, [selectedWarehouse, isImport]);

  // 3. Đổi sản phẩm -> Đổi đơn giá niêm yết
  const handleProductChange = (spId: string) => {
    const selectedSp = master?.san_pham.find((item) => item.ma_sp === spId);
    const price = selectedSp ? Number(isImport ? selectedSp.gia_nhap : selectedSp.gia_ban) : 0;
    
    setFormData((prev) => ({
      ...prev,
      ma_sp: spId,
      don_gia: price,
    }));
  };

  // 4. Tăng nhanh số lượng (+1, +5, +10)
  const handleAddQty = (amount: number) => {
    setFormData((prev) => ({
      ...prev,
      so_luong: Math.max(1, prev.so_luong + amount),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    try {
      if (isImport) {
        await api.post('/inventory/import', {
          ma_phieu_nhap: formData.ma_phieu, // Gửi mã đang hiển thị lên Backend
          ma_kho: formData.ma_kho,
          ma_ncc: formData.ma_partner,
          items: [{ ma_sp: formData.ma_sp, so_luong: Number(formData.so_luong), don_gia: Number(formData.don_gia) }],
        });
        setStatus({ type: 'success', text: `✅ Tạo phiếu nhập kho (${formData.ma_phieu}) thành công!` });
      } else {
        await api.post('/inventory/export', {
          ma_phieu_xuat: formData.ma_phieu, // Gửi mã đang hiển thị lên Backend
          ma_kho: formData.ma_kho,
          ma_kh: formData.ma_partner,
          items: [{ ma_sp: formData.ma_sp, so_luong: Number(formData.so_luong), don_gia: Number(formData.don_gia) }],
        });
        setStatus({ type: 'success', text: `✅ Tạo phiếu xuất kho (${formData.ma_phieu}) thành công!` });
      }

      // Sau khi tạo thành công, tự động sinh mã mới cho phiếu tiếp theo
      setFormData((prev) => ({
        ...prev,
        ma_phieu: generateFrontendCode(isImport, selectedWarehouse),
        so_luong: 1,
      }));
    } catch (err: any) {
      setStatus({ type: 'error', text: `❌ Lỗi: ${err.response?.data?.message || err.message}` });
    }
  };

  const selectedSpInfo = master?.san_pham.find((item) => item.ma_sp === formData.ma_sp);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Trang */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl text-white shadow-md ${isImport ? 'bg-blue-600' : 'bg-purple-600'}`}>
            {isImport ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {isImport ? 'Tạo Phiếu Nhập Kho Hàng' : 'Tạo Phiếu Xuất Kho Hàng'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isImport ? 'Ghi nhận sản phẩm nhập từ Nhà Cung Cấp vào CSDL' : 'Tạo đơn xuất hàng cho Khách Hàng / Chi Nhánh'}
            </p>
          </div>
        </div>

        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
          isImport ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-purple-100 text-purple-700 border border-purple-200'
        }`}>
          MODE: {mode}
        </span>
      </div>

      {/* Form Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {status.text && (
          <div className={`p-3.5 mb-6 text-sm font-semibold rounded-lg border ${
            status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            {status.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Group 1: Thông tin chung */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">1. Thông tin chung</h3>
            <div className="grid grid-cols-3 gap-4">
              {/* Ô hiển thị mã phiếu tự động sinh sẵn, khóa read-only */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  Mã Phiếu Giao Dịch <Sparkles className="w-3 h-3 text-amber-500" />
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    className="w-full border border-slate-200 bg-slate-100 p-2.5 rounded-lg text-xs font-mono font-bold text-slate-700 cursor-not-allowed pr-14"
                    value={formData.ma_phieu}
                  />
                  <span className="absolute right-2 top-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-sans uppercase font-bold">
                    AUTO
                  </span>
                </div>
              </div>

              {/* Kho thực hiện khóa cứng */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  Kho Thực Hiện <Lock className="w-3 h-3 text-slate-400" />
                </label>
                <div className="w-full border border-slate-200 bg-slate-100 p-2.5 rounded-lg text-sm font-bold text-slate-700 flex items-center justify-between cursor-not-allowed">
                  <span>{selectedWarehouse} - Kho Chi Nhánh</span>
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded uppercase font-semibold">Cố định</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {isImport ? 'Nhà Cung Cấp (Đối tác)' : 'Khách Hàng / Bên Nhận'}
                </label>
                <select
                  className="w-full border border-slate-300 p-2.5 rounded-lg text-sm focus:outline-blue-500 disabled:bg-slate-100 font-medium"
                  value={formData.ma_partner}
                  disabled={loadingMaster}
                  onChange={(e) => setFormData({ ...formData, ma_partner: e.target.value })}
                >
                  {isImport
                    ? master?.nha_cung_cap?.map((ncc) => (
                        <option key={ncc.ma_ncc} value={ncc.ma_ncc}>{ncc.ten_ncc}</option>
                      ))
                    : master?.khach_hang?.map((kh) => (
                        <option key={kh.ma_kh} value={kh.ma_kh}>{kh.ten_kh}</option>
                      ))}
                </select>
              </div>
            </div>
          </div>

          {/* Group 2: Chi tiết hàng hóa */}
          <div className="pt-2">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">2. Chi tiết mặt hàng</h3>
            <div className="grid grid-cols-12 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="col-span-5">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mặt Hàng (SKU)</label>
                <select
                  className="w-full border border-slate-300 p-2.5 rounded-lg text-sm focus:outline-blue-500 bg-white font-semibold text-slate-800"
                  value={formData.ma_sp}
                  disabled={loadingMaster}
                  onChange={(e) => handleProductChange(e.target.value)}
                >
                  {master?.san_pham?.map((sp) => (
                    <option key={sp.ma_sp} value={sp.ma_sp}>{sp.ten_sp} ({sp.ma_sp})</option>
                  ))}
                </select>
              </div>

              <div className="col-span-4">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Số Lượng {selectedSpInfo?.don_vi ? `(${selectedSpInfo.don_vi})` : ''}
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    className="w-full border border-slate-300 p-2.5 rounded-lg text-sm focus:outline-blue-500 bg-white font-bold text-slate-800"
                    value={formData.so_luong}
                    onChange={(e) => setFormData({ ...formData, so_luong: Math.max(1, Number(e.target.value)) })}
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleAddQty(1)}
                      className="px-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 transition-colors"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddQty(5)}
                      className="px-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 transition-colors"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddQty(10)}
                      className="px-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 transition-colors"
                    >
                      +10
                    </button>
                  </div>
                </div>
              </div>

              {/* Đơn giá niêm yết khóa cứng */}
              <div className="col-span-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  Đơn Giá Niêm Yết <Lock className="w-3 h-3 text-slate-400" />
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    className="w-full border border-slate-200 bg-slate-100 p-2.5 rounded-lg text-sm font-mono font-bold text-slate-700 cursor-not-allowed"
                    value={formData.don_gia.toLocaleString('vi-VN')}
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-semibold">VNĐ</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <div className="text-xs text-slate-500 font-medium">
              Thành tiền dự kiến: <strong className="text-slate-800 text-sm font-mono">{(formData.so_luong * formData.don_gia).toLocaleString('vi-VN')} VNĐ</strong>
            </div>

            <button
              type="submit"
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-white text-sm shadow-md transition-all ${
                isImport
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                  : 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isImport ? 'Xác Nhận Nhập Kho' : 'Xác Nhận Xuất Kho'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}