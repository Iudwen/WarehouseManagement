import { Response } from 'express';
import { CustomRequest } from '../types';
import { getAggregatedStock } from '../services/dashboardService';
import mongoose from 'mongoose';

export const getDashboardSummary = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const maKho = req.maKhoContext;

    const stocks = await getAggregatedStock(maKho);

    const eventsCollection =
      mongoose.connection.collection('inventory_events');

    const query: Record<string, unknown> = {};

    if (maKho && maKho !== 'CENTRAL') {
      query.ma_kho = maKho.trim().toUpperCase();
    }

    const recentLogs = await eventsCollection
      .find(query)
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();

    res.json({
      success: true,
      warehouse: maKho || 'CENTRAL',
      stocks,
      recentLogs,
    });
  } catch (err: any) {
    console.error('Dashboard error:', err);

    res.status(500).json({
      message: 'Lỗi lấy dữ liệu Dashboard',
    });
  }
};