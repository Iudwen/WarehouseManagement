import { Pool, PoolClient } from 'pg';
import path from 'path';
import fs from 'fs';

export interface StorageBinFilters {
  vung_luu_tru?: string;
  trang_thai?: string;
  day_ke?: string;
  tang?: number;
  only_occupied?: boolean;
}

export interface SlottingOverviewResult {
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
  vung_luu_tru: string;
  suc_chua_toi_da: number;
  trang_thai: string;
  so_luong_hien_tai: number;
  ty_le_lap_day: number;
  canh_bao_qua_tai: boolean;
  san_pham: {
    ma_sp: string;
    ten_sp: string;
    don_vi_tinh?: string;
    so_luong: number;
    cap_nhat_luc: Date;
  } | null;
  vi_tri_cap_nhat_luc: Date;
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

export interface SlottingAdvisorResult {
  ma_kho: string;
  tong_so_khuyen_nghi: number;
  danh_sach_khuyen_nghi: SlottingRecommendationItem[];
  thong_diep?: string;
}

export interface MoveBinPayload {
  ma_kho: string;
  ma_sp: string;
  from_bin: string;
  to_bin: string;
  so_luong: number;
  nguoi_thuc_hien?: string;
}

/**
 * 3.1. Lấy tổng quan vị trí kho
 */
export const getSlottingOverview = async (
  pool: Pool,
  maKho: string
): Promise<SlottingOverviewResult> => {
  const query = `
    SELECT 
      COUNT(*)::int AS total_bins,
      COUNT(CASE WHEN v.trang_thai = 'MAINTENANCE' THEN 1 END)::int AS maintenance_bins,
      COUNT(CASE WHEN v.trang_thai = 'ACTIVE' AND p.id IS NOT NULL THEN 1 END)::int AS used_bins,
      COUNT(CASE WHEN v.trang_thai = 'ACTIVE' AND p.id IS NULL THEN 1 END)::int AS empty_bins,
      COUNT(CASE WHEN v.vung_luu_tru = 'GOLDEN_ZONE' THEN 1 END)::int AS golden_zone_bins,
      COUNT(CASE WHEN v.vung_luu_tru = 'MID_ZONE' THEN 1 END)::int AS mid_zone_bins,
      COUNT(CASE WHEN v.vung_luu_tru = 'TOP_STORAGE' THEN 1 END)::int AS top_storage_bins,
      COALESCE(SUM(CASE WHEN v.trang_thai = 'ACTIVE' THEN v.suc_chua_toi_da ELSE 0 END), 0)::int AS total_capacity,
      COUNT(DISTINCT p.ma_sp)::int AS total_skus,
      COALESCE(SUM(p.so_luong), 0)::int AS total_quantity
    FROM vi_tri_kho v
    LEFT JOIN phan_bo_o_ke p ON v.ma_kho = p.ma_kho AND v.ma_vi_tri = p.ma_vi_tri
    WHERE v.ma_kho = $1;
  `;

  const result = await pool.query(query, [maKho]);
  const row = result.rows[0];

  const totalBins = Number(row.total_bins) || 0;
  const maintenanceBins = Number(row.maintenance_bins) || 0;
  const activeBins = totalBins - maintenanceBins;
  const usedBins = Number(row.used_bins) || 0;
  const emptyBins = Number(row.empty_bins) || 0;
  const totalCapacity = Number(row.total_capacity) || 0;
  const totalQuantity = Number(row.total_quantity) || 0;

  // Công thức: occupancy_rate = used_bins / active_bins * 100 (không tính MAINTENANCE)
  const occupancyRate = activeBins > 0 ? Number(((usedBins / activeBins) * 100).toFixed(2)) : 0;
  const spaceUtilizationRate = totalCapacity > 0 ? Number(((totalQuantity / totalCapacity) * 100).toFixed(2)) : 0;

  return {
    ma_kho: maKho,
    total_bins: totalBins,
    used_bins: usedBins,
    empty_bins: emptyBins,
    maintenance_bins: maintenanceBins,
    active_bins: activeBins,
    total_skus: Number(row.total_skus) || 0,
    total_quantity: totalQuantity,
    total_capacity: totalCapacity,
    golden_zone_bins: Number(row.golden_zone_bins) || 0,
    mid_zone_bins: Number(row.mid_zone_bins) || 0,
    top_storage_bins: Number(row.top_storage_bins) || 0,
    occupancy_rate: occupancyRate,
    space_utilization_rate: spaceUtilizationRate,
  };
};

/**
 * 3.2. Lấy danh sách Storage Bin kèm bộ lọc
 */
export const getStorageBins = async (
  pool: Pool,
  maKho: string,
  filters?: StorageBinFilters
): Promise<StorageBinItem[]> => {
  const conditions: string[] = ['v.ma_kho = $1'];
  const params: any[] = [maKho];
  let paramIdx = 2;

  if (filters?.vung_luu_tru) {
    conditions.push(`v.vung_luu_tru = $${paramIdx++}`);
    params.push(filters.vung_luu_tru.toUpperCase());
  }

  if (filters?.trang_thai) {
    conditions.push(`v.trang_thai = $${paramIdx++}`);
    params.push(filters.trang_thai.toUpperCase());
  }

  if (filters?.day_ke) {
    conditions.push(`v.day_ke = $${paramIdx++}`);
    params.push(filters.day_ke.toUpperCase());
  }

  if (filters?.tang !== undefined && !isNaN(Number(filters.tang))) {
    conditions.push(`v.tang = $${paramIdx++}`);
    params.push(Number(filters.tang));
  }

  if (filters?.only_occupied) {
    conditions.push(`p.id IS NOT NULL`);
  }

  const query = `
    SELECT 
      v.ma_vi_tri,
      v.ma_kho,
      v.day_ke,
      v.tang,
      v.ngan,
      v.vung_luu_tru,
      v.suc_chua_toi_da,
      v.trang_thai,
      p.cap_nhat_luc AS vi_tri_cap_nhat_luc,
      p.id AS phan_bo_id,
      p.ma_sp,
      sp.ten_sp,
      sp.don_vi AS don_vi_tinh,
      p.so_luong AS so_luong_san_pham,
      p.cap_nhat_luc AS phan_bo_cap_nhat_luc
    FROM vi_tri_kho v
    LEFT JOIN phan_bo_o_ke p ON v.ma_kho = p.ma_kho AND v.ma_vi_tri = p.ma_vi_tri
    LEFT JOIN san_pham sp ON p.ma_sp = sp.ma_sp
    WHERE ${conditions.join(' AND ')}
    ORDER BY v.day_ke ASC, v.tang ASC, v.ngan ASC;
  `;

  const result = await pool.query(query, params);

  return result.rows.map((row) => {
    const qty = row.so_luong_san_pham !== null ? Number(row.so_luong_san_pham) : 0;
    const capacity = Number(row.suc_chua_toi_da) || 0;
    const fillRate = capacity > 0 ? Number(((qty / capacity) * 100).toFixed(2)) : 0;

    return {
      ma_vi_tri: row.ma_vi_tri,
      ma_kho: row.ma_kho,
      day_ke: row.day_ke,
      tang: row.tang,
      ngan: row.ngan,
      vung_luu_tru: row.vung_luu_tru,
      suc_chua_toi_da: capacity,
      trang_thai: row.trang_thai,
      so_luong_hien_tai: qty,
      ty_le_lap_day: fillRate,
      canh_bao_qua_tai: fillRate > 100,
      san_pham: row.ma_sp
        ? {
            ma_sp: row.ma_sp,
            ten_sp: row.ten_sp || row.ma_sp,
            don_vi_tinh: row.don_vi_tinh || 'Cái',
            so_luong: qty,
            cap_nhat_luc: row.phan_bo_cap_nhat_luc,
          }
        : null,
      vi_tri_cap_nhat_luc: row.vi_tri_cap_nhat_luc,
    };
  });
};

/**
 * 3.3. Lấy chi tiết một Storage Bin
 */
export const getStorageBinDetail = async (
  pool: Pool,
  maKho: string,
  maViTri: string
): Promise<StorageBinItem | null> => {
  const query = `
    SELECT 
      v.ma_vi_tri,
      v.ma_kho,
      v.day_ke,
      v.tang,
      v.ngan,
      v.vung_luu_tru,
      v.suc_chua_toi_da,
      v.trang_thai,
      p.cap_nhat_luc AS vi_tri_cap_nhat_luc,
      p.id AS phan_bo_id,
      p.ma_sp,
      sp.ten_sp,
      sp.don_vi AS don_vi_tinh,
      p.so_luong AS so_luong_san_pham,
      p.cap_nhat_luc AS phan_bo_cap_nhat_luc
    FROM vi_tri_kho v
    LEFT JOIN phan_bo_o_ke p ON v.ma_kho = p.ma_kho AND v.ma_vi_tri = p.ma_vi_tri
    LEFT JOIN san_pham sp ON p.ma_sp = sp.ma_sp
    WHERE v.ma_kho = $1 AND v.ma_vi_tri = $2;
  `;

  const result = await pool.query(query, [maKho, maViTri]);
  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const qty = row.so_luong_san_pham !== null ? Number(row.so_luong_san_pham) : 0;
  const capacity = Number(row.suc_chua_toi_da) || 0;
  const fillRate = capacity > 0 ? Number(((qty / capacity) * 100).toFixed(2)) : 0;

  return {
    ma_vi_tri: row.ma_vi_tri,
    ma_kho: row.ma_kho,
    day_ke: row.day_ke,
    tang: row.tang,
    ngan: row.ngan,
    vung_luu_tru: row.vung_luu_tru,
    suc_chua_toi_da: capacity,
    trang_thai: row.trang_thai,
    so_luong_hien_tai: qty,
    ty_le_lap_day: fillRate,
    canh_bao_qua_tai: fillRate > 100,
    san_pham: row.ma_sp
      ? {
          ma_sp: row.ma_sp,
          ten_sp: row.ten_sp || row.ma_sp,
          don_vi_tinh: row.don_vi_tinh || 'Cái',
          so_luong: qty,
          cap_nhat_luc: row.phan_bo_cap_nhat_luc,
        }
      : null,
    vi_tri_cap_nhat_luc: row.vi_tri_cap_nhat_luc,
  };
};

/**
 * Đọc dữ liệu ABC-XYZ đã phân tích từ Gold Data Lake (nếu có)
 */
const loadAbcXyzData = (maKho: string): Record<string, any> => {
  const basePaths = [
    path.resolve(process.cwd(), `data_center/data_lake/gold/abc_xyz_analysis_${maKho.toUpperCase()}.json`),
    path.resolve(process.cwd(), `../data_center/data_lake/gold/abc_xyz_analysis_${maKho.toUpperCase()}.json`),
    path.resolve(process.cwd(), `data_center/data_lake/gold/abc_xyz_analysis.json`),
  ];

  for (const p of basePaths) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const json = JSON.parse(raw);
        if (Array.isArray(json.items)) {
          const map: Record<string, any> = {};
          for (const item of json.items) {
            map[item.ma_sp] = item;
          }
          return map;
        }
      } catch (err) {
        // Fallback sang PostgreSQL
      }
    }
  }
  return {};
};

