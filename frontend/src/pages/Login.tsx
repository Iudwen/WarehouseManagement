import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('123456');
  const [maKho, setMaKho] = useState('HN01');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', {
        email,
        password,
        ma_kho: maKho,
      });

      const { token, user } = res.data;
      
      // Gọi hàm login() đã chuẩn hóa với (token, user)
      login(token, user);
      
      // Đăng nhập thành công -> Chuyển sang trang Dashboard chính
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại!');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string, demoKho: string) => {
    setEmail(demoEmail);
    setPassword('123456');
    setMaKho(demoKho);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100 p-4">
      <div className="p-8 bg-white rounded-xl shadow-md w-96 space-y-4">
        <h2 className="text-2xl font-bold text-center text-slate-800">Đăng Nhập Hệ Thống Kho</h2>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-700">Email</label>
            <input
              type="email"
              required
              placeholder="admin@wms.com hoặc cuong_hn@wms.com"
              className="w-full border p-2 rounded text-sm focus:outline-blue-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-700">Mật khẩu</label>
            <input
              type="password"
              required
              className="w-full border p-2 rounded text-sm focus:outline-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-700">Node Kho Đăng Nhập Ban Đầu</label>
            <select
              className="w-full border p-2 rounded text-sm focus:outline-blue-500 bg-white font-medium"
              value={maKho}
              onChange={(e) => setMaKho(e.target.value)}
            >
              <option value="HN01">HN01 - Kho Hà Nội</option>
              <option value="DN01">DN01 - Kho Đà Nẵng</option>
              <option value="HCM01">HCM01 - Kho TP.HCM</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng Nhập'}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Tài khoản demo:</p>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@wms.com', 'HN01')}
              className="p-1.5 bg-slate-50 border border-slate-200 hover:border-blue-500 rounded text-[11px] font-bold text-slate-700 transition-colors"
            >
              ADMIN
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('cuong_hn@wms.com', 'HN01')}
              className="p-1.5 bg-slate-50 border border-slate-200 hover:border-blue-500 rounded text-[11px] font-bold text-slate-700 transition-colors"
            >
              STAFF HN
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('truongkho_dn@wms.com', 'DN01')}
              className="p-1.5 bg-slate-50 border border-slate-200 hover:border-blue-500 rounded text-[11px] font-bold text-slate-700 transition-colors"
            >
              MANAGER DN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}