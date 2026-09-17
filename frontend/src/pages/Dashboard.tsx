import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useWarehouse } from '../contexts/WarehouseContext';
import type { StockItem, MongoEventLog, LowStockAlert } from '../types';
import { Package, ArrowDownLeft, ArrowUpRight, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const { selectedWarehouse } = useWarehouse();
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [logs, setLogs] = useState<MongoEventLog[]>([]);
  const [alerts, setAlerts] = useState<LowStockAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [resSummary, resAlerts] = await Promise.all([
        api.get(`/dashboard/summary?ma_kho=${selectedWarehouse}`),
        api.get(`/alerts/low-stock?ma_kho=${selectedWarehouse}`),
      ]);
      setStocks(resSummary.data.stocks || resSummary.data.san_pham || []);
      setLogs(resSummary.data.recentLogs || []);
      setAlerts(resAlerts.data.alerts || []);
    } catch (err) {
      console.error('Lỗi load Dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedWarehouse]);

  const totalQty = stocks.reduce((acc, item) => acc + item.so_luong, 0);

  return (
    <div className="space-y-6">
      {/* Title Bar */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">TỔNG QUAN HỆ THỐNG KHO</h1>
          <p className="text-xs text-slate-500">
            Giám sát tồn kho phân tán realtime tại <span className="font-bold text-blue-600">{selectedWarehouse}</span>
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg shadow hover:bg-blue-700 transition-all"
        >
          🔄 Làm mới dữ liệu
        </button>
      </div>

      {/* Top 4 KPI Stat Cards */}
      <div className="grid grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-start">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Tổng Tồn Kho (SKU)</span>
            <div className="text-2xl font-black text-slate-800 mt-1">{totalQty.toLocaleString()}</div>
            <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">Tại kho {selectedWarehouse}</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-start">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Đơn Nhập Chờ Xử Lý</span>
            <div className="text-2xl font-black text-slate-800 mt-1">12</div>
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">Từ 3 nhà cung cấp</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-start">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Đơn Xuất Chờ Xử Lý</span>
            <div className="text-2xl font-black text-slate-800 mt-1">8</div>
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">15 SKUs đang lấy hàng</span>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex justify-between items-start bg-rose-50/40 border-rose-200">
          <div>
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wide">Hàng Sắp Hết</span>
            <div className="text-2xl font-black text-rose-600 mt-1">{alerts.length}</div>
            <span className="text-[11px] text-rose-500 font-medium mt-1 block">Cần nhập bổ sung ngay</span>
          </div>
          <div className="p-3 bg-rose-100 text-rose-600 rounded-lg">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Stock Table */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-bold text-slate-800 text-base">
            DANH SÁCH TỒN KHO REALTIME ({selectedWarehouse})
          </h2>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
            {stocks.length} Mặt hàng
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-500 text-sm font-medium">
            Đang tải dữ liệu kho {selectedWarehouse}...
          </div>
        ) : stocks.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm font-medium">
            Kho {selectedWarehouse} chưa có tồn kho.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="p-3">Mã SKU</th>
                  <th className="p-3">Tên Sản Phẩm</th>
                  <th className="p-3">Kho Chi Nhánh</th>
                  <th className="p-3">Vị Trí Kho</th>
                  <th className="p-3 text-center">Số Lượng Tồn</th>
                  <th className="p-3">Trạng Thái</th>
                  <th className="p-3 text-right">Cập Nhật</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {stocks.map((item, idx) => {
                  let statusBadge = (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                      Sẵn hàng
                    </span>
                  );
                  if (item.so_luong <= 5) {
                    statusBadge = (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
                        Cực thấp
                      </span>
                    );
                  } else if (item.so_luong <= 15) {
                    statusBadge = (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
                        Sắp hết
                      </span>
                    );
                  }

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-bold text-slate-800">{item.ma_sp}</td>
                      <td className="p-3 font-semibold text-slate-700">{item.ten_sp}</td>
                      <td className="p-3 font-semibold text-blue-600">
                        {item.ten_kho || item.ma_kho}
                      </td>
                      <td className="p-3 font-mono text-slate-500">Vị trí B-0{idx + 1}-02</td>
                      <td className="p-3 font-extrabold text-center text-slate-800 text-sm">
                        {item.so_luong}
                      </td>
                      <td className="p-3">{statusBadge}</td>
                      <td className="p-3 text-right text-slate-400">
                        {item.cap_nhat_luc ? new Date(item.cap_nhat_luc).toLocaleTimeString('vi-VN') : '---'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}