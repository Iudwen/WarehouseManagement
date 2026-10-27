import { Pool } from 'pg';

export const getStockByNode = async (pool: Pool) => {
  const result = await pool.query(`
    SELECT
      t.ma_kho,
      k.ten_kho,
      t.ma_sp,
      sp.ten_sp,
      t.so_luong,
      t.cap_nhat_luc
    FROM ton_kho t
    JOIN san_pham sp
      ON t.ma_sp = sp.ma_sp
    JOIN kho k
      ON t.ma_kho = k.ma_kho
  `);

  return result.rows;
};

/**
 * Đếm số lượng đơn nhập và xuất đang chờ xử lý thực tế tại Node
 * (thay thế giá trị hard-code 12 và 8 trên Dashboard)
 */
export const getPendingReceiptCounts = async (pool: Pool) => {
  const [resImport, resExport] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM phieu_nhap
      WHERE trang_thai IN ('CHO_DUYET', 'DA_DUYET', 'THIEU_HANG', 'CHO_GIAO_BO_SUNG')
    `),
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM phieu_xuat
      WHERE trang_thai IN ('CHO_DUYET', 'DA_DUYET')
    `),
  ]);

  return {
    pendingImports: Number(resImport.rows[0]?.count || 0),
    pendingExports: Number(resExport.rows[0]?.count || 0),
  };
};

/**
 * Lấy các chỉ số KPI tổng hợp nhập - xuất tại 1 Node Database
 * (Hôm nay, Tháng này, và trong khoảng lọc tùy chọn)
 */
export const getNodeIOKpi = async (
  pool: Pool,
  fromDate?: string,
  toDate?: string
) => {
  const importParams: any[] = [];
  let importWhere = `WHERE pn.trang_thai IN ('DA_NHAP', 'HOAN_THANH')`;
  if (fromDate) {
    importParams.push(fromDate);
    importWhere += ` AND pn.ngay_nhap::date >= $${importParams.length}`;
  }
  if (toDate) {
    importParams.push(toDate);
    importWhere += ` AND pn.ngay_nhap::date <= $${importParams.length}`;
  }

  const exportParams: any[] = [];
  let exportWhere = `WHERE px.trang_thai IN ('DA_XUAT', 'HOAN_THANH')`;
  if (fromDate) {
    exportParams.push(fromDate);
    exportWhere += ` AND px.ngay_xuat::date >= $${exportParams.length}`;
  }
  if (toDate) {
    exportParams.push(toDate);
    exportWhere += ` AND px.ngay_xuat::date <= $${exportParams.length}`;
  }

  const [resImportKpi, resExportKpi, resImportRange, resExportRange] = await Promise.all([
    pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN pn.ngay_nhap::date = CURRENT_DATE THEN ct.so_luong ELSE 0 END), 0)::bigint AS tong_nhap_hom_nay,
        COUNT(DISTINCT CASE WHEN pn.ngay_nhap::date = CURRENT_DATE THEN pn.ma_phieu_nhap ELSE NULL END)::int AS so_phieu_nhap_hom_nay,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', pn.ngay_nhap) = DATE_TRUNC('month', CURRENT_DATE) THEN ct.so_luong ELSE 0 END), 0)::bigint AS tong_nhap_thang_nay,
        COUNT(DISTINCT CASE WHEN DATE_TRUNC('month', pn.ngay_nhap) = DATE_TRUNC('month', CURRENT_DATE) THEN pn.ma_phieu_nhap ELSE NULL END)::int AS so_phieu_nhap_thang_nay
      FROM phieu_nhap pn
      JOIN ct_phieu_nhap ct ON pn.ma_phieu_nhap = ct.ma_phieu_nhap
      WHERE pn.trang_thai IN ('DA_NHAP', 'HOAN_THANH')
    `),
    pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN px.ngay_xuat::date = CURRENT_DATE THEN ct.so_luong ELSE 0 END), 0)::bigint AS tong_xuat_hom_nay,
        COUNT(DISTINCT CASE WHEN px.ngay_xuat::date = CURRENT_DATE THEN px.ma_phieu_xuat ELSE NULL END)::int AS so_phieu_xuat_hom_nay,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', px.ngay_xuat) = DATE_TRUNC('month', CURRENT_DATE) THEN ct.so_luong ELSE 0 END), 0)::bigint AS tong_xuat_thang_nay,
        COUNT(DISTINCT CASE WHEN DATE_TRUNC('month', px.ngay_xuat) = DATE_TRUNC('month', CURRENT_DATE) THEN px.ma_phieu_xuat ELSE NULL END)::int AS so_phieu_xuat_thang_nay
      FROM phieu_xuat px
      JOIN ct_phieu_xuat ct ON px.ma_phieu_xuat = ct.ma_phieu_xuat
      WHERE px.trang_thai IN ('DA_XUAT', 'HOAN_THANH')
    `),
    pool.query(`
      SELECT
        COALESCE(SUM(ct.so_luong), 0)::bigint AS tong_so_luong,
        COUNT(DISTINCT pn.ma_phieu_nhap)::int AS so_phieu
      FROM phieu_nhap pn
      JOIN ct_phieu_nhap ct ON pn.ma_phieu_nhap = ct.ma_phieu_nhap
      ${importWhere}
    `, importParams),
    pool.query(`
      SELECT
        COALESCE(SUM(ct.so_luong), 0)::bigint AS tong_so_luong,
        COUNT(DISTINCT px.ma_phieu_xuat)::int AS so_phieu
      FROM phieu_xuat px
      JOIN ct_phieu_xuat ct ON px.ma_phieu_xuat = ct.ma_phieu_xuat
      ${exportWhere}
    `, exportParams),
  ]);

  return {
    tong_nhap_hom_nay: Number(resImportKpi.rows[0]?.tong_nhap_hom_nay || 0),
    so_phieu_nhap_hom_nay: Number(resImportKpi.rows[0]?.so_phieu_nhap_hom_nay || 0),
    tong_nhap_thang_nay: Number(resImportKpi.rows[0]?.tong_nhap_thang_nay || 0),
    so_phieu_nhap_thang_nay: Number(resImportKpi.rows[0]?.so_phieu_nhap_thang_nay || 0),
    tong_xuat_hom_nay: Number(resExportKpi.rows[0]?.tong_xuat_hom_nay || 0),
    so_phieu_xuat_hom_nay: Number(resExportKpi.rows[0]?.so_phieu_xuat_hom_nay || 0),
    tong_xuat_thang_nay: Number(resExportKpi.rows[0]?.tong_xuat_thang_nay || 0),
    so_phieu_xuat_thang_nay: Number(resExportKpi.rows[0]?.so_phieu_xuat_thang_nay || 0),
    tong_nhap_khoang_loc: Number(resImportRange.rows[0]?.tong_so_luong || 0),
    so_phieu_nhap_khoang_loc: Number(resImportRange.rows[0]?.so_phieu || 0),
    tong_xuat_khoang_loc: Number(resExportRange.rows[0]?.tong_so_luong || 0),
    so_phieu_xuat_khoang_loc: Number(resExportRange.rows[0]?.so_phieu || 0),
  };
};

