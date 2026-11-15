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
    lightgbm?: { mae: number; rmse: number };
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
  antecedent_count?: number;
  consequent_count?: number;
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
    min_lift?: number;
    min_count?: number;
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

export interface DataLakeQualityReport {
  table_name: string;
  source_rows: number;
  silver_rows: number;
  rejected_rows: number;
  duplicate_rows_detected: number;
  null_primary_keys_detected: number;
  status: 'PASSED' | 'FAILED';
  rules_applied: string[];
  execution_timestamp?: string;
  file_size_kb?: number;
}

export interface DataLakeMedallionInfo {
  medallion: {
    bronze: {
      postgres_tables: number;
      mongodb_collections: number;
      description: string;
      sample_tables: string[];
    };
    silver: {
      total_reports: number;
      passed_reports: number;
      failed_reports: number;
      quality_rate: number;
      total_source_rows: number;
      total_silver_rows: number;
      description: string;
      reports: DataLakeQualityReport[];
    };
    gold: {
      delta_table: {
        name: string;
        engine: string;
        format: string;
        current_version: number;
        total_commits: number;
        total_rows: number;
        total_quantity: number;
        time_travel_supported: boolean;
        columns: string[];
      };
      analytical_dataset: {
        rows: number;
        columns: number;
        features: string[];
      };
      description: string;
    };
  };
  pipeline_status?: {
    last_run?: string;
    total_duration_sec?: number;
    status?: string;
    steps?: Array<{ step: string | number; name: string; status: string; duration_seconds?: number; duration_sec?: number }>;
  };
  model_registry?: any;
}


// ==========================================================
// SYSTEM MONITORING TYPES (GIAI ĐOẠN 4)
// ==========================================================

export interface SystemHealthData {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  statusText: string;
  timestamp: string;
  uptimeSeconds: number;
  nodesSummary: {
    total: number;
    online: number;
    degraded: number;
    offline: number;
  };
  infrastructure: {
    postgresHN: 'ONLINE' | 'OFFLINE';
    postgresDN: 'ONLINE' | 'OFFLINE';
    postgresHCM: 'ONLINE' | 'OFFLINE';
    postgresCentral: 'ONLINE' | 'OFFLINE';
    mongoDb: 'ONLINE' | 'OFFLINE';
    kafkaBroker: 'ONLINE' | 'OFFLINE';
    outboxWorker: 'ACTIVE' | 'IDLE' | 'STOPPED';
  };
}

export interface NodeStatusData {
  nodeId: 'HN' | 'DN' | 'HCM' | 'CENTRAL';
  name: string;
  type: 'WAREHOUSE_NODE' | 'CENTRAL_DATA_CENTER';
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  statusSource: 'inferred_from_services';
  statusText: string;
  latencyMs: number;
  lastChecked: string;
  postgres: {
    status: 'CONNECTED' | 'ERROR' | 'UNREACHABLE';
    latencyMs: number;
    database: string;
    error?: string;
  };
  outbox?: {
    pending: number;
    processing: number;
    failed: number;
    processed: number;
    lastProcessedAt: string | null;
  };
  details?: Record<string, any>;
}

export interface SystemMetricsData {
  timestamp: string;
  databaseMetrics: Record<string, {
    status: 'ONLINE' | 'OFFLINE';
    latencyMs: number;
    error?: string;
  }>;
  mongoMetrics: {
    status: 'ONLINE' | 'OFFLINE';
    latencyMs: number;
    readyState: number;
    error?: string;
  };
  kafkaMetrics: {
    status: 'ONLINE' | 'OFFLINE';
    latencyMs: number;
    clusterId?: string;
    brokerCount?: number;
    topics?: string[];
    hasBusinessTopics?: boolean;
    error?: string;
  };
  outboxWorkerMetrics: {
    workerStatus: 'ACTIVE' | 'IDLE' | 'STOPPED';
    lastHeartbeat: string | null;
    heartbeatNodes: Array<{ node: string; lastPollAt: string; status: string }>;
  };
  outboxBacklogMetrics: {
    totalPending: number;
    totalProcessing: number;
    totalFailed: number;
    totalProcessed: number;
    nodes: Record<string, {
      pending: number;
      processing: number;
      failed: number;
      processed: number;
      lastProcessedAt: string | null;
    }>;
  };
}

// -------------------------------------------------------------
// GIAI ĐOẠN 5: BACKUP & RECOVERY TYPES (TASK 5.7)
// -------------------------------------------------------------

