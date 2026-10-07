import mongoose from 'mongoose';

export const getInventoryAuditLogs = async (
  maKho?: string,
  limit: number = 50
) => {
  const db = mongoose.connection.db;

  if (!db) {
    return [];
  }

  const query: Record<string, unknown> = {};

  if (maKho) {
    query.ma_kho = maKho.trim().toUpperCase();
  }

  return db
    .collection('inventory_events')
    .find(query)
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
};