/**
 * Lấy chuỗi thời gian nhập - xuất gom nhóm theo Ngày hoặc Tháng
 */
export const getNodeIOTimeline = async (
  pool: Pool,
  fromDate?: string,
  toDate?: string,
  granularity: 'day' | 'month' = 'day'
) => {
  const dateFormat = granularity === 'month' ? `TO_CHAR(pn.ngay_nhap, 'YYYY-MM')` : `pn.ngay_nhap::date::text`;
  const exportDateFormat = granularity === 'month' ? `TO_CHAR(px.ngay_xuat, 'YYYY-MM')` : `px.ngay_xuat::date::text`;

  const importParams: any[] = [];
  let importWhere = `WHERE pn.trang_thai IN ('DA_NHAP', 'HOAN_THANH')`;
  if (fromDate) {
    importParams.push(fromDate);
    importWhere += ` AND pn.ngay_nhap::date >= $${importParams.length}`;
  }
  if (toDate) {
    importParams.push(toDate);
    importWhere += ` AND pn.ngay_nhap::date <= $${importParams.length}`;
  }

  const exportParams: any[] = [];
  let exportWhere = `WHERE px.trang_thai IN ('DA_XUAT', 'HOAN_THANH')`;
  if (fromDate) {
    exportParams.push(fromDate);
    exportWhere += ` AND px.ngay_xuat::date >= $${exportParams.length}`;
  }
  if (toDate) {
    exportParams.push(toDate);
    exportWhere += ` AND px.ngay_xuat::date <= $${exportParams.length}`;
  }

  const [resImport, resExport] = await Promise.all([
    pool.query(`
      SELECT
        ${dateFormat} AS moc_thoi_gian,
        COALESCE(SUM(ct.so_luong), 0)::bigint AS so_luong_nhap,
        COUNT(DISTINCT pn.ma_phieu_nhap)::int AS so_phieu_nhap
      FROM phieu_nhap pn
      JOIN ct_phieu_nhap ct ON pn.ma_phieu_nhap = ct.ma_phieu_nhap
      ${importWhere}
      GROUP BY ${dateFormat}
      ORDER BY moc_thoi_gian
    `, importParams),
    pool.query(`
      SELECT
        ${exportDateFormat} AS moc_thoi_gian,
        COALESCE(SUM(ct.so_luong), 0)::bigint AS so_luong_xuat,
        COUNT(DISTINCT px.ma_phieu_xuat)::int AS so_phieu_xuat
      FROM phieu_xuat px
      JOIN ct_phieu_xuat ct ON px.ma_phieu_xuat = ct.ma_phieu_xuat
      ${exportWhere}
      GROUP BY ${exportDateFormat}
      ORDER BY moc_thoi_gian
    `, exportParams),
  ]);

  return {
    imports: resImport.rows.map((r: any) => ({
      moc_thoi_gian: r.moc_thoi_gian,
      so_luong_nhap: Number(r.so_luong_nhap),
      so_phieu_nhap: Number(r.so_phieu_nhap),
    })),
    exports: resExport.rows.map((r: any) => ({
      moc_thoi_gian: r.moc_thoi_gian,
      so_luong_xuat: Number(r.so_luong_xuat),
      so_phieu_xuat: Number(r.so_phieu_xuat),
    })),
  };
};

