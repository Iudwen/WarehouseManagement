import { Search, Bell, LogOut, Lock } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  QUAN_LY_KHO: 'Quản lý kho',
  NHAN_VIEN_KHO: 'Nhân viên kho',
  DIEU_PHOI: 'Điều phối viên',
  DATA_ANALYST: 'Chuyên viên phân tích',
};

export default function Header() {
  const { selectedWarehouse, setSelectedWarehouse, isWarehouseLocked } = useWarehouse();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const displayName = user?.ho_ten || user?.username || 'Chưa đăng nhập';
  const roleLabel = user?.vai_tro ? ROLE_LABELS[user.vai_tro] || user.vai_tro : 'Khách';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'U';

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
          {isWarehouseLocked ? (
            <div className="flex items-center gap-1.5 bg-slate-100 font-bold text-slate-700 text-xs px-3 py-1.5 rounded-lg border border-slate-300 select-none" title="Kho cố định theo tài khoản chi nhánh">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>{selectedWarehouse === 'HN01' ? 'Kho Hà Nội (HN01)' : selectedWarehouse === 'DN01' ? 'Kho Đà Nẵng (DN01)' : selectedWarehouse === 'HCM01' ? 'Kho TP.HCM (HCM01)' : selectedWarehouse}</span>
            </div>
          ) : (
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="bg-blue-50 font-bold text-blue-700 text-xs px-3 py-1.5 rounded-lg border border-blue-200 focus:outline-blue-500 cursor-pointer hover:bg-blue-100 transition-all"
            >
              <option value="HN01">Kho Hà Nội (HN01)</option>
              <option value="DN01">Kho Đà Nẵng (DN01)</option>
              <option value="HCM01">Kho TP.HCM (HCM01)</option>
            </select>
          )}
        </div>

        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="w-9 h-9 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-white font-bold text-xs">
            {initials}
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-slate-800 leading-tight">{displayName}</div>
            <div className="text-xs text-slate-500 font-medium">
              {roleLabel} {user?.ma_kho ? `• ${user.ma_kho}` : ''}
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            className="p-1.5 ml-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}