/**
 * 3.4. Slotting Advisor - Phát hiện sản phẩm bố trí chưa phù hợp & Gợi ý tối ưu
 */
export const getSlottingRecommendations = async (
  pool: Pool,
  maKho: string
): Promise<SlottingAdvisorResult> => {
  // 1. Lấy danh sách sản phẩm đang lưu trữ trong ô kệ
  const allocatedQuery = `
    SELECT 
      p.ma_sp,
      sp.ten_sp,
      p.so_luong,
      v.ma_vi_tri,
      v.vung_luu_tru,
      v.day_ke,
      v.tang,
      v.ngan,
      v.suc_chua_toi_da
    FROM phan_bo_o_ke p
    JOIN vi_tri_kho v ON p.ma_kho = v.ma_kho AND p.ma_vi_tri = v.ma_vi_tri
    JOIN san_pham sp ON p.ma_sp = sp.ma_sp
    WHERE p.ma_kho = $1;
  `;
  const allocatedRes = await pool.query(allocatedQuery, [maKho]);

  // 2. Lấy số liệu xuất kho thực tế từ PostgreSQL ct_phieu_xuat
  const outboundQuery = `
    SELECT 
      ctx.ma_sp,
      COUNT(DISTINCT px.ma_phieu_xuat) AS so_phieu_xuat,
      COUNT(*) AS so_dong_xuat,
      COALESCE(SUM(ctx.so_luong), 0)::int AS tong_luong_xuat
    FROM ct_phieu_xuat ctx
    JOIN phieu_xuat px ON ctx.ma_phieu_xuat = px.ma_phieu_xuat
    WHERE px.ma_kho = $1 AND px.trang_thai = 'DA_XUAT'
    GROUP BY ctx.ma_sp;
  `;
  const outboundRes = await pool.query(outboundQuery, [maKho]);
  const outboundMap: Record<string, { so_dong_xuat: number; tong_luong_xuat: number; so_phieu_xuat: number }> = {};
  for (const r of outboundRes.rows) {
    outboundMap[r.ma_sp] = {
      so_dong_xuat: Number(r.so_dong_xuat) || 0,
      tong_luong_xuat: Number(r.tong_luong_xuat) || 0,
      so_phieu_xuat: Number(r.so_phieu_xuat) || 0,
    };
  }

  // 3. Đọc dữ liệu phân loại ABC-XYZ từ data lake
  const abcMap = loadAbcXyzData(maKho);

  // 4. Lấy danh sách các ô kệ trống ACTIVE theo từng vùng để gợi ý
  const emptyBinsQuery = `
    SELECT ma_vi_tri, vung_luu_tru, suc_chua_toi_da
    FROM vi_tri_kho
    WHERE ma_kho = $1 AND trang_thai = 'ACTIVE'
      AND ma_vi_tri NOT IN (SELECT ma_vi_tri FROM phan_bo_o_ke WHERE ma_kho = $1)
    ORDER BY day_ke ASC, tang ASC, ngan ASC;
  `;
  const emptyBinsRes = await pool.query(emptyBinsQuery, [maKho]);
  const emptyBinsByZone: Record<string, Array<{ ma_vi_tri: string; suc_chua_toi_da: number }>> = {
    GOLDEN_ZONE: [],
    MID_ZONE: [],
    TOP_STORAGE: [],
  };
  for (const eb of emptyBinsRes.rows) {
    if (emptyBinsByZone[eb.vung_luu_tru]) {
      emptyBinsByZone[eb.vung_luu_tru].push({
        ma_vi_tri: eb.ma_vi_tri,
        suc_chua_toi_da: Number(eb.suc_chua_toi_da),
      });
    }
  }

  // 5. Đánh giá và sinh khuyến nghị
  const recommendations: SlottingRecommendationItem[] = [];

  for (const row of allocatedRes.rows) {
    const maSp = row.ma_sp;
    const tenSp = row.ten_sp;
    const currentZone = row.vung_luu_tru;
    const currentBin = row.ma_vi_tri;
    const currentLevel = row.tang;
    const currentQty = Number(row.so_luong);

    const outData = outboundMap[maSp] || { so_dong_xuat: 0, tong_luong_xuat: 0, so_phieu_xuat: 0 };
    const abcData = abcMap[maSp];

    const nhomAbc = abcData?.nhom_abc || (outData.tong_luong_xuat > 5000 ? 'A' : outData.tong_luong_xuat > 2000 ? 'B' : 'C');
    const nhomXyz = abcData?.nhom_xyz;
    const nhomAbcXyz = abcData?.nhom_abc_xyz || (nhomXyz ? `${nhomAbc}${nhomXyz}` : nhomAbc);

    // Kịch bản 1: Hàng luân chuyển cao (Nhóm A / sản lượng xuất cao) nằm ở TOP_STORAGE
    if (nhomAbc === 'A' && currentZone === 'TOP_STORAGE') {
      const candidates = emptyBinsByZone['GOLDEN_ZONE']
        .filter((b) => b.suc_chua_toi_da >= currentQty)
        .map((b) => b.ma_vi_tri);

      const warningText = candidates.length === 0
        ? ' (Cảnh báo: Hiện chưa có ô trống đủ sức chứa trong Golden Zone; cần dọn chỗ hoặc hoán đổi vị trí trước).'
        : '';

      recommendations.push({
        ma_sp: maSp,
        ten_sp: tenSp,
        ma_vi_tri_hien_tai: currentBin,
        vung_hien_tai: currentZone,
        tang_hien_tai: currentLevel,
        nhom_abc: nhomAbc,
        nhom_xyz: nhomXyz,
        nhom_abc_xyz: nhomAbcXyz,
        tong_luong_xuat: outData.tong_luong_xuat,
        so_dong_xuat: outData.so_dong_xuat,
        vung_de_xuat: 'GOLDEN_ZONE',
        ly_do_de_xuat: `Sản phẩm luân chuyển cao (Nhóm ${nhomAbc}, ${outData.tong_luong_xuat} units xuất qua ${outData.so_dong_xuat} dòng phiếu) nhưng đang lưu trữ tại tầng cao (Top Storage - Tầng ${currentLevel}), làm tăng thời gian bốc dỡ và xe nâng di chuyển. Đề xuất dời xuống Golden Zone (Tầng 1-2).${warningText}`,
        muc_do_uu_tien: 'CAO',
        o_ke_goi_y: candidates.slice(0, 3),
      });
    }

    // Kịch bản 2: Hàng luân chuyển thấp (Nhóm C) chiếm vị trí đắc địa GOLDEN_ZONE
    else if (nhomAbc === 'C' && currentZone === 'GOLDEN_ZONE') {
      const targetZone = emptyBinsByZone['MID_ZONE'].length > 0 ? 'MID_ZONE' : 'TOP_STORAGE';
      const candidates = (emptyBinsByZone[targetZone] || emptyBinsByZone['MID_ZONE'])
        .filter((b) => b.suc_chua_toi_da >= currentQty)
        .map((b) => b.ma_vi_tri);

      const warningText = candidates.length === 0
        ? ' (Cảnh báo: Hiện chưa có ô trống đủ sức chứa trong Mid Zone; cần dọn chỗ hoặc hoán đổi vị trí trước).'
        : '';

      recommendations.push({
        ma_sp: maSp,
        ten_sp: tenSp,
        ma_vi_tri_hien_tai: currentBin,
        vung_hien_tai: currentZone,
        tang_hien_tai: currentLevel,
        nhom_abc: nhomAbc,
        nhom_xyz: nhomXyz,
        nhom_abc_xyz: nhomAbcXyz,
        tong_luong_xuat: outData.tong_luong_xuat,
        so_dong_xuat: outData.so_dong_xuat,
        vung_de_xuat: targetZone,
        ly_do_de_xuat: `Sản phẩm luân chuyển chậm (Nhóm ${nhomAbc}, chỉ ${outData.tong_luong_xuat} units xuất qua ${outData.so_dong_xuat} dòng phiếu) đang chiếm dụng vị trí đắc địa Golden Zone (Tầng ${currentLevel}). Đề xuất chuyển sang ${targetZone} để nhường vị trí lấy hàng nhanh cho mặt hàng chủ lực.${warningText}`,
        muc_do_uu_tien: 'TRUNG_BINH',
        o_ke_goi_y: candidates.slice(0, 3),
      });
    }
  }

  // Sắp xếp mức độ ưu tiên CAO trước
  recommendations.sort((a, b) => {
    const pOrder: Record<string, number> = { CAO: 1, TRUNG_BINH: 2, THAP: 3 };
    return (pOrder[a.muc_do_uu_tien] || 99) - (pOrder[b.muc_do_uu_tien] || 99);
  });

  return {
    ma_kho: maKho,
    tong_so_khuyen_nghi: recommendations.length,
    danh_sach_khuyen_nghi: recommendations,
    thong_diep: recommendations.length > 0
      ? `Phát hiện ${recommendations.length} mặt hàng bố trí chưa tối ưu về mặt luân chuyển và tốc độ lấy hàng.`
      : 'Bố trí kho hiện tại đã tối ưu phù hợp với phân loại ABC-XYZ và tốc độ xuất hàng.',
  };
};

