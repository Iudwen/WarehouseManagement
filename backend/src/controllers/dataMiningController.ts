import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  getDataMiningSummary,
  getFilteredForecastResults,
  getTimeSeriesChartData,
  getAbcXyzAnalysis,
  getMarketBasketRules,
  getTransferRecommendations,
} from '../services/dataMiningService';

const CENTRAL_ROLES = ['ADMIN', 'DIEU_PHOI', 'DATA_ANALYST'];

/**
 * GET /api/v1/data-mining/summary
 * Lấy chỉ số tổng hợp MAE, RMSE, phân tích phân khúc và mô hình tối ưu
 */
export const handleGetDataMiningSummary = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const summary = getDataMiningSummary();
    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error('Data Mining Summary Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi lấy dữ liệu tổng hợp Data Mining',
    });
  }
};

/**
 * GET /api/v1/data-mining/forecast-results
 * Lọc danh sách dự báo chi tiết theo kho, sản phẩm, ngày và phân trang
 */
export const handleGetForecastResults = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { vai_tro, ma_kho: userMaKho } = req.user || {};

    let targetKho = (req.query.ma_kho as string) || 'ALL';
    // Nếu là nhân viên/quản lý kho chi nhánh, chỉ được xem dữ liệu của kho đó
    if (!CENTRAL_ROLES.includes(vai_tro as string)) {
      targetKho = userMaKho || req.maKhoContext || 'DN01';
    }

    const maSp = (req.query.ma_sp as string) || 'ALL';
    const fromDate = (req.query.from_date as string) || undefined;
    const toDate = (req.query.to_date as string) || undefined;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;

    const result = getFilteredForecastResults({
      ma_kho: targetKho,
      ma_sp: maSp,
      from_date: fromDate,
      to_date: toDate,
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Data Mining Forecast Results Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi lọc kết quả dự báo',
    });
  }
};

/**
 * GET /api/v1/data-mining/time-series
 * Dữ liệu chuỗi thời gian tổng hợp theo ngày để vẽ biểu đồ
 */
export const handleGetTimeSeries = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { vai_tro, ma_kho: userMaKho } = req.user || {};

    let targetKho = (req.query.ma_kho as string) || 'ALL';
    if (!CENTRAL_ROLES.includes(vai_tro as string)) {
      targetKho = userMaKho || req.maKhoContext || 'DN01';
    }

    const maSp = (req.query.ma_sp as string) || 'ALL';
    const fromDate = (req.query.from_date as string) || undefined;
    const toDate = (req.query.to_date as string) || undefined;

    const points = getTimeSeriesChartData({
      ma_kho: targetKho,
      ma_sp: maSp,
      from_date: fromDate,
      to_date: toDate,
    });

    res.status(200).json({
      success: true,
      data: points,
    });
  } catch (error: any) {
    console.error('Data Mining Time Series Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi lấy dữ liệu chuỗi thời gian',
    });
  }
};

/**
 * GET /api/v1/data-mining/abc-xyz
 * Phân tích ABC-XYZ và gợi ý bố trí kho hỗ trợ quyết định
 */
export const handleGetAbcXyzAnalysis = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { vai_tro, ma_kho: userMaKho } = req.user || {};

    let targetKho = (req.query.ma_kho as string) || 'ALL';
    if (!CENTRAL_ROLES.includes(vai_tro as string)) {
      targetKho = userMaKho || req.maKhoContext || 'DN01';
    }

    const data = getAbcXyzAnalysis(targetKho);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Data Mining ABC-XYZ Error:', error);
    const isNotFound = error.message && (error.message.includes('Chưa có dữ liệu') || error.message.includes('Không tìm thấy'));
    res.status(isNotFound ? 404 : 500).json({
      success: false,
      message: error.message || 'Lỗi truy xuất phân tích ABC-XYZ',
    });
  }
};

/**
 * GET /api/v1/data-mining/market-basket
 * Khai phá luật kết hợp giỏ hàng Apriori và gợi ý gom cụm picking
 */
export const handleGetMarketBasketRules = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { vai_tro, ma_kho: userMaKho } = req.user || {};

    let targetKho = (req.query.ma_kho as string) || 'ALL';
    if (!CENTRAL_ROLES.includes(vai_tro as string)) {
      targetKho = userMaKho || req.maKhoContext || 'DN01';
    }

    const data = getMarketBasketRules(targetKho);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Data Mining Market Basket Error:', error);
    const isNotFound = error.message && (error.message.includes('Chưa có dữ liệu') || error.message.includes('Không tìm thấy'));
    res.status(isNotFound ? 404 : 500).json({
      success: false,
      message: error.message || 'Lỗi truy xuất luật kết hợp giỏ hàng',
    });
  }
};


/**
 * GET /api/v1/data-mining/transfer-recommendations
 * Đề xuất điều chuyển hàng liên kho hỗ trợ quyết định (DSS)
 */
export const handleGetTransferRecommendations = async (
  req: CustomRequest,
  res: Response
): Promise<void> => {
  try {
    const { vai_tro, ma_kho: userMaKho } = req.user || {};

    let targetKho = (req.query.ma_kho as string) || 'ALL';
    if (!CENTRAL_ROLES.includes(vai_tro as string)) {
      targetKho = userMaKho || req.maKhoContext || 'DN01';
    }

    const data = getTransferRecommendations(targetKho);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Data Mining Transfer Recommendations Error:', error);
    const isNotFound = error.message && (error.message.includes('Chưa có dữ liệu') || error.message.includes('Không tìm thấy'));
    res.status(isNotFound ? 404 : 500).json({
      success: false,
      message: error.message || 'Lỗi truy xuất đề xuất điều chuyển hàng',
    });
  }
};
