import fs from 'fs';
import path from 'path';
import { pools } from '../config/postgresql';
import {
  getStockByNode,
  getPendingReceiptCounts,
  getNodeIOKpi,
  getNodeIOTimeline,
  getNodeTopProducts,
} from '../repositories/dashboardRepository';

export const NODE_CONFIG = [
  { code: 'HN01', poolKey: 'HN', name: 'Kho Hà Nội' },
  { code: 'DN01', poolKey: 'DN', name: 'Kho Đà Nẵng' },
  { code: 'HCM01', poolKey: 'HCM', name: 'Kho TP.HCM' },
] as const;

export const PRODUCT_NAMES: Record<string, string> = {
  SP001: 'Laptop Dell',
  SP002: 'Laptop HP',
  SP003: 'Laptop Lenovo',
  SP004: 'Chuột Logitech',
  SP005: 'Chuột Microsoft',
  SP006: 'Bàn phím Logitech',
  SP007: 'Bàn phím Dell',
  SP008: 'Màn hình Samsung',
  SP009: 'Màn hình LG',
  SP010: 'Tai nghe Sony',
  SP011: 'Tai nghe JBL',
  SP012: 'USB 32GB',
  SP013: 'USB 64GB',
  SP014: 'Ổ cứng SSD 500GB',
  SP015: 'Ổ cứng SSD 1TB',
  SP016: 'Máy in Canon',
  SP017: 'Máy in HP',
  SP018: 'Webcam Logitech',
  SP019: 'Loa Bluetooth',
  SP020: 'Router Wifi',
};

export const WAREHOUSE_NAMES: Record<string, string> = {
  HN01: 'Kho Hà Nội',
  DN01: 'Kho Đà Nẵng',
  HCM01: 'Kho TP.HCM',
};

export interface IOKpiStats {
  tong_nhap_hom_nay: number;
  so_phieu_nhap_hom_nay: number;
  tong_xuat_hom_nay: number;
  so_phieu_xuat_hom_nay: number;
  tong_nhap_thang_nay: number;
  so_phieu_nhap_thang_nay: number;
  tong_xuat_thang_nay: number;
  so_phieu_xuat_thang_nay: number;
  tong_nhap_khoang_loc: number;
  so_phieu_nhap_khoang_loc: number;
  tong_xuat_khoang_loc: number;
  so_phieu_xuat_khoang_loc: number;
  chenh_lech_rong_khoang_loc: number;
}

export interface IOTimelinePoint {
  moc_thoi_gian: string;
  so_luong_nhap: number;
  so_phieu_nhap: number;
  so_luong_xuat: number;
  so_phieu_xuat: number;
  chenh_lech_rong: number;
}

export interface IOWarehouseBreakdown {
  ma_kho: string;
  ten_kho: string;
  so_luong_nhap: number;
  so_phieu_nhap: number;
  so_luong_xuat: number;
  so_phieu_xuat: number;
}

export interface IOTopProductItem {
  ma_sp: string;
  ten_sp: string;
  don_vi: string;
  so_luong: number;
  so_phieu: number;
}

export interface IOStatisticsResult {
  warehouse: string;
  granularity: 'day' | 'month';
  from_date: string;
  to_date: string;
  kpi: IOKpiStats;
  timeline: IOTimelinePoint[];
  warehouse_breakdown: IOWarehouseBreakdown[];
  top_products: {
    most_imported: IOTopProductItem[];
    most_exported: IOTopProductItem[];
  };
  source: 'LIVE_DATABASE' | 'HISTORICAL_DATASET';
}

/**
 * Lấy tồn kho tổng hợp realtime
 */
export const getAggregatedStock = async (maKho?: string) => {
  const normalizedKho = maKho?.trim().toUpperCase();

  let targetNodes: typeof NODE_CONFIG[number][] = [...NODE_CONFIG];

  if (normalizedKho && normalizedKho !== 'CENTRAL' && normalizedKho !== 'ALL') {
    targetNodes = NODE_CONFIG.filter((node) => node.code === normalizedKho);
  }

  const stockData: any[] = [];

  for (const node of targetNodes) {
    try {
      const pool = pools[node.poolKey];
      const rows = await getStockByNode(pool);
      stockData.push(...rows);
    } catch (error) {
      console.error(`Không thể lấy dữ liệu tồn kho Node ${node.code}:`, error);
    }
  }

  return stockData;
};

