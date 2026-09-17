import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useWarehouse } from '../contexts/WarehouseContext';
import type { MongoEventLog } from '../types';

export default function AuditLogs() {
  const { selectedWarehouse } = useWarehouse();
  const [logs, setLogs] = useState<MongoEventLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/audit/logs?ma_kho=${selectedWarehouse}`);
      setLogs(res.data.data || res.data || []);
    } catch (err) {
      console.error('Lỗi khi tải Audit Logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedWarehouse]);

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md border mt-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Nhật Ký Sự Kiện (MongoDB Audit Logs)</h2>
          <p className="text-xs text-slate-500">Chi nhánh đang chọn: <span className="font-bold text-blue-600">{selectedWarehouse}</span></p>
        </div>
        <button 
          onClick={fetchLogs}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-all"
        >
          🔄 Làm mới
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-500 text-sm">Đang tải nhật ký từ MongoDB...</div>
      ) : logs.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">Chưa có sự kiện nào được ghi nhận tại kho {selectedWarehouse}</div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const eventType = log.event_type || 'INFO';
            const timestamp = log.created_at || log.event_time;
            const formattedTime = timestamp ? new Date(timestamp).toLocaleString('vi-VN') : '---';

            return (
              <div key={log._id} className="flex items-center justify-between p-3 bg-slate-50 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 text-xs font-bold rounded ${
                    eventType === 'IMPORT' ? 'bg-blue-100 text-blue-700' :
                    eventType === 'EXPORT' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {eventType}
                  </span>
                  <span className="text-sm font-medium text-slate-800">
                    Phiếu: <code className="font-bold">{log.ma_phieu}</code> - Kho: {log.ma_kho}
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-mono">{formattedTime}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}