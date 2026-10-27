import fs from 'fs';
import path from 'path';

export interface ForecastRecord {
  ngay: string;
  ma_kho: string;
  ma_sp: string;
  thuc_te: number;
  du_bao_baseline: number;
  du_bao_ridge: number;
  du_bao_rf: number;
  du_bao_lgb?: number;
  sai_so_tuyet_doi_rf: number;
}

export interface ModelMetrics {
  mae: number;
  rmse: number;
}

export interface PipelineStatus {
  status: 'COMPLETED' | 'SUCCESS' | 'FAILED' | 'UNKNOWN';
  total_steps?: number;
  failed_step?: number;
  failed_step_name?: string;
  error?: string;
  elapsed_seconds?: number;
  total_duration_sec?: number;
  last_run?: string;
  timestamp?: string;
  metrics?: {
    analytical_rows?: number;
    test_rows?: number;
    best_model?: string;
    best_mae?: number;
    lightgbm_mae?: number;
    abc_items?: number;
    association_rules?: number;
  };
}

export interface DataMiningSummary {
  pipelineStatus?: PipelineStatus | null;
  trainSet: {
    startDate: string;
    endDate: string;
    totalRecords: number;
  };
  testSet: {
    startDate: string;
    endDate: string;
    totalRecords: number;
  };
  models: {
    baseline: ModelMetrics;
    ridge: ModelMetrics;
    randomForest: ModelMetrics;
    lightgbm: ModelMetrics;
    bestModel: string;
    improvementOverBaselinePct: number;
  };
  granularity: string;
  disclaimer: string;
  warehouseBreakdown: Array<{
    ma_kho: string;
    ten_kho: string;
    totalRecords: number;
    avgActual: number;
    zeroDemandPct: number;
    baselineMae: number;
    ridgeMae: number;
    rfMae: number;
    lgbMae: number;
    bestModel: string;
  }>;
  zeroDemandBreakdown: {
    zeroDays: {
      count: number;
      pct: number;
      baselineMae: number;
      ridgeMae: number;
      rfMae: number;
      lgbMae: number;
    };
    positiveDays: {
      count: number;
      pct: number;
      baselineMae: number;
      ridgeMae: number;
      rfMae: number;
      lgbMae: number;
    };
  };
  topProducts: Array<{
    ma_sp: string;
    avgActual: number;
    zeroPct: number;
    baselineMae: number;
    ridgeMae: number;
    rfMae: number;
    lgbMae: number;
  }>;
}

