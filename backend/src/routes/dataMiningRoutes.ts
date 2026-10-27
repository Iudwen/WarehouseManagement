import { Router } from 'express';
import {
  handleGetDataMiningSummary,
  handleGetForecastResults,
  handleGetTimeSeries,
  handleGetAbcXyzAnalysis,
  handleGetMarketBasketRules,
  handleGetTransferRecommendations,
} from '../controllers/dataMiningController';
import { auth } from '../middlewares/auth';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Toàn bộ API Data Mining yêu cầu xác thực JWT và ngữ cảnh kho
router.use(auth);
router.use(dbSelector);

// 1. Chỉ số tổng hợp hiệu năng mô hình (Baseline, Ridge, Random Forest, LightGBM) & phân khúc
router.get('/summary', handleGetDataMiningSummary);

// 2. Danh sách dự báo chi tiết có lọc và phân trang
router.get('/forecast-results', handleGetForecastResults);

// 3. Chuỗi thời gian tổng hợp để vẽ biểu đồ Line/Bar
router.get('/time-series', handleGetTimeSeries);

// 4. Phân tích phân loại ABC-XYZ & gợi ý bố trí kho hỗ trợ quyết định
router.get('/abc-xyz', handleGetAbcXyzAnalysis);

// 5. Khai phá luật kết hợp Apriori (Market Basket) & gợi ý gom cụm picking
router.get('/market-basket', handleGetMarketBasketRules);

// 6. Đề xuất điều chuyển hàng liên kho hỗ trợ quyết định (DSS)
router.get('/transfer-recommendations', handleGetTransferRecommendations);

export default router;
