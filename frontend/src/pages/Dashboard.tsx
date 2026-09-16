import React from 'react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-slate-800">Hệ Thống Quản Lý Kho Phân Tán</h1>
      
      <div className="grid grid-cols-3 gap-6">
        <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl">
          <h3 className="font-bold text-blue-800 text-lg">Node Hà Nội (HN01)</h3>
          <p className="text-slate-600 mt-2">Trạng thái: <span className="text-green-600 font-semibold">Online (Port 5433)</span></p>
        </div>
        <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl">
          <h3 className="font-bold text-emerald-800 text-lg">Node Đà Nẵng (DN01)</h3>
          <p className="text-slate-600 mt-2">Trạng thái: <span className="text-green-600 font-semibold">Online (Port 5434)</span></p>
        </div>
        <div className="p-6 bg-purple-50 border border-purple-200 rounded-xl">
          <h3 className="font-bold text-purple-800 text-lg">Node TP.HCM (HCM01)</h3>
          <p className="text-slate-600 mt-2">Trạng thái: <span className="text-green-600 font-semibold">Online (Port 5435)</span></p>
        </div>
      </div>

      <div className="flex gap-4">
        <Link to="/inventory" className="flex-1 p-4 bg-slate-900 text-white rounded-lg text-center font-bold hover:bg-slate-800">
          Quản Lý Nhập / Xuất Kho
        </Link>
        <Link to="/transfer" className="flex-1 p-4 bg-indigo-600 text-white rounded-lg text-center font-bold hover:bg-indigo-700">
          Điều Chuyển Chi Nhánh
        </Link>
        <Link to="/logs" className="flex-1 p-4 bg-slate-200 text-slate-800 rounded-lg text-center font-bold hover:bg-slate-300">
          Xem Log Mongo Event
        </Link>
      </div>
    </div>
  );
}