export interface ForecastFilterParams {
  ma_kho?: string;
  ma_sp?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

export interface TimeSeriesPoint {
  ngay: string;
  thuc_te: number;
  du_bao_ridge: number;
  du_bao_baseline: number;
  du_bao_rf: number;
  du_bao_lgb: number;
  so_dong: number;
}

// Tìm đường dẫn thư mục data_mining linh hoạt
function getDataMiningDir(): string {
  const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const candidates = [
    path.resolve(currentDir, '../../data_mining'),
    path.resolve(currentDir, '../data_mining'),
    path.resolve(process.cwd(), '../data_mining'),
    path.resolve(process.cwd(), 'data_mining'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return path.resolve(process.cwd(), '../data_mining');
}

function getDataLakeGoldDir(): string {
  const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const candidates = [
    path.resolve(currentDir, '../../data_center/data_lake/gold'),
    path.resolve(currentDir, '../data_center/data_lake/gold'),
    path.resolve(process.cwd(), '../data_center/data_lake/gold'),
    path.resolve(process.cwd(), 'data_center/data_lake/gold'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return path.resolve(process.cwd(), 'data_center/data_lake/gold');
}

let cachedRecords: ForecastRecord[] | null = null;
let cachedFileMtime: number = 0;

/**
 * Đọc và parse file forecast_results.csv (có in-memory cache tự cập nhật khi file đổi)
 */
export function loadForecastRecords(): ForecastRecord[] {
  const dmDir = getDataMiningDir();
  const dlDir = getDataLakeGoldDir();
  const candidates = [
    path.join(dmDir, 'datasets', 'gold', 'forecast_results.csv'),
    path.join(dlDir, 'forecast_results.csv'),
    path.resolve(process.cwd(), 'data_center/data_lake/gold/forecast_results.csv'),
    path.resolve(process.cwd(), '../data_center/data_lake/gold/forecast_results.csv'),
  ];
  let csvPath = candidates[0];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      csvPath = c;
      break;
    }
  }

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Không tìm thấy file kết quả dự báo Data Mining tại: ${csvPath}`);
  }

  const stat = fs.statSync(csvPath);
  if (cachedRecords && cachedFileMtime === stat.mtimeMs) {
    return cachedRecords;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error(`File kết quả dự báo Data Mining (${csvPath}) rỗng hoặc thiếu nội dung.`);
  }

  const header = lines[0].trim().split(',');
  const requiredCols = ['ngay', 'ma_kho', 'ma_sp', 'thuc_te', 'du_bao_baseline', 'du_bao_ridge', 'du_bao_rf'];
  for (const col of requiredCols) {
    if (!header.includes(col)) {
      throw new Error(`File kết quả dự báo Data Mining (${csvPath}) không hợp lệ: thiếu cột bắt buộc '${col}'.`);
    }
  }

  const idxNgay = header.indexOf('ngay');
  const idxKho = header.indexOf('ma_kho');
  const idxSp = header.indexOf('ma_sp');
  const idxThucTe = header.indexOf('thuc_te');
  const idxBase = header.indexOf('du_bao_baseline');
  const idxRidge = header.indexOf('du_bao_ridge');
  const idxRf = header.indexOf('du_bao_rf');
  const idxLgb = header.indexOf('du_bao_lgb');
  const idxSaiSo = header.indexOf('sai_so_tuyet_doi_rf');

  const records: ForecastRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 7) continue;

    const ngay = parts[idxNgay];
    const ma_kho = parts[idxKho];
    const ma_sp = parts[idxSp];
    const thuc_te = parseFloat(parts[idxThucTe]) || 0;
    const du_bao_baseline = parseFloat(parts[idxBase]) || 0;
    const du_bao_ridge = parseFloat(parts[idxRidge]) || 0;
    const du_bao_rf = parseFloat(parts[idxRf]) || 0;
    const du_bao_lgb = idxLgb >= 0 ? parseFloat(parts[idxLgb]) || 0 : du_bao_rf;
    const sai_so_tuyet_doi_rf = idxSaiSo >= 0 ? parseFloat(parts[idxSaiSo]) || 0 : Math.abs(thuc_te - du_bao_rf);

    records.push({
      ngay,
      ma_kho,
      ma_sp,
      thuc_te,
      du_bao_baseline,
      du_bao_ridge,
      du_bao_rf,
      du_bao_lgb,
      sai_so_tuyet_doi_rf,
    });
  }

  if (records.length === 0) {
    throw new Error(`File kết quả dự báo Data Mining (${csvPath}) không chứa bản ghi hợp lệ.`);
  }

  cachedRecords = records;
  cachedFileMtime = stat.mtimeMs;
  return records;
}

/**
 * Lấy trạng thái thực thi pipeline
 */
export function getPipelineStatus(): PipelineStatus | null {
  const dmDir = getDataMiningDir();
  const dlDir = getDataLakeGoldDir();
  const candidates = [
    path.join(dmDir, 'datasets', 'gold', 'pipeline_run_status.json'),
    path.join(dlDir, 'pipeline_run_status.json'),
    path.resolve(process.cwd(), 'data_center/data_lake/gold/pipeline_run_status.json'),
    path.resolve(process.cwd(), '../data_center/data_lake/gold/pipeline_run_status.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const raw = fs.readFileSync(c, 'utf-8');
        return JSON.parse(raw);
      } catch {
        // ignore error
      }
    }
  }
  return null;
}

/**
 * Lấy báo cáo tổng hợp chỉ số MAE/RMSE và phân tích phân khúc
 */
export function getDataMiningSummary(): DataMiningSummary {
  const records = loadForecastRecords();
  if (records.length === 0) {
    throw new Error('Không có dữ liệu dự báo trong hệ thống');
  }

  let sumMaeBase = 0;
  let sumSseBase = 0;
  let sumMaeRidge = 0;
  let sumSseRidge = 0;
  let sumMaeRf = 0;
  let sumSseRf = 0;
  let sumMaeLgb = 0;
  let sumSseLgb = 0;

  for (const r of records) {
    const diffBase = Math.abs(r.thuc_te - r.du_bao_baseline);
    sumMaeBase += diffBase;
    sumSseBase += diffBase * diffBase;

    const diffRidge = Math.abs(r.thuc_te - r.du_bao_ridge);
    sumMaeRidge += diffRidge;
    sumSseRidge += diffRidge * diffRidge;

    const diffRf = Math.abs(r.thuc_te - r.du_bao_rf);
    sumMaeRf += diffRf;
    sumSseRf += diffRf * diffRf;

    const diffLgb = Math.abs(r.thuc_te - (r.du_bao_lgb ?? r.du_bao_rf));
    sumMaeLgb += diffLgb;
    sumSseLgb += diffLgb * diffLgb;
  }

  const n = records.length;
  const maeBase = Number((sumMaeBase / n).toFixed(4));
  const rmseBase = Number(Math.sqrt(sumSseBase / n).toFixed(4));
  const maeRidge = Number((sumMaeRidge / n).toFixed(4));
  const rmseRidge = Number(Math.sqrt(sumSseRidge / n).toFixed(4));
  const maeRf = Number((sumMaeRf / n).toFixed(4));
  const rmseRf = Number(Math.sqrt(sumSseRf / n).toFixed(4));
  const maeLgb = Number((sumMaeLgb / n).toFixed(4));
  const rmseLgb = Number(Math.sqrt(sumSseLgb / n).toFixed(4));

  const improvementPct = Number((((maeBase - maeRidge) / maeBase) * 100).toFixed(2));

  const warehouseNames: Record<string, string> = {
    DN01: 'Kho Đà Nẵng (DN01)',
    HCM01: 'Kho TP. Hồ Chí Minh (HCM01)',
    HN01: 'Kho Hà Nội (HN01)',
  };

  const warehouseGroups: Record<string, ForecastRecord[]> = {};
  for (const r of records) {
    if (!warehouseGroups[r.ma_kho]) warehouseGroups[r.ma_kho] = [];
    warehouseGroups[r.ma_kho].push(r);
  }

  const warehouseBreakdown = Object.keys(warehouseGroups).sort().map((kho) => {
    const sub = warehouseGroups[kho];
    let sBase = 0;
    let sRidge = 0;
    let sRf = 0;
    let sLgb = 0;
    let sAct = 0;
    let zeroCount = 0;

    for (const r of sub) {
      sBase += Math.abs(r.thuc_te - r.du_bao_baseline);
      sRidge += Math.abs(r.thuc_te - r.du_bao_ridge);
      sRf += Math.abs(r.thuc_te - r.du_bao_rf);
      sLgb += Math.abs(r.thuc_te - (r.du_bao_lgb ?? r.du_bao_rf));
      sAct += r.thuc_te;
      if (r.thuc_te === 0) zeroCount++;
    }

    const count = sub.length;
    const kMaeBase = Number((sBase / count).toFixed(4));
    const kMaeRidge = Number((sRidge / count).toFixed(4));
    const kMaeRf = Number((sRf / count).toFixed(4));
    const kMaeLgb = Number((sLgb / count).toFixed(4));
    const avgActual = Number((sAct / count).toFixed(2));
    const zeroDemandPct = Number(((zeroCount / count) * 100).toFixed(1));

    let bestModel = 'Ridge Regression';
    if (kMaeRf < kMaeRidge && kMaeRf < kMaeLgb) bestModel = 'Random Forest';
    else if (kMaeLgb < kMaeRidge && kMaeLgb < kMaeRf) bestModel = 'LightGBM';

    return {
      ma_kho: kho,
      ten_kho: warehouseNames[kho] || kho,
      totalRecords: count,
      avgActual,
      zeroDemandPct,
      baselineMae: kMaeBase,
      ridgeMae: kMaeRidge,
      rfMae: kMaeRf,
      lgbMae: kMaeLgb,
      bestModel,
    };
  });

  const zeroDays = records.filter((r) => r.thuc_te === 0);
  const posDays = records.filter((r) => r.thuc_te > 0);

  const calcMae = (list: ForecastRecord[], key: 'du_bao_baseline' | 'du_bao_ridge' | 'du_bao_rf' | 'du_bao_lgb') => {
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, r) => acc + Math.abs(r.thuc_te - (r[key] ?? r.du_bao_rf)), 0);
    return Number((sum / list.length).toFixed(4));
  };

  const zeroDemandBreakdown = {
    zeroDays: {
      count: zeroDays.length,
      pct: Number(((zeroDays.length / n) * 100).toFixed(2)),
      baselineMae: calcMae(zeroDays, 'du_bao_baseline'),
      ridgeMae: calcMae(zeroDays, 'du_bao_ridge'),
      rfMae: calcMae(zeroDays, 'du_bao_rf'),
      lgbMae: calcMae(zeroDays, 'du_bao_lgb'),
    },
    positiveDays: {
      count: posDays.length,
      pct: Number(((posDays.length / n) * 100).toFixed(2)),
      baselineMae: calcMae(posDays, 'du_bao_baseline'),
      ridgeMae: calcMae(posDays, 'du_bao_ridge'),
      rfMae: calcMae(posDays, 'du_bao_rf'),
      lgbMae: calcMae(posDays, 'du_bao_lgb'),
    },
  };

  const productGroups: Record<string, ForecastRecord[]> = {};
  for (const r of records) {
    if (!productGroups[r.ma_sp]) productGroups[r.ma_sp] = [];
    productGroups[r.ma_sp].push(r);
  }

  const topProducts = Object.keys(productGroups).map((sp) => {
    const sub = productGroups[sp];
    const avgAct = sub.reduce((a, b) => a + b.thuc_te, 0) / sub.length;
    const zeroPct = (sub.filter((r) => r.thuc_te === 0).length / sub.length) * 100;
    return {
      ma_sp: sp,
      avgActual: Number(avgAct.toFixed(2)),
      zeroPct: Number(zeroPct.toFixed(1)),
      baselineMae: calcMae(sub, 'du_bao_baseline'),
      ridgeMae: calcMae(sub, 'du_bao_ridge'),
      rfMae: calcMae(sub, 'du_bao_rf'),
      lgbMae: calcMae(sub, 'du_bao_lgb'),
    };
  }).sort((a, b) => b.avgActual - a.avgActual).slice(0, 5);

  return {
    trainSet: {
      startDate: '2025-09-25',
      endDate: '2026-07-31',
      totalRecords: 18600,
    },
    testSet: {
      startDate: '2026-08-01',
      endDate: '2026-09-18',
      totalRecords: n,
    },
    models: {
      baseline: { mae: maeBase, rmse: rmseBase },
      ridge: { mae: maeRidge, rmse: rmseRidge },
      randomForest: { mae: maeRf, rmse: rmseRf },
      lightgbm: { mae: maeLgb, rmse: rmseLgb },
      bestModel: 'Linear Ridge Regression',
      improvementOverBaselinePct: improvementPct,
    },
    granularity: 'Ngày × Kho × Mã sản phẩm',
    disclaimer: 'Dữ liệu hiển thị là kết quả đánh giá mô hình trên tập kiểm thử lịch sử (01/08/2026 - 18/09/2026), dùng để kiểm chứng phương pháp khoa học, không phải dự báo tương lai chưa kiểm chứng.',
    pipelineStatus: getPipelineStatus(),
    warehouseBreakdown,
    zeroDemandBreakdown,
    topProducts,
  };
}

/**
 * Lọc và phân trang danh sách dự báo
 */
export function getFilteredForecastResults(params: ForecastFilterParams) {
  let records = loadForecastRecords();

  if (params.ma_kho && params.ma_kho !== 'ALL') {
    const k = params.ma_kho.trim().toUpperCase();
    records = records.filter((r) => r.ma_kho.toUpperCase() === k);
  }

  if (params.ma_sp && params.ma_sp !== 'ALL') {
    const sp = params.ma_sp.trim().toUpperCase();
    records = records.filter((r) => r.ma_sp.toUpperCase() === sp);
  }

  if (params.from_date) {
    records = records.filter((r) => r.ngay >= params.from_date!);
  }

  if (params.to_date) {
    records = records.filter((r) => r.ngay <= params.to_date!);
  }

  const total = records.length;
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(3000, Math.max(1, params.limit || 50));
  const offset = (page - 1) * limit;
  const items = records.slice(offset, offset + limit);

  let filteredMaeRidge = 0;
  let filteredMaeBase = 0;
  let filteredMaeLgb = 0;
  if (total > 0) {
    const sumR = records.reduce((acc, r) => acc + Math.abs(r.thuc_te - r.du_bao_ridge), 0);
    const sumB = records.reduce((acc, r) => acc + Math.abs(r.thuc_te - r.du_bao_baseline), 0);
    const sumL = records.reduce((acc, r) => acc + Math.abs(r.thuc_te - (r.du_bao_lgb ?? r.du_bao_rf)), 0);
    filteredMaeRidge = Number((sumR / total).toFixed(4));
    filteredMaeBase = Number((sumB / total).toFixed(4));
    filteredMaeLgb = Number((sumL / total).toFixed(4));
  }

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    summaryOfFiltered: {
      totalRecords: total,
      maeRidge: filteredMaeRidge,
      maeBaseline: filteredMaeBase,
      maeLightGBM: filteredMaeLgb,
    },
    items,
  };
}

/**
 * Lấy dữ liệu chuỗi thời gian tổng hợp theo ngày phục vụ vẽ biểu đồ Line/Bar chart
 */
export function getTimeSeriesChartData(params: {
  ma_kho?: string;
  ma_sp?: string;
  from_date?: string;
  to_date?: string;
}): TimeSeriesPoint[] {
  let records = loadForecastRecords();

  if (params.ma_kho && params.ma_kho !== 'ALL') {
    const k = params.ma_kho.trim().toUpperCase();
    records = records.filter((r) => r.ma_kho.toUpperCase() === k);
  }

  if (params.ma_sp && params.ma_sp !== 'ALL') {
    const sp = params.ma_sp.trim().toUpperCase();
    records = records.filter((r) => r.ma_sp.toUpperCase() === sp);
  }

  if (params.from_date) {
    records = records.filter((r) => r.ngay >= params.from_date!);
  }

  if (params.to_date) {
    records = records.filter((r) => r.ngay <= params.to_date!);
  }

  const dateMap: Record<string, { thuc_te: number; ridge: number; base: number; rf: number; lgb: number; count: number }> = {};
  for (const r of records) {
    if (!dateMap[r.ngay]) {
      dateMap[r.ngay] = { thuc_te: 0, ridge: 0, base: 0, rf: 0, lgb: 0, count: 0 };
    }
    dateMap[r.ngay].thuc_te += r.thuc_te;
    dateMap[r.ngay].ridge += r.du_bao_ridge;
    dateMap[r.ngay].base += r.du_bao_baseline;
    dateMap[r.ngay].rf += r.du_bao_rf;
    dateMap[r.ngay].lgb += (r.du_bao_lgb ?? r.du_bao_rf);
    dateMap[r.ngay].count++;
  }

  return Object.keys(dateMap).sort().map((d) => ({
    ngay: d,
    thuc_te: Number(dateMap[d].thuc_te.toFixed(2)),
    du_bao_ridge: Number(dateMap[d].ridge.toFixed(2)),
    du_bao_baseline: Number(dateMap[d].base.toFixed(2)),
    du_bao_rf: Number(dateMap[d].rf.toFixed(2)),
    du_bao_lgb: Number(dateMap[d].lgb.toFixed(2)),
    so_dong: dateMap[d].count,
  }));
}

/**
 * Đọc kết quả phân tích ABC-XYZ và gợi ý bố trí kho
 */
export function getAbcXyzAnalysis(maKho?: string) {
  const dmDir = getDataMiningDir();
  const dlDir = getDataLakeGoldDir();

  const isSpecific = maKho && maKho.toUpperCase() !== 'ALL';
  const fileName = isSpecific ? `abc_xyz_analysis_${maKho.toUpperCase()}.json` : 'abc_xyz_analysis.json';

  const candidates = [
    path.join(dmDir, 'datasets', 'gold', fileName),
    path.join(dlDir, fileName),
    path.resolve(process.cwd(), `data_center/data_lake/gold/${fileName}`),
    path.resolve(process.cwd(), `../data_center/data_lake/gold/${fileName}`),
  ];

  let targetPath = '';
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      targetPath = c;
      break;
    }
  }

  if (!targetPath) {
    throw new Error(`Chưa có dữ liệu phân tích ABC-XYZ cho phạm vi '${maKho || 'ALL'}'. Hãy chạy pipeline để tạo kết quả.`);
  }

  const raw = fs.readFileSync(targetPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Đọc kết quả khai phá luật kết hợp Market Basket (Apriori) và gợi ý picking
 */
export function getMarketBasketRules(maKho?: string) {
  const dmDir = getDataMiningDir();
  const dlDir = getDataLakeGoldDir();

  const isSpecific = maKho && maKho.toUpperCase() !== 'ALL';
  const fileName = isSpecific ? `market_basket_rules_${maKho.toUpperCase()}.json` : 'market_basket_rules.json';

  const candidates = [
    path.join(dmDir, 'datasets', 'gold', fileName),
    path.join(dlDir, fileName),
    path.resolve(process.cwd(), `data_center/data_lake/gold/${fileName}`),
    path.resolve(process.cwd(), `../data_center/data_lake/gold/${fileName}`),
  ];

  let targetPath = '';
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      targetPath = c;
      break;
    }
  }

  if (!targetPath) {
    throw new Error(`Chưa có dữ liệu luật kết hợp giỏ hàng cho phạm vi '${maKho || 'ALL'}'. Hãy chạy pipeline để tạo kết quả.`);
  }

  const raw = fs.readFileSync(targetPath, 'utf-8');
  return JSON.parse(raw);
}


/**
 * Đọc kết quả đề xuất điều chuyển hàng liên kho (DSS Transfer Recommendations)
 */
export function getTransferRecommendations(maKho?: string) {
  const dmDir = getDataMiningDir();
  const dlDir = getDataLakeGoldDir();

  const isSpecific = maKho && maKho.toUpperCase() !== 'ALL';
  const fileName = isSpecific ? `transfer_recommendations_${maKho.toUpperCase()}.json` : 'transfer_recommendations.json';

  const candidates = [
    path.join(dmDir, 'datasets', 'gold', fileName),
    path.join(dlDir, fileName),
    path.resolve(process.cwd(), `data_center/data_lake/gold/${fileName}`),
    path.resolve(process.cwd(), `../data_center/data_lake/gold/${fileName}`),
  ];

  let targetPath = '';
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      targetPath = c;
      break;
    }
  }

  if (!targetPath) {
    throw new Error(`Chưa có dữ liệu đề xuất điều chuyển cho phạm vi '${maKho || 'ALL'}'. Hãy chạy pipeline để tạo kết quả.`);
  }

  const raw = fs.readFileSync(targetPath, 'utf-8');
  return JSON.parse(raw);
}