/**
 * 6. API Điều chỉnh vị trí (Move Bin) trong cùng một kho
 * Duy trì tuyệt đối tôn chỉ: sum(phan_bo_o_ke) = ton_kho, không làm thay đổi tổng tồn kho.
 */
export const moveStorageBin = async (
  pool: Pool,
  payload: MoveBinInput
): Promise<{
  ma_kho: string;
  ma_sp: string;
  from_bin: string;
  to_bin: string;
  so_luong: number;
  message: string;
}> => {
  const { ma_kho, ma_sp, from_bin, to_bin, so_luong, nguoi_thuc_hien } = payload;

  if (from_bin === to_bin) {
    throw new Error('Ô đích phải khác ô nguồn.');
  }

  if (so_luong <= 0) {
    throw new Error('Số lượng di chuyển phải lớn hơn 0.');
  }

  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Kiểm tra ô nguồn tồn tại và ACTIVE
    const fromBinRes = await client.query(
      `SELECT ma_vi_tri, trang_thai FROM vi_tri_kho WHERE ma_kho = $1 AND ma_vi_tri = $2`,
      [ma_kho, from_bin]
    );
    if (fromBinRes.rows.length === 0) {
      throw new Error(`Ô nguồn ${from_bin} không tồn tại trong kho ${ma_kho}.`);
    }
    if (fromBinRes.rows[0].trang_thai === 'MAINTENANCE') {
      throw new Error(`Ô nguồn ${from_bin} đang ở trạng thái bảo trì (MAINTENANCE).`);
    }

    // 2. Kiểm tra ô đích tồn tại, ACTIVE và sức chứa
    const toBinRes = await client.query(
      `SELECT ma_vi_tri, trang_thai, suc_chua_toi_da FROM vi_tri_kho WHERE ma_kho = $1 AND ma_vi_tri = $2`,
      [ma_kho, to_bin]
    );
    if (toBinRes.rows.length === 0) {
      throw new Error(`Ô đích ${to_bin} không tồn tại trong kho ${ma_kho}.`);
    }
    if (toBinRes.rows[0].trang_thai === 'MAINTENANCE') {
      throw new Error(`Ô đích ${to_bin} đang ở trạng thái bảo trì (MAINTENANCE), không thể chuyển hàng tới.`);
    }
    const toCapacity = Number(toBinRes.rows[0].suc_chua_toi_da);

    // 3. Khóa và kiểm tra ô nguồn trong phan_bo_o_ke
    const allocSourceRes = await client.query(
      `SELECT id, so_luong FROM phan_bo_o_ke WHERE ma_kho = $1 AND ma_vi_tri = $2 AND ma_sp = $3 FOR UPDATE`,
      [ma_kho, from_bin, ma_sp]
    );
    if (allocSourceRes.rows.length === 0) {
      throw new Error(`Sản phẩm ${ma_sp} không tồn tại trong ô nguồn ${from_bin}.`);
    }
    const currentSourceQty = Number(allocSourceRes.rows[0].so_luong);
    if (currentSourceQty < so_luong) {
      throw new Error(`Số lượng trong ô nguồn (${currentSourceQty}) không đủ để di chuyển (${so_luong}).`);
    }

    // 4. Kiểm tra ô đích xem có sản phẩm khác không
    const allocDestRes = await client.query(
      `SELECT id, ma_sp, so_luong FROM phan_bo_o_ke WHERE ma_kho = $1 AND ma_vi_tri = $2 FOR UPDATE`,
      [ma_kho, to_bin]
    );
    if (allocDestRes.rows.length > 0 && allocDestRes.rows[0].ma_sp !== ma_sp) {
      throw new Error(`Ô đích ${to_bin} đã chứa sản phẩm khác (${allocDestRes.rows[0].ma_sp}).`);
    }

    // Vì ràng buộc UNIQUE (ma_kho, ma_sp) yêu cầu mỗi SKU chỉ ở 1 ô duy nhất,
    // nên chuyển vị trí phải chuyển trọn vẹn số lượng hiện có của SKU
    if (so_luong < currentSourceQty) {
      throw new Error(
        `Hệ thống đang áp dụng ràng buộc Single-Bin per SKU. Vui lòng di chuyển toàn bộ ${currentSourceQty} đơn vị của sản phẩm ${ma_sp}.`
      );
    }

    if (so_luong > toCapacity) {
      throw new Error(`Số lượng di chuyển (${so_luong}) vượt quá sức chứa tối đa của ô đích ${to_bin} (${toCapacity}).`);
    }

    // 5. Thực hiện dịch chuyển ô
    await client.query(
      `
      UPDATE phan_bo_o_ke
      SET ma_vi_tri = $1, cap_nhat_luc = NOW()
      WHERE ma_kho = $2 AND ma_vi_tri = $3 AND ma_sp = $4
      `,
      [to_bin, ma_kho, from_bin, ma_sp]
    );

    // 6. Ghi nhật ký dịch chuyển (nếu có bảng audit hoặc MongoDB)
    try {
      // Ghi chú nhật ký hoạt động
      console.log(`[SLOTTING MOVE] ${ma_kho}: Di chuyển ${so_luong} SP ${ma_sp} từ ${from_bin} sang ${to_bin} bởi ${nguoi_thuc_hien || 'SYSTEM'}`);
    } catch (e) {
      // Ignored
    }

    await client.query('COMMIT');

    return {
      ma_kho,
      ma_sp,
      from_bin,
      to_bin,
      so_luong,
      message: `Đã di chuyển thành công ${so_luong} sản phẩm ${ma_sp} từ ${from_bin} sang ${to_bin}.`,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export interface MoveBinInput {
  ma_kho: string;
  ma_sp: string;
  from_bin: string;
  to_bin: string;
  so_luong: number;
  nguoi_thuc_hien?: string;
}
