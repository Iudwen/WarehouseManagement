import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [username, setUsername] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const mockUser = { username, role: 'MANAGER', defaultWarehouse: 'HN01' };
    const mockToken = 'mock-jwt-token-2026';
    login(mockUser, mockToken);
    navigate('/');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <form onSubmit={handleLogin} className="p-8 bg-white rounded-xl shadow-md w-96 space-y-4">
        <h2 className="text-2xl font-bold text-center text-slate-800">Đăng Nhập Hệ Thống Kho</h2>
        <div>
          <label className="block text-sm font-semibold mb-1">Tài khoản</label>
          <input
            type="text"
            required
            className="w-full border p-2 rounded focus:outline-blue-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Mật khẩu</label>
          <input type="password" required defaultValue="123456" className="w-full border p-2 rounded" />
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700">
          Đăng Nhập
        </button>
      </form>
    </div>
  );
}