/**
 * Top sản phẩm nhập & xuất nhiều nhất tại Node
 */
export const getNodeTopProducts = async (
  pool: Pool,
  fromDate?: string,
  toDate?: string
) => {
  const importParams: any[] = [];
  let importWhere = `WHERE pn.trang_thai IN ('DA_NHAP', 'HOAN_THANH')`;
  if (fromDate) {
    importParams.push(fromDate);
    importWhere += ` AND pn.ngay_nhap::date >= $${importParams.length}`;
  }
  if (toDate) {
    importParams.push(toDate);
    importWhere += ` AND pn.ngay_nhap::date <= $${importParams.length}`;
  }

  const exportParams: any[] = [];
  let exportWhere = `WHERE px.trang_thai IN ('DA_XUAT', 'HOAN_THANH')`;
  if (fromDate) {
    exportParams.push(fromDate);
    exportWhere += ` AND px.ngay_xuat::date >= $${exportParams.length}`;
  }
  if (toDate) {
    exportParams.push(toDate);
    exportWhere += ` AND px.ngay_xuat::date <= $${exportParams.length}`;
  }

  const [resImport, resExport] = await Promise.all([
    pool.query(`
      SELECT
        ct.ma_sp,
        COALESCE(sp.ten_sp, ct.ma_sp) AS ten_sp,
        COALESCE(sp.don_vi, 'Cái') AS don_vi,
        SUM(ct.so_luong)::bigint AS so_luong,
        COUNT(DISTINCT pn.ma_phieu_nhap)::int AS so_phieu
      FROM phieu_nhap pn
      JOIN ct_phieu_nhap ct ON pn.ma_phieu_nhap = ct.ma_phieu_nhap
      LEFT JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
      ${importWhere}
      GROUP BY ct.ma_sp, sp.ten_sp, sp.don_vi
      ORDER BY so_luong DESC
      LIMIT 5
    `, importParams),
    pool.query(`
      SELECT
        ct.ma_sp,
        COALESCE(sp.ten_sp, ct.ma_sp) AS ten_sp,
        COALESCE(sp.don_vi, 'Cái') AS don_vi,
        SUM(ct.so_luong)::bigint AS so_luong,
        COUNT(DISTINCT px.ma_phieu_xuat)::int AS so_phieu
      FROM phieu_xuat px
      JOIN ct_phieu_xuat ct ON px.ma_phieu_xuat = ct.ma_phieu_xuat
      LEFT JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
      ${exportWhere}
      GROUP BY ct.ma_sp, sp.ten_sp, sp.don_vi
      ORDER BY so_luong DESC
      LIMIT 5
    `, exportParams),
  ]);

  return {
    most_imported: resImport.rows.map((r: any) => ({
      ma_sp: r.ma_sp,
      ten_sp: r.ten_sp,
      don_vi: r.don_vi,
      so_luong: Number(r.so_luong),
      so_phieu: Number(r.so_phieu),
    })),
    most_exported: resExport.rows.map((r: any) => ({
      ma_sp: r.ma_sp,
      ten_sp: r.ten_sp,
      don_vi: r.don_vi,
      so_luong: Number(r.so_luong),
      so_phieu: Number(r.so_phieu),
    })),
  };
};