export interface BackupRecord {
  backupId: string;
  sessionId?: string;
  backupType: 'POSTGRES' | 'MONGODB';
  database: string;
  nodeId: 'HN' | 'DN' | 'HCM' | 'CENTRAL' | 'MONGO';
  fileName: string;
  originalPath: string;
  createdAt: string;
  sizeBytes: number;
  sizeFormatted: string;
  checksumSHA256: string;
  status: 'SUCCESS' | 'FAILED';
  validated: boolean;
  tocOrCollectionsCount?: number;
  replicaStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  replicaPath?: string;
  replicaChecksumSHA256?: string;
  replicaErrorMessage?: string;
  errorMessage?: string;
  durationMs: number;
}

export interface BackupStats {
  total: number;
  successCount: number;
  failedCount: number;
  replicaSuccessCount: number;
  lastBackupTime: string | null;
}

export interface BackupSchedulerStatus {
  isScheduled: boolean;
  config: {
    enabled: boolean;
    scheduleTime: string;
    timezone: string;
    checkIntervalMs: number;
  };
  lastRunDate?: string;
  nextScheduledTime?: string;
  currentTimeInTz: {
    time: string;
    date: string;
  };
}

export interface BackupHistoryResponse {
  success: boolean;
  stats: BackupStats;
  scheduler: BackupSchedulerStatus;
  history: BackupRecord[];
}

export interface RestorePostgresPayload {
  backupFilePath: string;
  targetDatabase: string;
  targetNodeId: 'HN' | 'DN' | 'HCM' | 'CENTRAL';
  createDbIfNotExists?: boolean;
}

export interface RestoreMongoPayload {
  backupFilePath: string;
  targetDatabase: string;
}

export interface RestoreResultData {
  success: boolean;
  targetDatabase: string;
  backupFilePath: string;
  durationMs: number;
  tablesRestoredCount?: number;
  collectionsRestoredCount?: number;
  documentsRestoredCount?: number;
  tables?: string[];
  collections?: string[];
  errorMessage?: string;
}

// ==========================================================
// WAREHOUSE SLOTTING & STORAGE BINS TYPES (PHASE 6)
// ==========================================================

export interface SlottingOverviewData {
  ma_kho: string;
  total_bins: number;
  used_bins: number;
  empty_bins: number;
  maintenance_bins: number;
  active_bins: number;
  total_skus: number;
  total_quantity: number;
  total_capacity: number;
  golden_zone_bins: number;
  mid_zone_bins: number;
  top_storage_bins: number;
  occupancy_rate: number;
  space_utilization_rate: number;
}

export interface StorageBinItem {
  ma_vi_tri: string;
  ma_kho: string;
  day_ke: string;
  tang: number;
  ngan: number;
  vung_luu_tru: 'GOLDEN_ZONE' | 'MID_ZONE' | 'TOP_STORAGE';
  suc_chua_toi_da: number;
  trang_thai: 'ACTIVE' | 'MAINTENANCE';
  so_luong_hien_tai: number;
  ty_le_lap_day: number;
  canh_bao_qua_tai: boolean;
  san_pham: {
    ma_sp: string;
    ten_sp: string;
    don_vi_tinh?: string;
    so_luong: number;
    cap_nhat_luc: string;
  } | null;
  vi_tri_cap_nhat_luc?: string;
}

export interface SlottingRecommendationItem {
  ma_sp: string;
  ten_sp: string;
  ma_vi_tri_hien_tai: string;
  vung_hien_tai: string;
  tang_hien_tai: number;
  nhom_abc?: string;
  nhom_xyz?: string;
  nhom_abc_xyz?: string;
  tong_luong_xuat: number;
  so_dong_xuat: number;
  vung_de_xuat: string;
  ly_do_de_xuat: string;
  muc_do_uu_tien: 'CAO' | 'TRUNG_BINH' | 'THAP';
  o_ke_goi_y: string[];
}

export interface SlottingAdvisorData {
  ma_kho: string;
  tong_so_khuyen_nghi: number;
  danh_sach_khuyen_nghi: SlottingRecommendationItem[];
  thong_diep?: string;
}

export interface StorageBinFilters {
  vung_luu_tru?: string;
  trang_thai?: string;
  day_ke?: string;
  tang?: number;
  only_occupied?: boolean;
}

export interface MoveBinPayload {
  ma_kho: string;
  ma_sp: string;
  from_bin: string;
  to_bin: string;
  so_luong: number;
}

