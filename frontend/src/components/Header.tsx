import { Search, Bell, LogOut, Lock, Building2 } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  QUAN_LY_KHO: 'Quản lý kho',
  NHAN_VIEN_KHO: 'Nhân viên kho',
  DIEU_PHOI: 'Điều phối viên',
  DATA_ANALYST: 'Chuyên viên phân tích',
};

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Bảng Điều Khiển',
  '/inventory': 'Danh Mục Tồn Kho',
  '/map': 'Sơ Đồ Vị Trí Kho',
  '/import': 'Nhập Kho',
  '/export': 'Xuất Kho',
  '/transfer': 'Điều Chuyển Liên Kho (Saga)',
  '/audit': 'Kiểm Kê & Báo Cáo',
  '/reports': 'Dự Báo & Khai Phá Dữ Liệu',
  '/forecast': 'Dự Báo Nhu Cầu Tồn Kho',
  '/data-mining': 'Khai Phá Dữ Liệu (DSS)',
  '/monitoring': 'Giám Sát Hệ Thống Phân Tán',
  '/backup': 'Sao Lưu & Phục Hồi Dữ Liệu',
};

export default function Header() {
  const { selectedWarehouse, setSelectedWarehouse, isWarehouseLocked } = useWarehouse();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const displayName = user?.ho_ten || user?.username || 'Chưa đăng nhập';
  const roleLabel = user?.vai_tro ? ROLE_LABELS[user.vai_tro] || user.vai_tro : 'Khách';
  const currentRouteName = ROUTE_LABELS[location.pathname] || 'Trang Hiện Tại';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'U';

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs z-30 select-none">
      {/* Left: Breadcrumbs & Search */}
      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Link to="/" className="text-slate-400 hover:text-slate-700 transition-colors">
            WMS
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-800">{currentRouteName}</span>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200/70 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 px-3.5 py-1.5 rounded-xl text-xs border border-slate-200 transition-all w-60 sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Tìm SKU, sản phẩm, mã phiếu..."
            className="bg-transparent border-none outline-none w-full text-slate-700 placeholder-slate-400 text-xs"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
            /
          </kbd>
        </div>
      </div>

      {/* Right: Warehouse Context, Health Status, Notifications & Profile */}
      <div className="flex items-center gap-4">
        {/* Dynamic Warehouse Selector / Branch Lock Indicator */}
        <div className="flex items-center gap-2">
          <span className="hidden lg:inline text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Chi nhánh:
          </span>
          {isWarehouseLocked ? (
            <div
              className="flex items-center gap-1.5 bg-slate-100 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-xl border border-slate-300 select-none shadow-2xs"
              title="Kho chi nhánh được cố định theo phân quyền tài khoản"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {selectedWarehouse === 'HN01'
                  ? 'Kho Hà Nội (HN01)'
                  : selectedWarehouse === 'DN01'
                  ? 'Kho Đà Nẵng (DN01)'
                  : selectedWarehouse === 'HCM01'
                  ? 'Kho TP.HCM (HCM01)'
                  : selectedWarehouse}
              </span>
            </div>
          ) : (
            <div className="relative">
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="bg-blue-50 hover:bg-blue-100/80 font-bold text-blue-700 text-xs px-3 py-1.5 pr-8 rounded-xl border border-blue-200 focus:outline-blue-500 cursor-pointer shadow-2xs transition-all appearance-none"
              >
                <option value="ALL">🌐 Toàn quốc (Tất cả chi nhánh)</option>
                <option value="HN01">🏢 Kho Hà Nội (HN01)</option>
                <option value="DN01">🏢 Kho Đà Nẵng (DN01)</option>
                <option value="HCM01">🏢 Kho TP.HCM (HCM01)</option>
              </select>
              <Building2 className="w-3.5 h-3.5 text-blue-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          )}
        </div>

        {/* System Pulse Indicator */}
        <div
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-semibold"
          title="Tất cả các node dữ liệu đang kết nối bình thường"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Hệ Thống Sẵn Sàng</span>
        </div>

        {/* Notifications */}
        <button
          className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          title="Thông báo hệ thống"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white"></span>
        </button>

        {/* User Profile Card */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-white font-bold text-xs shadow-xs">
            {initials}
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-bold text-slate-900 leading-tight">
              {displayName}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {roleLabel} {user?.ma_kho ? `• ${user.ma_kho}` : ''}
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Đăng xuất khỏi hệ thống"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
