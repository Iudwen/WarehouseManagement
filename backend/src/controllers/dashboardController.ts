import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  getAggregatedStock,
  getPendingReceiptSummary,
  getIOStatistics,
} from '../services/dashboardService';
import mongoose from 'mongoose';

const CENTRAL_ROLES = ['ADMIN', 'DIEU_PHOI', 'DATA_ANALYST'];

/**
 * GET /api/v1/dashboard/summary
 * Tổng quan tồn kho & các đơn chờ xử lý
 */
export const getDashboardSummary = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const maKho = (req.query.ma_kho as string) || req.maKhoContext;

    // Lấy tồn kho và đơn chờ xử lý thực tế
    const [stocks, pendingCounts] = await Promise.all([
      getAggregatedStock(maKho),
      getPendingReceiptSummary(maKho),
    ]);

    let recentLogs: any[] = [];
    if (mongoose.connection.readyState === 1) {
      const eventsCollection =
        mongoose.connection.collection('inventory_events');

      const query: Record<string, unknown> = {};

      if (maKho && maKho !== 'CENTRAL' && maKho !== 'ALL') {
        query.ma_kho = maKho.trim().toUpperCase();
      }

      recentLogs = await eventsCollection
        .find(query)
        .sort({ created_at: -1 })
        .limit(10)
        .toArray();
    }

    res.json({
      success: true,
      warehouse: maKho || 'CENTRAL',
      stocks,
      pending_imports: pendingCounts.pendingImports,
      pending_exports: pendingCounts.pendingExports,
      recentLogs,
    });
  } catch (err: any) {
    console.error('Dashboard error:', err);

    res.status(500).json({
      success: false,
      message: 'Lỗi lấy dữ liệu Dashboard',
    });
  }
};

/**
 * GET /api/v1/dashboard/io-statistics
 * Thống kê chi tiết số lượng hàng nhập - xuất theo Ngày / Tháng / Kho
 */
export const getIOStatisticsController = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { vai_tro, ma_kho: userMaKho } = req.user || {};

    let targetKho = (req.query.ma_kho as string) || req.maKhoContext || 'ALL';

    // Ràng buộc phân quyền: Nhân viên hoặc Quản lý chi nhánh chỉ được xem kho của mình
    if (vai_tro && !CENTRAL_ROLES.includes(vai_tro)) {
      targetKho = userMaKho || req.maKhoContext || 'HN01';
    }

    const fromDate = (req.query.from_date as string) || (req.query.from as string) || undefined;
    const toDate = (req.query.to_date as string) || (req.query.to as string) || undefined;
    const granularityRaw = (req.query.granularity as string)?.toLowerCase();
    const granularity: 'day' | 'month' = granularityRaw === 'month' ? 'month' : 'day';

    // Validate định dạng ngày nếu có truyền
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (fromDate && !dateRegex.test(fromDate)) {
      res.status(400).json({
        success: false,
        message: 'Định dạng from_date không hợp lệ (yêu cầu YYYY-MM-DD)',
      });
      return;
    }
    if (toDate && !dateRegex.test(toDate)) {
      res.status(400).json({
        success: false,
        message: 'Định dạng to_date không hợp lệ (yêu cầu YYYY-MM-DD)',
      });
      return;
    }

    if (fromDate && toDate && fromDate > toDate) {
      res.status(400).json({
        success: false,
        message: 'from_date không được lớn hơn to_date',
      });
      return;
    }

    const result = await getIOStatistics(targetKho, fromDate, toDate, granularity);

    res.status(200).json({
      success: true,
      data: result,
      ...result,
    });
  } catch (err: any) {
    console.error('IO Statistics error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Lỗi lấy thống kê nhập xuất kho',
    });
  }
};