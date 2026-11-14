import mongoose from 'mongoose';

export interface NormalizedAuditLog {
  _id: string;
  event_id: string;
  event_type: string;
  category: 'INVENTORY' | 'TRANSFER' | 'SALES' | 'SYSTEM' | 'WAREHOUSE';
  ma_kho: string;
  title: string;
  description: string;
  details?: any;
  user?: string;
  status: string;
  timestamp: string;
  raw: any;
}

export interface AuditSummary {
  total: number;
  inventory: number;
  transfer: number;
  sales: number;
  system: number;
  warehouse: number;
  active_nodes: number;
}

export const getInventoryAuditLogs = async (
  ma_kho?: string,
  category: string = 'ALL',
  limit: number = 100
): Promise<{ logs: NormalizedAuditLog[]; summary: AuditSummary }> => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return {
        logs: [],
        summary: { total: 0, inventory: 0, transfer: 0, sales: 0, system: 0, warehouse: 0, active_nodes: 3 },
      };
    }

    const isFilteredKho =
      ma_kho &&
      ma_kho.trim().toUpperCase() !== 'ALL' &&
      ma_kho.trim().toUpperCase() !== 'CENTRAL';
    const khoUpper = ma_kho ? ma_kho.trim().toUpperCase() : '';

    const invQuery: any = isFilteredKho ? { ma_kho: khoUpper } : {};
    const trfQuery: any = isFilteredKho
      ? { $or: [{ kho_xuat: khoUpper }, { kho_nhap: khoUpper }] }
      : {};
    const salesQuery: any = isFilteredKho ? { ma_kho: khoUpper } : {};
    const sysQuery: any = isFilteredKho ? { ma_kho: khoUpper } : {};
    const whQuery: any = isFilteredKho ? { ma_kho: khoUpper } : {};

    // Truy vấn song song 5 collection trong MongoDB Event Store
    const [invDocs, trfDocs, salesDocs, sysDocs, whDocs] = await Promise.all([
      db.collection('inventory_events').find(invQuery).sort({ event_time: -1, created_at: -1 }).limit(limit).toArray(),
      db.collection('transfer_events').find(trfQuery).sort({ event_time: -1, created_at: -1 }).limit(limit).toArray(),
      db.collection('sales_events').find(salesQuery).sort({ event_time: -1, created_at: -1 }).limit(limit).toArray(),
      db.collection('system_logs').find(sysQuery).sort({ event_time: -1, created_at: -1 }).limit(limit).toArray(),
      db.collection('warehouse_events').find(whQuery).sort({ event_time: -1, created_at: -1 }).limit(limit).toArray(),
    ]);

    // Chuẩn hóa Inventory Events
    const normalizedInv: NormalizedAuditLog[] = invDocs.map((d: any) => {
      const change = d.quantity?.change ?? 0;
      const changeStr = change > 0 ? `+${change}` : `${change}`;
      const prodName = d.product?.name || d.ma_sp || 'Hàng hóa';
      return {
        _id: d._id?.toString() || d.event_id,
        event_id: d.event_id || `INV-${d._id?.toString()?.slice(-6)}`,
        event_type: d.event_type || d.loai_su_kien || 'INVENTORY_UPDATED',
        category: 'INVENTORY',
        ma_kho: d.ma_kho || 'HN01',
        title: `Cập nhật tồn kho: ${prodName} (${changeStr} SP)`,
        description: `Tồn kho trước: ${d.quantity?.before ?? '---'} → Sau: ${d.quantity?.after ?? '---'} | Lý do: ${d.reason || 'Biến động nghiệp vụ'}`,
        details: d.quantity,
        user: d.metadata?.user || d.nguoi_thuc_hien || 'admin_he_thong',
        status: 'SUCCESS',
        timestamp: d.event_time || d.created_at || d.thoi_gian || new Date().toISOString(),
        raw: d,
      };
    });

    // Chuẩn hóa Transfer Events
    const normalizedTrf: NormalizedAuditLog[] = trfDocs.map((d: any) => ({
      _id: d._id?.toString() || d.event_id,
      event_id: d.event_id || `TRF-${d._id?.toString()?.slice(-6)}`,
      event_type: d.event_type || 'TRANSFER_CREATED',
      category: 'TRANSFER',
      ma_kho: `${d.kho_xuat || 'HN01'} → ${d.kho_nhap || 'DN01'}`,
      title: `Lệnh điều chuyển liên kho: ${d.kho_xuat} → ${d.kho_nhap}`,
      description: `Mã phiếu: ${d.ma_phieu_dc || d.event_id} | Mặt hàng: ${d.items?.length || 1} SKUs | Trạng thái: ${d.status || 'COMPLETED'}`,
      details: d.items,
      user: d.metadata?.user || 'dieu_phoi_vien',
      status: d.status || 'COMPLETED',
      timestamp: d.event_time || d.created_at || new Date().toISOString(),
      raw: d,
    }));

    // Chuẩn hóa Sales Events
    const normalizedSales: NormalizedAuditLog[] = salesDocs.map((d: any) => ({
      _id: d._id?.toString() || d.event_id,
      event_id: d.event_id || `SALE-${d._id?.toString()?.slice(-6)}`,
      event_type: d.event_type || 'SALE_COMPLETED',
      category: 'SALES',
      ma_kho: d.ma_kho || 'HN01',
      title: `Xuất bán đơn hàng: ${d.ma_phieu_xuat || d.event_id}`,
      description: `Khách hàng: ${d.customer?.ma_kh || 'Vãng lai'} | Tổng thanh toán: ${(d.total_amount || 0).toLocaleString()} VNĐ (${d.payment?.method || 'TIEN_MAT'})`,
      details: d.items,
      user: d.metadata?.user || 'nhan_vien_ban_hang',
      status: d.payment?.status || 'PAID',
      timestamp: d.event_time || d.created_at || new Date().toISOString(),
      raw: d,
    }));

    // Chuẩn hóa System Logs
    const normalizedSys: NormalizedAuditLog[] = sysDocs.map((d: any) => ({
      _id: d._id?.toString() || d.log_id,
      event_id: d.log_id || `SYS-${d._id?.toString()?.slice(-6)}`,
      event_type: d.level || 'INFO',
      category: 'SYSTEM',
      ma_kho: d.ma_kho || 'CENTRAL',
      title: `Nhật ký dịch vụ: ${d.service || 'hệ_thống'}`,
      description: d.message || 'Thực thi tiến trình nền hoàn tất',
      details: d.metadata,
      user: d.metadata?.user || 'cron_job',
      status: d.level || 'INFO',
      timestamp: d.event_time || d.created_at || new Date().toISOString(),
      raw: d,
    }));

    // Chuẩn hóa Warehouse Events
    const normalizedWh: NormalizedAuditLog[] = whDocs.map((d: any) => ({
      _id: d._id?.toString() || d.event_id,
      event_id: d.event_id || `WH-${d._id?.toString()?.slice(-6)}`,
      event_type: d.event_type || 'WAREHOUSE_EVENT',
      category: 'WAREHOUSE',
      ma_kho: d.ma_kho || 'HN01',
      title: `Sự kiện vận hành kho: ${d.event_type}`,
      description: `Chi nhánh: ${d.warehouse?.name || d.ma_kho} (${d.warehouse?.city || ''}) | Nguồn: ${d.source || 'Hệ thống'}`,
      details: d.warehouse,
      user: d.metadata?.user || 'admin_chi_nhanh',
      status: 'VERIFIED',
      timestamp: d.event_time || d.created_at || new Date().toISOString(),
      raw: d,
    }));

    const allEvents = [
      ...normalizedInv,
      ...normalizedTrf,
      ...normalizedSales,
      ...normalizedSys,
      ...normalizedWh,
    ];

    // Sắp xếp giảm dần theo thời gian phát sinh sự kiện
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    let filtered = allEvents;
    if (category && category.trim().toUpperCase() !== 'ALL') {
      filtered = allEvents.filter((e) => e.category === category.trim().toUpperCase());
    }

    return {
      logs: filtered,
      summary: {
        total: allEvents.length,
        inventory: normalizedInv.length,
        transfer: normalizedTrf.length,
        sales: normalizedSales.length,
        system: normalizedSys.length,
        warehouse: normalizedWh.length,
        active_nodes: 3,
      },
    };
  } catch (err) {
    console.error('Lỗi khi lấy dữ liệu audit logs từ MongoDB:', err);
    return {
      logs: [],
      summary: { total: 0, inventory: 0, transfer: 0, sales: 0, system: 0, warehouse: 0, active_nodes: 3 },
    };
  }
};