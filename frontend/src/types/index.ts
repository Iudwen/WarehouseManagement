export interface StockItem {
  ma_kho: string;
  ten_kho: string;
  ma_sp: string;
  ten_sp: string;
  so_luong: number;
  cap_nhat_luc: string;
}

export interface MongoEventLog {
  _id: string;
  event_type?: string;
  reason?: string;
  ma_kho?: string;
  ma_phieu?: string;
  event_time?: string;
  created_at?: string;
  items?: Array<{ ma_sp: string; so_luong: number; don_gia?: number }>;
}

export interface LowStockAlert {
  ma_kho: string;
  ten_kho: string;
  ma_sp: string;
  ten_sp: string;
  so_luong: number;
  ton_toi_thieu: number;
}
export interface MasterData {
  san_pham: Array<{ 
    ma_sp: string; 
    ten_sp: string; 
    don_vi: string; 
    gia_nhap: number | string; 
    gia_ban: number | string; 
  }>;
  nha_cung_cap: Array<{ ma_ncc: string; ten_ncc: string }>;
  khach_hang: Array<{ ma_kh: string; ten_kh: string }>;
  danh_sach_kho: Array<{ ma_kho: string; ten_kho: string }>;
}
export interface ImportPayload {
  ma_phieu_nhap: string;
  ma_kho: string;
  ma_ncc: string;
  items: Array<{
    ma_sp: string;
    so_luong: number;
    don_gia: number;
  }>;
}

export interface ExportPayload {
  ma_phieu_xuat: string;
  ma_kho: string;
  ma_kh: string;
  items: Array<{
    ma_sp: string;
    so_luong: number;
    don_gia: number;
  }>;
}

export interface TransferPayload {
  ma_phieu_dc: string;
  kho_xuat: string;
  kho_nhap: string;
  ma_sp: string;
  so_luong: number;
}

export interface TransferListItem {
  id: number;
  ma_phieu_dc: string;
  kho_xuat: string;
  ten_kho_xuat: string | null;
  kho_nhap: string;
  ten_kho_nhap: string | null;
  ma_sp: string;
  ten_sp: string | null;
  don_vi: string | null;
  so_luong: number;
  trang_thai: string;
  created_at: string;
  ngay_dieu_chuyen: string | null;
  saga_id: string | null;
  saga_state: string | null;
  saga_status: string | null;
  so_luong_da_xuat: number | null;
  so_luong_thuc_nhan: number | null;
  error_message: string | null;
}

export interface ImportReceiptListItem {
  ma_phieu_nhap: string;
  ma_kho: string;
  ma_ncc: string | null;
  ten_ncc: string | null;
  ngay_nhap: string;
  trang_thai: string;
  tong_so_luong: number;
  tong_tien: number;
  items: Array<{
    ma_sp: string;
    ten_sp: string | null;
    don_vi: string | null;
    so_luong: number;
    don_gia: number;
  }>;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  message?: string;
  data?: T;
}

export type UserRole =
  | 'ADMIN'
  | 'DIEU_PHOI'
  | 'DATA_ANALYST'
  | 'QUAN_LY_KHO'
  | 'NHAN_VIEN_KHO';

export interface AuthUser {
  ma_nguoi_dung: string;
  ho_ten: string;
  vai_tro: UserRole;
  ma_kho: string | null;
  username?: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: {
    ma_nguoi_dung: string;
    ho_ten: string;
    vai_tro: UserRole;
    ma_kho: string | null;
  };
}

export interface ReceiveItemInput {
  ma_sp: string;
  so_luong_thuc_nhan: number;
}

export interface ConfirmReceiveResponse {
  success: boolean;
  ma_phieu_nhap: string;
  trang_thai: string;
  has_shortage: boolean;
  details?: Array<{
    ma_sp: string;
    thuc_nhan_dot_nay: number;
    tong_da_nhan: number;
    yeu_cau: number;
    con_thieu: number;
  }>;
}

export interface ImportActionResponse {
  message: string;
  data?: any;
}

