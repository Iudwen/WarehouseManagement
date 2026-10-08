import { Request } from 'express';
import { Pool } from 'pg';

export type UserRole =
  | 'ADMIN'
  | 'DIEU_PHOI'
  | 'DATA_ANALYST'
  | 'QUAN_LY_KHO'
  | 'NHAN_VIEN_KHO';

export interface UserPayload {
  ma_nguoi_dung: string;
  ho_ten: string;
  vai_tro: UserRole;
  ma_kho: string | null;
}

export interface CustomRequest extends Request {
  user?: UserPayload;
  dbPool?: Pool;
  maKhoContext?: string;
}

export interface InventoryItemInput {
  ma_sp: string;
  so_luong: number;
  don_gia: number;
}

export interface ImportPayload {
  ma_phieu_nhap: string;
  ma_kho: string;
  ma_ncc: string;
  items: InventoryItemInput[];
}

export interface ExportPayload {
  ma_phieu_xuat: string;
  ma_kho: string;
  ma_kh: string;
  items: InventoryItemInput[];
}