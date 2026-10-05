import { getDbPool } from '../config/postgresql';

export const getMasterDataByNode = async (ma_kho: string) => {
  const pool = getDbPool(ma_kho);
  
  const [sanPhamRes, nccRes, khRes, khoRes] = await Promise.all([
    pool.query(`SELECT ma_sp, ten_sp, don_vi, gia_nhap, gia_ban FROM san_pham WHERE trang_thai = 'ACTIVE'`),
    pool.query(`SELECT ma_ncc, ten_ncc FROM nha_cung_cap`),
    pool.query(`SELECT ma_kh, ten_kh FROM khach_hang`),
    pool.query(`SELECT ma_kho, ten_kho FROM kho WHERE trang_thai = 'ACTIVE'`)
  ]);

  return {
    san_pham: sanPhamRes.rows,
    nha_cung_cap: nccRes.rows,
    khach_hang: khRes.rows,
    danh_sach_kho: khoRes.rows
  };
};