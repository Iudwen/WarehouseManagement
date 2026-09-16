import React from 'react';

interface EventLog {
  type: 'IMPORT' | 'EXPORT' | 'TRANSFER';
  text: string;
  timestamp: string;
}

export default function AuditLogs() {
  const mockLogs: EventLog[] = [
    { type: 'IMPORT', text: 'Nhập kho 20 TV OLED 55 tại HN01', timestamp: '2026-09-16 22:30:15' },
    { type: 'EXPORT', text: 'Xuất kho 5 TV OLED 55 tại HN01', timestamp: '2026-09-16 22:35:40' },
    { type: 'TRANSFER', text: 'Điều chuyển 3 TV OLED 55 từ HN01 -> DN01', timestamp: '2026-09-16 22:40:02' },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md border mt-6">
      <h2 className="text-2xl font-bold mb-4 text-slate-800">Nhật Ký Sự Kiện (MongoDB Audit Logs)</h2>
      <div className="space-y-3">
        {mockLogs.map((log, index) => (
          <div key={index} className="flex items-center justify-between p-3 bg-slate-50 border rounded-lg">
            <div className="flex items-center gap-3">
              <span className={`px-2 py-1 text-xs font-bold rounded ${
                log.type === 'IMPORT' ? 'bg-blue-100 text-blue-700' :
                log.type === 'EXPORT' ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'
              }`}>
                {log.type}
              </span>
              <span className="text-sm font-medium text-slate-800">{log.text}</span>
            </div>
            <span className="text-xs text-slate-500">{log.timestamp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}