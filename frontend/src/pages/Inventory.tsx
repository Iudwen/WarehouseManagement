import React, { useState } from 'react';
import api from '../services/api';

export default function Inventory() {
  const [type, setType] = useState<'import' | 'export'>('import');
  const [formData, setFormData] = useState({
    ma_phieu: '',
    ma_kho: 'HN01',
    ma_partner: 'NCC_LG',
    ma_sp: 'SP_TV_OLED_55',
    so_luong: 1,
    don_gia: 15000000,
  });
  const [status, setStatus] = useState({ type: '', text: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    try {
      if (type === 'import') {
        const payload = {
          ma_phieu_nhap: formData.ma_phieu,
          ma_kho: formData.ma_kho,
          ma_ncc: formData.ma_partner,
          items: [{ ma_sp: formData.ma_sp, so_luong: Number(formData.so_luong), don_gia: Number(formData.don_gia) }],
        };
        await api.post('/inventory/import', payload);
        setStatus({ type: 'success', text: '✅ Tạo phiếu nhập kho thành công!' });
      } else {
        const payload = {
          ma_phieu_xuat: formData.ma_phieu,
          ma_kho: formData.ma_kho,
          ma_kh: formData.ma_partner,
          items: [{ ma_sp: formData.ma_sp, so_luong: Number(formData.so_luong), don_gia: Number(formData.don_gia) }],
        };
        await api.post('/inventory/export', payload);
        setStatus({ type: 'success', text: '✅ Tạo phiếu xuất kho thành công!' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', text: `❌ Lỗi: ${err.response?.data?.message || err.message}` });
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white rounded-xl shadow-md border mt-6">
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => { setType('import'); setFormData({ ...formData, ma_partner: 'NCC_LG' }); }}
          className={`flex-1 py-2 rounded-lg font-bold ${type === 'import' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          Nhập Kho
        </button>
        <button
          onClick={() => { setType('export'); setFormData({ ...formData, ma_partner: 'KH_MEDIAMART' }); }}
          className={`flex-1 py-2 rounded-lg font-bold ${type === 'export' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          Xuất Kho
        </button>
      </div>

      {status.text && (
        <div className={`p-3 mb-4 text-sm font-semibold rounded ${status.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {status.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-1">Mã Phiếu</label>
          <input
            type="text"
            required
            placeholder={type === 'import' ? 'PN_HN_2026_001' : 'PX_HN_2026_001'}
            className="w-full border p-2 rounded"
            value={formData.ma_phieu}
            onChange={(e) => setFormData({ ...formData, ma_phieu: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Mã Kho</label>
            <select
              className="w-full border p-2 rounded"
              value={formData.ma_kho}
              onChange={(e) => setFormData({ ...formData, ma_kho: e.target.value })}
            >
              <option value="HN01">Kho Hà Nội (HN01)</option>
              <option value="DN01">Kho Đà Nẵng (DN01)</option>
              <option value="HCM01">Kho TP.HCM (HCM01)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">{type === 'import' ? 'Mã Nhà Cung Cấp' : 'Mã Khách Hàng'}</label>
            <input
              type="text"
              required
              className="w-full border p-2 rounded"
              value={formData.ma_partner}
              onChange={(e) => setFormData({ ...formData, ma_partner: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Sản Phẩm</label>
            <select
              className="w-full border p-2 rounded"
              value={formData.ma_sp}
              onChange={(e) => setFormData({ ...formData, ma_sp: e.target.value })}
            >
              <option value="SP_TV_OLED_55">TV OLED 55 Inch</option>
              <option value="SP_TU_LANH_400L">Tủ lạnh 400L</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Số Lượng</label>
            <input
              type="number"
              min="1"
              className="w-full border p-2 rounded"
              value={formData.so_luong}
              onChange={(e) => setFormData({ ...formData, so_luong: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Đơn Giá (VNĐ)</label>
            <input
              type="number"
              className="w-full border p-2 rounded"
              value={formData.don_gia}
              onChange={(e) => setFormData({ ...formData, don_gia: Number(e.target.value) })}
            />
          </div>
        </div>

        <button type="submit" className="w-full bg-slate-900 text-white py-2 rounded font-bold hover:bg-slate-800">
          Xác Nhận Thực Hiện
        </button>
      </form>
    </div>
  );
}