/**
 * Đếm số lượng đơn chờ xử lý thực tế trên các node
 */
export const getPendingReceiptSummary = async (maKho?: string) => {
  const normalizedKho = maKho?.trim().toUpperCase();

  let targetNodes: typeof NODE_CONFIG[number][] = [...NODE_CONFIG];
  if (normalizedKho && normalizedKho !== 'CENTRAL' && normalizedKho !== 'ALL') {
    targetNodes = NODE_CONFIG.filter((node) => node.code === normalizedKho);
  }

  let pendingImports = 0;
  let pendingExports = 0;

  for (const node of targetNodes) {
    try {
      const pool = pools[node.poolKey];
      const counts = await getPendingReceiptCounts(pool);
      pendingImports += counts.pendingImports;
      pendingExports += counts.pendingExports;
    } catch (error) {
      // Bỏ qua nếu node chưa sẵn sàng
    }
  }

  return { pendingImports, pendingExports };
};

// Đường dẫn file dữ liệu giao dịch lịch sử chuẩn
function getHistoricalCsvPath(): string {
  const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const candidates = [
    path.resolve(currentDir, '../../data_mining/datasets/raw/lich_su_nhap_xuat.csv'),
    path.resolve(currentDir, '../data_mining/datasets/raw/lich_su_nhap_xuat.csv'),
    path.resolve(process.cwd(), 'data_mining/datasets/raw/lich_su_nhap_xuat.csv'),
    path.resolve(process.cwd(), '../data_mining/datasets/raw/lich_su_nhap_xuat.csv'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return path.resolve(process.cwd(), 'data_mining/datasets/raw/lich_su_nhap_xuat.csv');
}

interface RawCsvRow {
  ngay: string;
  ma_kho: string;
  ma_sp: string;
  tong_so_luong_nhap: number;
  so_phieu_nhap: number;
  tong_so_luong_xuat: number;
  so_phieu_xuat: number;
  tong_gia_tri_xuat: number;
}

let cachedCsvRows: RawCsvRow[] | null = null;

function loadCsvData(): RawCsvRow[] {
  if (cachedCsvRows) return cachedCsvRows;

  const csvPath = getHistoricalCsvPath();
  if (!fs.existsSync(csvPath)) {
    return [];
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');
  if (lines.length <= 1) return [];

  const rows: RawCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 8) continue;

    rows.push({
      ngay: parts[0].trim(),
      ma_kho: parts[1].trim(),
      ma_sp: parts[2].trim(),
      tong_so_luong_nhap: parseInt(parts[3], 10) || 0,
      so_phieu_nhap: parseInt(parts[4], 10) || 0,
      tong_so_luong_xuat: parseInt(parts[5], 10) || 0,
      so_phieu_xuat: parseInt(parts[6], 10) || 0,
      tong_gia_tri_xuat: parseFloat(parts[7]) || 0,
    });
  }

  cachedCsvRows = rows;
  return rows;
}

/**
 * Tính toán thống kê nhập xuất từ dữ liệu lịch sử chuẩn (Fallback khi DB offline)
 */
function aggregateFromHistoricalDataset(
  targetKho: string,
  fromDate?: string,
  toDate?: string,
  granularity: 'day' | 'month' = 'day'
): IOStatisticsResult {
  const allRows = loadCsvData();

  const isAll = !targetKho || targetKho === 'ALL' || targetKho === 'CENTRAL';
  const filteredKhoRows = isAll
    ? allRows
    : allRows.filter((r) => r.ma_kho === targetKho.toUpperCase());

  // Tìm min/max date nếu không truyền
  let effFrom = fromDate;
  let effTo = toDate;

  if (!effFrom || !effTo) {
    if (filteredKhoRows.length > 0) {
      const dates = filteredKhoRows.map((r) => r.ngay).sort();
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      // Mặc định 30 ngày cuối trong dữ liệu
      effTo = effTo || maxDate;
      const d = new Date(effTo);
      d.setDate(d.getDate() - 30);
      const computedFrom = d.toISOString().slice(0, 10);
      effFrom = effFrom || (computedFrom < minDate ? minDate : computedFrom);
    } else {
      effFrom = effFrom || '2026-08-01';
      effTo = effTo || '2026-09-18';
    }
  }

  // Lấy ngày mới nhất trong tập dữ liệu để làm mốc "Hôm nay" và "Tháng này" (reference date)
  const maxDatasetDate = filteredKhoRows.length > 0
    ? filteredKhoRows.map((r) => r.ngay).sort().reverse()[0]
    : '2026-09-18';
  const refMonth = maxDatasetDate.slice(0, 7); // '2026-09'

  // 1. Tính KPI
  let tong_nhap_hom_nay = 0;
  let so_phieu_nhap_hom_nay = 0;
  let tong_xuat_hom_nay = 0;
  let so_phieu_xuat_hom_nay = 0;

  let tong_nhap_thang_nay = 0;
  let so_phieu_nhap_thang_nay = 0;
  let tong_xuat_thang_nay = 0;
  let so_phieu_xuat_thang_nay = 0;

  let tong_nhap_khoang_loc = 0;
  let so_phieu_nhap_khoang_loc = 0;
  let tong_xuat_khoang_loc = 0;
  let so_phieu_xuat_khoang_loc = 0;

  // 2. Timeline Map
  const timelineMap = new Map<string, {
    so_luong_nhap: number;
    so_phieu_nhap: number;
    so_luong_xuat: number;
    so_phieu_xuat: number;
  }>();

  // 3. Warehouse Breakdown Map
  const whMap = new Map<string, {
    so_luong_nhap: number;
    so_phieu_nhap: number;
    so_luong_xuat: number;
    so_phieu_xuat: number;
  }>();

  // 4. Product stats
  const importProductMap = new Map<string, { so_luong: number; so_phieu: number }>();
  const exportProductMap = new Map<string, { so_luong: number; so_phieu: number }>();

  for (const r of filteredKhoRows) {
    // KPI hôm nay (theo ngày mới nhất của dataset)
    if (r.ngay === maxDatasetDate) {
      tong_nhap_hom_nay += r.tong_so_luong_nhap;
      so_phieu_nhap_hom_nay += r.so_phieu_nhap;
      tong_xuat_hom_nay += r.tong_so_luong_xuat;
      so_phieu_xuat_hom_nay += r.so_phieu_xuat;
    }

    // KPI tháng này
    if (r.ngay.startsWith(refMonth)) {
      tong_nhap_thang_nay += r.tong_so_luong_nhap;
      so_phieu_nhap_thang_nay += r.so_phieu_nhap;
      tong_xuat_thang_nay += r.tong_so_luong_xuat;
      so_phieu_xuat_thang_nay += r.so_phieu_xuat;
    }

    // Lọc theo khoảng ngày [effFrom, effTo]
    if (r.ngay >= effFrom && r.ngay <= effTo) {
      tong_nhap_khoang_loc += r.tong_so_luong_nhap;
      so_phieu_nhap_khoang_loc += r.so_phieu_nhap;
      tong_xuat_khoang_loc += r.tong_so_luong_xuat;
      so_phieu_xuat_khoang_loc += r.so_phieu_xuat;

      // Group timeline
      const key = granularity === 'month' ? r.ngay.slice(0, 7) : r.ngay;
      const tItem = timelineMap.get(key) || {
        so_luong_nhap: 0,
        so_phieu_nhap: 0,
        so_luong_xuat: 0,
        so_phieu_xuat: 0,
      };
      tItem.so_luong_nhap += r.tong_so_luong_nhap;
      tItem.so_phieu_nhap += r.so_phieu_nhap;
      tItem.so_luong_xuat += r.tong_so_luong_xuat;
      tItem.so_phieu_xuat += r.so_phieu_xuat;
      timelineMap.set(key, tItem);

      // Warehouse breakdown
      const whItem = whMap.get(r.ma_kho) || {
        so_luong_nhap: 0,
        so_phieu_nhap: 0,
        so_luong_xuat: 0,
        so_phieu_xuat: 0,
      };
      whItem.so_luong_nhap += r.tong_so_luong_nhap;
      whItem.so_phieu_nhap += r.so_phieu_nhap;
      whItem.so_luong_xuat += r.tong_so_luong_xuat;
      whItem.so_phieu_xuat += r.so_phieu_xuat;
      whMap.set(r.ma_kho, whItem);

      // Product stats
      if (r.tong_so_luong_nhap > 0) {
        const pIn = importProductMap.get(r.ma_sp) || { so_luong: 0, so_phieu: 0 };
        pIn.so_luong += r.tong_so_luong_nhap;
        pIn.so_phieu += r.so_phieu_nhap;
        importProductMap.set(r.ma_sp, pIn);
      }
      if (r.tong_so_luong_xuat > 0) {
        const pOut = exportProductMap.get(r.ma_sp) || { so_luong: 0, so_phieu: 0 };
        pOut.so_luong += r.tong_so_luong_xuat;
        pOut.so_phieu += r.so_phieu_xuat;
        exportProductMap.set(r.ma_sp, pOut);
      }
    }
  }

  // Format Timeline sorted by time
  const timeline: IOTimelinePoint[] = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moc_thoi_gian, data]) => ({
      moc_thoi_gian,
      so_luong_nhap: data.so_luong_nhap,
      so_phieu_nhap: data.so_phieu_nhap,
      so_luong_xuat: data.so_luong_xuat,
      so_phieu_xuat: data.so_phieu_xuat,
      chenh_lech_rong: data.so_luong_nhap - data.so_luong_xuat,
    }));

  // Format Warehouse Breakdown
  const warehouse_breakdown: IOWarehouseBreakdown[] = Array.from(whMap.entries())
    .map(([code, data]) => ({
      ma_kho: code,
      ten_kho: WAREHOUSE_NAMES[code] || code,
      so_luong_nhap: data.so_luong_nhap,
      so_phieu_nhap: data.so_phieu_nhap,
      so_luong_xuat: data.so_luong_xuat,
      so_phieu_xuat: data.so_phieu_xuat,
    }))
    .sort((a, b) => a.ma_kho.localeCompare(b.ma_kho));

  // Format Top Products
  const most_imported: IOTopProductItem[] = Array.from(importProductMap.entries())
    .map(([ma_sp, d]) => ({
      ma_sp,
      ten_sp: PRODUCT_NAMES[ma_sp] || ma_sp,
      don_vi: 'Cái',
      so_luong: d.so_luong,
      so_phieu: d.so_phieu,
    }))
    .sort((a, b) => b.so_luong - a.so_luong)
    .slice(0, 5);

  const most_exported: IOTopProductItem[] = Array.from(exportProductMap.entries())
    .map(([ma_sp, d]) => ({
      ma_sp,
      ten_sp: PRODUCT_NAMES[ma_sp] || ma_sp,
      don_vi: 'Cái',
      so_luong: d.so_luong,
      so_phieu: d.so_phieu,
    }))
    .sort((a, b) => b.so_luong - a.so_luong)
    .slice(0, 5);

  return {
    warehouse: isAll ? 'ALL' : targetKho.toUpperCase(),
    granularity,
    from_date: effFrom,
    to_date: effTo,
    kpi: {
      tong_nhap_hom_nay,
      so_phieu_nhap_hom_nay,
      tong_xuat_hom_nay,
      so_phieu_xuat_hom_nay,
      tong_nhap_thang_nay,
      so_phieu_nhap_thang_nay,
      tong_xuat_thang_nay,
      so_phieu_xuat_thang_nay,
      tong_nhap_khoang_loc,
      so_phieu_nhap_khoang_loc,
      tong_xuat_khoang_loc,
      so_phieu_xuat_khoang_loc,
      chenh_lech_rong_khoang_loc: tong_nhap_khoang_loc - tong_xuat_khoang_loc,
    },
    timeline,
    warehouse_breakdown,
    top_products: {
      most_imported,
      most_exported,
    },
    source: 'HISTORICAL_DATASET',
  };
}

