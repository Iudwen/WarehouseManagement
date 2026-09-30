import React, { useEffect } from 'react';
import { Search, Bell, LogOut } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Header() {
  const { selectedWarehouse, setSelectedWarehouse } = useWarehouse();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Tự động khóa Kho giao diện về đúng kho được cấp nếu không phải ADMIN
  useEffect(() => {
    if (user && user.vai_tro !== 'ADMIN' && user.ma_kho) {
      setSelectedWarehouse(user.ma_kho);
    }
  }, [user, setSelectedWarehouse]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Tạo tên viết tắt cho Avatar (Ví dụ: Phạm Cường -> PC)
  const getInitials = (name?: string) => {
    if (!name) return 'PC';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm">
      {/* Search Bar */}
      <div className="flex items-center gap-3 bg-slate-100 px-3.5 py-1.5 rounded-lg w-80 text-sm border border-slate-200 focus-within:border-blue-500 focus-within:bg-white transition-all">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Tìm SKU, tên sản phẩm, mã phiếu..."
          className="bg-transparent border-none outline-none w-full text-slate-700 placeholder-slate-400"
        />
      </div>

      {/* User Actions & Dynamic Node Selection */}
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">KHO HIỆN TẠI:</span>
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            disabled={user?.vai_tro !== 'ADMIN'}
            title={user?.vai_tro !== 'ADMIN' ? 'Tài khoản nhân viên bị cố định chi nhánh' : 'Chọn kho làm việc'}
            className={`font-bold text-xs px-3 py-1.5 rounded-lg border focus:outline-blue-500 transition-all ${
              user?.vai_tro !== 'ADMIN'
                ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                : 'bg-blue-50 text-blue-700 border-blue-200 cursor-pointer hover:bg-blue-100'
            }`}
          >
            <option value="HN01">Kho Hà Nội (HN01)</option>
            <option value="DN01">Kho Đà Nẵng (DN01)</option>
            <option value="HCM01">Kho TP.HCM (HCM01)</option>
          </select>
        </div>

        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* Thông tin User & Nút Đăng xuất */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-white font-bold text-sm">
            {getInitials(user?.ho_ten)}
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-slate-800 leading-tight">
              {user?.ho_ten || 'Phạm Cường'}
            </div>
            <div className="text-xs text-slate-500 font-medium">
              {user?.vai_tro === 'ADMIN'
                ? 'Quản trị viên'
                : user?.vai_tro === 'MANAGER'
                ? 'Trưởng kho'
                : 'Nhân viên kho'}
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Đăng xuất khỏi hệ thống"
            className="p-2 ml-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-200"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}