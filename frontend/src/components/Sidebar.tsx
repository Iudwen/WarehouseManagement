import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  Activity,
  Package, 
  MapPin, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowLeftRight, 
  ClipboardCheck, 
  BrainCircuit,
  Building2,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
} from 'lucide-react';

import logoKho from '../assets/logo_kho_da_chi_nhanh.png';

export default function Sidebar() {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.vai_tro === 'ADMIN';

  const menuItems = [
    { path: '/', label: 'Tổng Quan', icon: LayoutDashboard },
    ...(isAdmin ? [
      { path: '/monitoring', label: 'Giám Sát Hệ Thống', icon: Activity, isAdmin: true },
      { path: '/backup', label: 'Sao Lưu & Phục Hồi', icon: DatabaseBackup, isAdmin: true },
    ] : []),
    { path: '/reports', label: 'Dự Báo & Data Mining', icon: BrainCircuit },
    { path: '/transfer', label: 'Điều Chuyển', icon: ArrowLeftRight },
    { path: '/audit', label: 'Báo Cáo & Kiểm Kê', icon: ClipboardCheck },
    { path: '/inventory', label: 'Danh Mục Tồn Kho', icon: Package },
    { path: '/map', label: 'Sơ Đồ Vị Trí Kho', icon: MapPin },
    { path: '/import', label: 'Nhập Kho', icon: ArrowDownLeft },
    { path: '/export', label: 'Xuất Kho', icon: ArrowUpRight },
  ];

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} transition-all duration-300 bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0 border-r border-slate-800 shrink-0 z-40 overflow-y-auto select-none`}>
      {/* Brand Header */}
      <div className="p-3 border-b border-slate-800 relative">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          className="absolute -right-3 top-5 bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white p-1 rounded-full border border-slate-700 shadow-md transition-all z-50 cursor-pointer"
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {!isCollapsed ? (
          <div className="space-y-3">
            <Link to="/" className="block group" title="Về trang tổng quan">
              <div className="bg-white rounded-xl p-2 shadow-sm border border-slate-700/40 transition-transform duration-200 group-hover:scale-[1.02] flex items-center justify-center">
                <img
                  src={logoKho}
                  alt="Quản Lý Kho Đa Chi Nhánh"
                  className="w-full h-11 object-contain"
                />
              </div>
            </Link>
            <div className="flex items-center gap-2.5 px-1">
              <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-black text-white tracking-wide uppercase">Warehouse DSS</div>
                <div className="text-[10px] text-slate-400 font-medium">Hệ Thống Phân Tán Đa Chi Nhánh</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2 flex flex-col items-center gap-2">
            <Link to="/" className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30" title="Warehouse DSS">
              <Building2 className="w-5 h-5" />
            </Link>
          </div>
        )}
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-2.5 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            location.pathname === item.path ||
            (item.path === '/reports' &&
              (location.pathname === '/data-mining' || location.pathname === '/forecast'));

          return (
            <Link
              key={item.path}
              to={item.path}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-3.5 py-2.5'} rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
                  : 'hover:bg-slate-800 hover:text-white text-slate-400'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              {!isCollapsed && <span className="truncate text-xs">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer Node Info */}
      <Link 
        to={isAdmin ? "/monitoring" : "/"} 
        title={isAdmin ? "Xem Giám sát Hệ thống" : "Hệ Thống Phân Tán"}
        className={`p-2.5 border-t border-slate-800 m-2 bg-slate-800/50 hover:bg-slate-800/80 rounded-xl transition-colors block ${isCollapsed ? 'text-center' : ''}`}
      >
        {!isCollapsed ? (
          <>
            <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span>Hệ Thống Phân Tán</span>
              {isAdmin && <span className="text-[10px] text-blue-400 underline">Chi tiết &rarr;</span>}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              3 Node Postgres Active
            </div>
          </>
        ) : (
          <div className="flex justify-center" title="3 Node Postgres Active (Hệ Thống Phân Tán)">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>
        )}
      </Link>
    </aside>
  );
}
