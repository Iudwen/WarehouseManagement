import { Response } from 'express';
import { CustomRequest } from '../types';
import { getAggregatedStock } from '../services/dashboardService';
import mongoose from 'mongoose';

export const getDashboardSummary = async (req: CustomRequest, res: Response) => {
  try {
    const ma_kho = (req.query.ma_kho as string) || req.maKhoContext;
    const stocks = await getAggregatedStock(ma_kho);
    
    // Query Log sự kiện thực tế từ MongoDB có filter theo kho
    const eventsCollection = mongoose.connection.collection('inventory_events');
    const query: any = {};
    if (ma_kho) {
      query.ma_kho = ma_kho.trim().toUpperCase();
    }

    const recentLogs = await eventsCollection
      .find(query)
      .sort({ created_at: -1 })
      .limit(10)
      .toArray();

    res.json({
      success: true,
      warehouse: ma_kho || 'ALL',
      stocks,
      recentLogs
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi lấy dữ liệu Dashboard', error: err.message });
  }
};