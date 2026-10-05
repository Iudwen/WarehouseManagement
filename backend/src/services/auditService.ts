import mongoose from 'mongoose';

export const getInventoryAuditLogs = async (ma_kho?: string, limit: number = 50) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return [];

    const query: any = {};
    if (ma_kho) {
      query.ma_kho = ma_kho.trim().toUpperCase();
    }

    const logs = await db
      .collection('inventory_events')
      .find(query)
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();

    return logs;
  } catch (err) {
    console.error('Lỗi khi lấy dữ liệu log từ MongoDB:', err);
    return [];
  }
};