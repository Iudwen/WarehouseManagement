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
  items: Array<{
    ma_sp: string;
    so_luong: number;
  }>;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  message?: string;
  data?: T;
}