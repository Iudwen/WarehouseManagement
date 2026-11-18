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

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  isAdmin?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export default function Sidebar() {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.vai_tro === 'ADMIN';

  const navSections: NavSection[] = [
    {
      title: 'TỔNG QUAN',
      items: [
        { path: '/', label: 'Bảng Điều Khiển', icon: LayoutDashboard },
      ],
    },
    {
      title: 'VẬN HÀNH KHO',
      items: [
        { path: '/inventory', label: 'Danh Mục Tồn Kho', icon: Package },
        { path: '/map', label: 'Sơ Đồ Vị Trí Kho', icon: MapPin },
        { path: '/import', label: 'Nhập Kho', icon: ArrowDownLeft },
        { path: '/export', label: 'Xuất Kho', icon: ArrowUpRight },
        { path: '/transfer', label: 'Điều Chuyển (Saga)', icon: ArrowLeftRight },
      ],
    },
    {
      title: 'PHÂN TÍCH & BÁO CÁO',
      items: [
        { path: '/audit', label: 'Báo Cáo & Kiểm Kê', icon: ClipboardCheck },
        { path: '/reports', label: 'Dự Báo & Data Mining', icon: BrainCircuit },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: 'HẠ TẦNG & QUẢN TRỊ',
            items: [
              { path: '/monitoring', label: 'Giám Sát Phân Tán', icon: Activity, isAdmin: true },
              { path: '/backup', label: 'Sao Lưu & Phục Hồi', icon: DatabaseBackup, isAdmin: true },
            ],
          },
        ]
      : []),
  ];

  return (
    <aside
      className={`${
        isCollapsed ? 'w-20' : 'w-64'
      } transition-all duration-300 bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0 border-r border-slate-800 shrink-0 z-40 select-none shadow-xl`}
    >
      {/* Brand Header */}
      <div className="p-3.5 border-b border-slate-800 relative">
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
              <div className="bg-white rounded-xl p-2 shadow-xs border border-slate-700/40 transition-transform duration-200 group-hover:scale-[1.01] flex items-center justify-center">
                <img
                  src={logoKho}
                  alt="Quản Lý Kho Đa Chi Nhánh"
                  className="w-full h-10 object-contain"
                />
              </div>
            </Link>
            <div className="flex items-center gap-2.5 px-1">
              <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-white tracking-wide uppercase truncate">
                  Enterprise WMS
                </div>
                <div className="text-[10px] text-slate-400 font-medium truncate">
                  Hệ Thống Phân Tán 3 Chi Nhánh
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2 flex flex-col items-center gap-2">
            <Link
              to="/"
              className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600 hover:text-white transition-all"
              title="Enterprise WMS"
            >
              <Building2 className="w-5 h-5" />
            </Link>
          </div>
        )}
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 p-2.5 space-y-4 overflow-y-auto">
        {navSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 pt-1 pb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                {section.title}
              </div>
            )}
            {isCollapsed && idx > 0 && (
              <div className="border-t border-slate-800 my-2" />
            )}

            {section.items.map((item) => {
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
                  className={`flex items-center ${
                    isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'
                  } rounded-xl text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                      : 'hover:bg-slate-800 hover:text-white text-slate-400'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-white' : 'text-slate-400'
                    }`}
                  />
                  {!isCollapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                  {!isCollapsed && item.badge && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer Node Info */}
      <Link 
        to={isAdmin ? "/monitoring" : "/"} 
        title={isAdmin ? "Xem Giám sát Hệ thống" : "Hệ Thống Phân Tán"}
        className={`p-2.5 border-t border-slate-800 m-2 bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-colors block ${
          isCollapsed ? 'text-center' : ''
        }`}
      >
        {!isCollapsed ? (
          <>
            <div className="text-[10px] text-slate-400 font-semibold flex items-center justify-between">
              <span>HẠ TẦNG PHÂN TÁN</span>
              {isAdmin && <span className="text-[10px] text-blue-400 hover:underline">Chi tiết &rarr;</span>}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-emerald-400 font-bold">
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
