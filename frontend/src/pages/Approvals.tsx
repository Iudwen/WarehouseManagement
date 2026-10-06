import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw, X } from 'lucide-react';
import api from '../services/api';
import { getApiErrorMessage } from '../services/apiError';
import { useWarehouse } from '../contexts/WarehouseContext';

type PendingApproval = {
  loai_phieu: 'NHAP' | 'XUAT';
  ma_phieu: string;
  ma_kho: string;
  ma_doi_tac: string;
  tao_luc: string;
  nguoi_tao: string;
  trang_thai: 'PENDING_APPROVAL';
};

export default function Approvals() {
  const { selectedWarehouse } = useWarehouse();
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/inventory/pending?ma_kho=${selectedWarehouse}`);
      setItems(response.data.data || []);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Khong the tai danh sach phieu cho duyet.'));
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouse]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const approve = async (item: PendingApproval) => {
    setBusyId(item.ma_phieu);
    setError('');
    try {
      const action = item.loai_phieu === 'NHAP' ? 'import' : 'export';
      await api.post(`/inventory/${action}/${item.ma_phieu}/approve?ma_kho=${encodeURIComponent(item.ma_kho)}`);
      await fetchApprovals();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Khong the duyet phieu.'));
    } finally {
      setBusyId('');
    }
  };

  const reject = async (item: PendingApproval) => {
    const reason = window.prompt('Nhap ly do tu choi phieu:');
    if (!reason?.trim()) return;

    setBusyId(item.ma_phieu);
    setError('');
    try {
      const action = item.loai_phieu === 'NHAP' ? 'import' : 'export';
      await api.post(`/inventory/${action}/${item.ma_phieu}/reject?ma_kho=${encodeURIComponent(item.ma_kho)}`, { reason });
      await fetchApprovals();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Khong the tu choi phieu.'));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Duyet phieu kho</h1>
          <p className="mt-1 text-xs text-slate-500">Cac phieu dang cho duyet tai kho {selectedWarehouse}</p>
        </div>
        <button
          type="button"
          onClick={fetchApprovals}
          className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          <RefreshCw className="h-4 w-4" />
          Lam moi
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Dang tai phieu cho duyet...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Khong co phieu nao dang cho duyet.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">Loai</th>
                <th className="p-3">Ma phieu</th>
                <th className="p-3">Kho</th>
                <th className="p-3">Doi tac</th>
                <th className="p-3">Nguoi tao</th>
                <th className="p-3 text-right">Thao tac</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={`${item.loai_phieu}-${item.ma_phieu}`}>
                  <td className="p-3 font-semibold">{item.loai_phieu}</td>
                  <td className="p-3 font-mono">{item.ma_phieu}</td>
                  <td className="p-3">{item.ma_kho}</td>
                  <td className="p-3">{item.ma_doi_tac}</td>
                  <td className="p-3">{item.nguoi_tao}</td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyId === item.ma_phieu}
                        onClick={() => approve(item)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                        Duyet
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.ma_phieu}
                        onClick={() => reject(item)}
                        className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        Tu choi
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
