import { Pool } from 'pg';
import { pools } from '../config/postgresql';

export const getMasterData = async (pool: Pool) => {
  // nha_cung_cap và khach_hang thuộc schema chi nhánh (có trên HN, DN, HCM; không có trên Central)
  const partnerPool = pool === pools.CENTRAL ? pools.HN : pool;

  const [sanPhamRes, nccRes, khRes, khoRes] = await Promise.all([
    pool.query(`
      SELECT
        ma_sp,
        ten_sp,
        don_vi,
        gia_nhap,
        gia_ban
      FROM san_pham
      WHERE trang_thai = 'ACTIVE'
    `),

    partnerPool.query(`
      SELECT
        ma_ncc,
        ten_ncc
      FROM nha_cung_cap
    `),

    partnerPool.query(`
      SELECT
        ma_kh,
        ten_kh
      FROM khach_hang
    `),

    pool.query(`
      SELECT
        ma_kho,
        ten_kho
      FROM kho
      WHERE trang_thai = 'ACTIVE'
    `),
  ]);

  return {
    san_pham: sanPhamRes.rows,
    nha_cung_cap: nccRes.rows,
    khach_hang: khRes.rows,
    danh_sach_kho: khoRes.rows,
  };
};