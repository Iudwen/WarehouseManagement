import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { LoginResponse } from '../types';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setLoading(true);

    try {
      const response = await api.post<LoginResponse>('/auth/login', {
        username: username.trim(),
        password,
      });

      const { token, user } = response.data;
      if (!token || !user) {
        throw new Error('Dữ liệu phản hồi từ máy chủ không hợp lệ');
      }

      login(
        {
          ma_nguoi_dung: user.ma_nguoi_dung,
          ho_ten: user.ho_ten,
          vai_tro: user.vai_tro,
          ma_kho: user.ma_kho,
          username: username.trim(),
        },
        token
      );

      navigate('/');
    } catch (err: any) {
      console.error('Đăng nhập thất bại:', err);
      const message =
        err.response?.data?.message ||
        err.message ||
        'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <form onSubmit={handleLogin} className="p-8 bg-white rounded-xl shadow-md w-96 space-y-4">
        <h2 className="text-2xl font-bold text-center text-slate-800">Đăng Nhập Hệ Thống Kho</h2>

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Tài khoản</label>
          <input
            type="text"
            required
            disabled={loading}
            className="w-full border border-slate-300 p-2 rounded focus:outline-blue-500 text-slate-800 disabled:bg-slate-100"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Nhập tên đăng nhập"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-slate-700">Mật khẩu</label>
          <input
            type="password"
            required
            disabled={loading}
            className="w-full border border-slate-300 p-2 rounded focus:outline-blue-500 text-slate-800 disabled:bg-slate-100"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 disabled:bg-blue-400 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Đang đăng nhập...</span>
            </>
          ) : (
            'Đăng Nhập'
          )}
        </button>
      </form>
    </div>
  );
}