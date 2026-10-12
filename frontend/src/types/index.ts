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