/**
 * Lấy toàn bộ thống kê nhập - xuất (Tự động chuyển đổi giữa Live DB và Historical Dataset)
 */
export const getIOStatistics = async (
  targetKho: string = 'ALL',
  fromDate?: string,
  toDate?: string,
  granularity: 'day' | 'month' = 'day'
): Promise<IOStatisticsResult> => {
  const isAll = !targetKho || targetKho === 'ALL' || targetKho === 'CENTRAL';
  const targetNodes = isAll
    ? [...NODE_CONFIG]
    : NODE_CONFIG.filter((n) => n.code === targetKho.toUpperCase());

  // Thử kết nối live database qua PostgreSQL pools
  let liveDbSuccess = false;
  let combinedKpi: IOKpiStats = {
    tong_nhap_hom_nay: 0,
    so_phieu_nhap_hom_nay: 0,
    tong_xuat_hom_nay: 0,
    so_phieu_xuat_hom_nay: 0,
    tong_nhap_thang_nay: 0,
    so_phieu_nhap_thang_nay: 0,
    tong_xuat_thang_nay: 0,
    so_phieu_xuat_thang_nay: 0,
    tong_nhap_khoang_loc: 0,
    so_phieu_nhap_khoang_loc: 0,
    tong_xuat_khoang_loc: 0,
    so_phieu_xuat_khoang_loc: 0,
    chenh_lech_rong_khoang_loc: 0,
  };

  const timelineMap = new Map<string, {
    so_luong_nhap: number;
    so_phieu_nhap: number;
    so_luong_xuat: number;
    so_phieu_xuat: number;
  }>();

  const warehouseBreakdown: IOWarehouseBreakdown[] = [];
  const topImportMap = new Map<string, IOTopProductItem>();
  const topExportMap = new Map<string, IOTopProductItem>();

  for (const node of targetNodes) {
    try {
      const pool = pools[node.poolKey];
      const [kpi, timelineData, topProducts] = await Promise.all([
        getNodeIOKpi(pool, fromDate, toDate),
        getNodeIOTimeline(pool, fromDate, toDate, granularity),
        getNodeTopProducts(pool, fromDate, toDate),
      ]);

      liveDbSuccess = true;

      // Cộng dồn KPI
      combinedKpi.tong_nhap_hom_nay += kpi.tong_nhap_hom_nay;
      combinedKpi.so_phieu_nhap_hom_nay += kpi.so_phieu_nhap_hom_nay;
      combinedKpi.tong_xuat_hom_nay += kpi.tong_xuat_hom_nay;
      combinedKpi.so_phieu_xuat_hom_nay += kpi.so_phieu_xuat_hom_nay;
      combinedKpi.tong_nhap_thang_nay += kpi.tong_nhap_thang_nay;
      combinedKpi.so_phieu_nhap_thang_nay += kpi.so_phieu_nhap_thang_nay;
      combinedKpi.tong_xuat_thang_nay += kpi.tong_xuat_thang_nay;
      combinedKpi.so_phieu_xuat_thang_nay += kpi.so_phieu_xuat_thang_nay;
      combinedKpi.tong_nhap_khoang_loc += kpi.tong_nhap_khoang_loc;
      combinedKpi.so_phieu_nhap_khoang_loc += kpi.so_phieu_nhap_khoang_loc;
      combinedKpi.tong_xuat_khoang_loc += kpi.tong_xuat_khoang_loc;
      combinedKpi.so_phieu_xuat_khoang_loc += kpi.so_phieu_xuat_khoang_loc;

      // Warehouse breakdown của node này
      warehouseBreakdown.push({
        ma_kho: node.code,
        ten_kho: node.name,
        so_luong_nhap: kpi.tong_nhap_khoang_loc,
        so_phieu_nhap: kpi.so_phieu_nhap_khoang_loc,
        so_luong_xuat: kpi.tong_xuat_khoang_loc,
        so_phieu_xuat: kpi.so_phieu_xuat_khoang_loc,
      });

      // Gộp timeline nhập
      for (const item of timelineData.imports) {
        const cur = timelineMap.get(item.moc_thoi_gian) || {
          so_luong_nhap: 0,
          so_phieu_nhap: 0,
          so_luong_xuat: 0,
          so_phieu_xuat: 0,
        };
        cur.so_luong_nhap += item.so_luong_nhap;
        cur.so_phieu_nhap += item.so_phieu_nhap;
        timelineMap.set(item.moc_thoi_gian, cur);
      }

      // Gộp timeline xuất
      for (const item of timelineData.exports) {
        const cur = timelineMap.get(item.moc_thoi_gian) || {
          so_luong_nhap: 0,
          so_phieu_nhap: 0,
          so_luong_xuat: 0,
          so_phieu_xuat: 0,
        };
        cur.so_luong_xuat += item.so_luong_xuat;
        cur.so_phieu_xuat += item.so_phieu_xuat;
        timelineMap.set(item.moc_thoi_gian, cur);
      }

      // Top products
      for (const p of topProducts.most_imported) {
        const cur = topImportMap.get(p.ma_sp) || { ...p, so_luong: 0, so_phieu: 0 };
        cur.so_luong += p.so_luong;
        cur.so_phieu += p.so_phieu;
        topImportMap.set(p.ma_sp, cur);
      }
      for (const p of topProducts.most_exported) {
        const cur = topExportMap.get(p.ma_sp) || { ...p, so_luong: 0, so_phieu: 0 };
        cur.so_luong += p.so_luong;
        cur.so_phieu += p.so_phieu;
        topExportMap.set(p.ma_sp, cur);
      }
    } catch (err) {
      // Node offline hoặc lỗi kết nối
    }
  }

  // Nếu live database có phản hồi và có dữ liệu
  if (liveDbSuccess && (combinedKpi.tong_nhap_khoang_loc > 0 || combinedKpi.tong_xuat_khoang_loc > 0 || combinedKpi.tong_nhap_hom_nay > 0)) {
    combinedKpi.chenh_lech_rong_khoang_loc =
      combinedKpi.tong_nhap_khoang_loc - combinedKpi.tong_xuat_khoang_loc;

    const timeline: IOTimelinePoint[] = Array.from(timelineMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moc_thoi_gian, d]) => ({
        moc_thoi_gian,
        so_luong_nhap: d.so_luong_nhap,
        so_phieu_nhap: d.so_phieu_nhap,
        so_luong_xuat: d.so_luong_xuat,
        so_phieu_xuat: d.so_phieu_xuat,
        chenh_lech_rong: d.so_luong_nhap - d.so_luong_xuat,
      }));

    const most_imported = Array.from(topImportMap.values())
      .sort((a, b) => b.so_luong - a.so_luong)
      .slice(0, 5);

    const most_exported = Array.from(topExportMap.values())
      .sort((a, b) => b.so_luong - a.so_luong)
      .slice(0, 5);

    return {
      warehouse: isAll ? 'ALL' : targetKho.toUpperCase(),
      granularity,
      from_date: fromDate || '2026-08-01',
      to_date: toDate || '2026-09-18',
      kpi: combinedKpi,
      timeline,
      warehouse_breakdown: warehouseBreakdown.sort((a, b) => a.ma_kho.localeCompare(b.ma_kho)),
      top_products: {
        most_imported,
        most_exported,
      },
      source: 'LIVE_DATABASE',
    };
  }

  // Fallback an toàn sang historical dataset (16,400 giao dịch lịch sử chuẩn từ seed)
  return aggregateFromHistoricalDataset(targetKho, fromDate, toDate, granularity);
};