import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  MapPin, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ArrowLeftRight, 
  ClipboardCheck, 
  BarChart3,
  Boxes
} from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();

  const menuItems = [
    { path: '/', label: 'Tổng Quan', icon: LayoutDashboard },
    { path: '/inventory', label: 'Quản Lý Tồn Kho', icon: Package },
    { path: '/map', label: 'Sơ Đồ Vị Trí Kho', icon: MapPin },
    { path: '/import', label: 'Nhập Kho', icon: ArrowDownLeft },
    { path: '/export', label: 'Xuất Kho', icon: ArrowUpRight },
    { path: '/transfer', label: 'Điều Chuyển', icon: ArrowLeftRight },
    { path: '/audit', label: 'Kiểm Kê Kho', icon: ClipboardCheck },
    { path: '/reports', label: 'Báo Cáo & Thống Kê', icon: BarChart3 },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col min-h-screen border-r border-slate-800 shrink-0">
      {/* Brand Header */}
      <div className="p-4 flex items-center gap-3 border-b border-slate-800">
        <div className="p-2 bg-blue-600 text-white rounded-lg">
          <Boxes className="w-6 h-6" />
        </div>
        <div>
          <h1 className="font-bold text-white text-base leading-tight tracking-wide">HỆ THỐNG</h1>
          <p className="text-xs text-blue-400 font-medium">Quản Lý Kho WMS</p>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-3 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
                  : 'hover:bg-slate-800 hover:text-white text-slate-400'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer Node Info */}
      <div className="p-3 border-t border-slate-800 m-3 bg-slate-800/50 rounded-lg">
        <div className="text-xs text-slate-400 font-medium">Hệ Thống Phân Tán</div>
        <div className="flex items-center gap-2 mt-1 text-xs text-emerald-400 font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          3 Node Postgres Active
        </div>
      </div>
    </aside>
  );
}