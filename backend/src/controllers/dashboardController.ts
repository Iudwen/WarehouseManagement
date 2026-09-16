import { Request, Response } from 'express';
import { getAggregatedStock } from '../services/dashboardService';
import mongoose from 'mongoose';

export const getDashboardSummary = async (req: Request, res: Response) => {
  try {
    const stocks = await getAggregatedStock();
    
    // Query Log sự kiện thực tế từ MongoDB
    const eventsCollection = mongoose.connection.collection('inventory_events');
    const recentLogs = await eventsCollection.find().sort({ timestamp: -1 }).limit(10).toArray();

    res.json({
      stocks,
      recentLogs
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Lỗi lấy dữ liệu Dashboard', error: err.message });
  }
};