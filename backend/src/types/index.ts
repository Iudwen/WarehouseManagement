import { Request } from 'express';
import { Pool } from 'pg';

export interface UserPayload {
  ma_nguoi_dung: string;
  email: string;
  ho_ten: string;
  vai_tro: 'ADMIN' | 'MANAGER' | 'STAFF' | 'DIEU_PHOI' | 'DATA_ANALYST';
  ma_kho: string | null; // NULL đối với tài khoản ADMIN quản lý toàn quốc
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
  ma_phieu_nhap?: string; // Optional: Backend tự sinh mã tự tăng nếu Client không truyền
  ma_kho: string;
  ma_ncc: string;
  items: InventoryItemInput[];
}

export interface ExportPayload {
  ma_phieu_xuat?: string; // Optional: Backend tự sinh mã tự tăng nếu Client không truyền
  ma_kho: string;
  ma_kh: string;
  items: InventoryItemInput[];
}