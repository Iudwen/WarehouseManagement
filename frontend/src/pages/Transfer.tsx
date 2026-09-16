import React, { useState } from 'react';
import api from '../services/api';

export default function Transfer() {
  const [formData, setFormData] = useState({
    ma_phieu_dc: '',
    kho_xuat: 'HN01',
    kho_nhap: 'DN01',
    ma_sp: 'SP_TV_OLED_55',
    so_luong: 1,
  });
  const [status, setStatus] = useState({ type: '', text: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: '', text: '' });

    if (formData.kho_xuat === formData.kho_nhap) {
      setStatus({ type: 'error', text: '❌ Kho xuất và kho nhập không được trùng nhau!' });
      return;
    }

    try {
      const payload = {
        ma_phieu_dc: formData.ma_phieu_dc,
        kho_xuat: formData.kho_xuat,
        kho_nhap: formData.kho_nhap,
        items: [{ ma_sp: formData.ma_sp, so_luong: Number(formData.so_luong) }],
      };
      await api.post('/transfer/transfer', payload);
      setStatus({ type: 'success', text: '✅ Điều chuyển kho thành công!' });
    } catch (err: any) {
      setStatus({ type: 'error', text: `❌ Lỗi: ${err.response?.data?.message || err.message}` });
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white rounded-xl shadow-md border mt-6">
      <h2 className="text-2xl font-bold mb-4 text-slate-800">Điều Chuyển Hàng Liên Chi Nhánh</h2>

      {status.text && (
        <div className={`p-3 mb-4 text-sm font-semibold rounded ${status.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {status.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-1">Mã Phiếu Điều Chuyển</label>
          <input
            type="text"
            required
            placeholder="DC_HN_DN_2026_001"
            className="w-full border p-2 rounded"
            value={formData.ma_phieu_dc}
            onChange={(e) => setFormData({ ...formData, ma_phieu_dc: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Kho Xuất (Nguồn)</label>
            <select
              className="w-full border p-2 rounded"
              value={formData.kho_xuat}
              onChange={(e) => setFormData({ ...formData, kho_xuat: e.target.value })}
            >
              <option value="HN01">Kho Hà Nội (HN01)</option>
              <option value="DN01">Kho Đà Nẵng (DN01)</option>
              <option value="HCM01">Kho TP.HCM (HCM01)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Kho Nhập (Đích)</label>
            <select
              className="w-full border p-2 rounded"
              value={formData.kho_nhap}
              onChange={(e) => setFormData({ ...formData, kho_nhap: e.target.value })}
            >
              <option value="DN01">Kho Đà Nẵng (DN01)</option>
              <option value="HN01">Kho Hà Nội (HN01)</option>
              <option value="HCM01">Kho TP.HCM (HCM01)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
            <label className="block text-sm font-semibold mb-1">Số Lượng Chuyển</label>
            <input
              type="number"
              min="1"
              className="w-full border p-2 rounded"
              value={formData.so_luong}
              onChange={(e) => setFormData({ ...formData, so_luong: Number(e.target.value) })}
            />
          </div>
        </div>

        <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded font-bold hover:bg-indigo-700">
          Xác Nhận Chuyển Hàng
        </button>
      </form>
    </div>
  );
}