// ==========================================
// DATA MINING & DEMAND FORECASTING TYPES
// ==========================================
export interface DataMiningForecastItem {
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

export interface DataMiningSummaryData {
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
    baseline: { mae: number; rmse: number };
    ridge: { mae: number; rmse: number };
    randomForest: { mae: number; rmse: number };
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
    bestModel: string;
  }>;
  zeroDemandBreakdown: {
    zeroDays: {
      count: number;
      pct: number;
      baselineMae: number;
      ridgeMae: number;
      rfMae: number;
    };
    positiveDays: {
      count: number;
      pct: number;
      baselineMae: number;
      ridgeMae: number;
      rfMae: number;
    };
  };
  topProducts: Array<{
    ma_sp: string;
    avgActual: number;
    zeroPct: number;
    baselineMae: number;
    ridgeMae: number;
    rfMae: number;
  }>;
}

export interface TimeSeriesPoint {
  ngay: string;
  thuc_te: number;
  du_bao_ridge: number;
  du_bao_baseline: number;
  du_bao_rf: number;
  du_bao_lgb?: number;
  so_dong: number;
}

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

export interface IOStatisticsData {
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
  source?: 'LIVE_DATABASE' | 'HISTORICAL_DATASET';
}


// ==========================================
// HẠNG MỤC GIAI ĐOẠN 4: HỆ THỐNG HỖ TRỢ QUYẾT ĐỊNH KHO
// ==========================================

export interface AbcXyzItem {
  ma_sp: string;
  ten_sp: string;
  gia_ban: number;
  tong_so_luong: number;
  tong_gia_tri: number;
  ty_le_gia_tri: number;
  ty_le_tich_luy: number;
  so_phieu_xuat: number;
  so_dong_xuat: number;
  nhom_abc: 'A' | 'B' | 'C';
  mean_daily: number;
  std_daily: number;
  cv: number;
  zero_pct: number;
  nhom_xyz: 'X' | 'Y' | 'Z';
  nhom_abc_xyz: string;
  muc_uu_tien: string;
  nguyen_tac_bo_tri: string;
  chinh_sach_ton_kho: string;
  ly_do_de_xuat: string;
  kho_ap_dung: string;
}

export interface AbcXyzAnalysisData {
  kho_ap_dung: string;
  tong_so_san_pham: number;
  tong_doanh_thu: number;
  tong_san_luong: number;
  phan_bo_abc: Record<string, number>;
  phan_bo_xyz: Record<string, number>;
  phan_bo_matrix: Record<string, number>;
  nguong_abc: Record<string, string>;
  ghi_chu_bo_tri: string;
  items: AbcXyzItem[];
}

export interface MarketBasketRule {
  antecedent: string;
  antecedent_name: string;
  consequent: string;
  consequent_name: string;
  support: number;
  support_pct: number;
  confidence: number;
  confidence_pct: number;
  lift: number;
  transaction_count: number;
  picking_suggestion: string;
  kho_ap_dung: string;
}

export interface TopPickingPair {
  item_1: string;
  item_1_name: string;
  item_2: string;
  item_2_name: string;
  transaction_count: number;
  support_pct: number;
  de_xuat_picking: string;
}

export interface MarketBasketData {
  kho_ap_dung: string;
  tong_so_giao_dich: number;
  so_giao_dich_da_san_pham: number;
  tong_so_luat_khai_pha: number;
  tong_so_cap_san_pham_frequent: number;
  tham_so_apriori: {
    min_support: number;
    min_confidence: number;
    min_lift: number;
  };
  ghi_chu_picking: string;
  top_picking_pairs: TopPickingPair[];
  rules: MarketBasketRule[];
}

export interface TransferRecommendationItem {
  id: string;
  ma_sp: string;
  ten_sp: string;
  don_vi: string;
  nhom_abc_xyz: string;
  kho_nguon: string;
  ton_kho_nguon: number;
  dos_kho_nguon: number;
  kho_dich: string;
  ton_kho_dich: number;
  dos_kho_dich: number;
  so_luong_de_xuat: number;
  gia_tri_uoc_tinh: number;
  muc_do_uu_tien: string;
  priority_code: 'HIGH' | 'MEDIUM' | 'LOW';
  can_cu_de_xuat: string;
  ngay_tao: string;
}

export interface TransferRecommendationData {
  kho_ap_dung: string;
  thoi_diem_tao: string;
  tong_so_de_xuat: number;
  tong_gia_tri_uoc_tinh: number;
  phan_bo_muc_do: Record<string, number>;
  ghi_chu_nghiep_vu: string;
  items: TransferRecommendationItem[];
}
