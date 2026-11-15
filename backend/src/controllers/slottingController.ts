import { Response } from 'express';
import { Pool } from 'pg';
import { CustomRequest } from '../types';
import { getDbPool, pools } from '../config/postgresql';
import {
  getSlottingOverview,
  getStorageBins,
  getStorageBinDetail,
  getSlottingRecommendations,
  moveStorageBin,
  StorageBinFilters,
} from '../services/slottingService';

/**
 * Trợ giúp xác thực quyền truy cập kho theo RBAC:
 * - ADMIN, DIEU_PHOI, DATA_ANALYST: Được truy cập mọi kho (HN01, DN01, HCM01)
 * - QUAN_LY_KHO, NHAN_VIEN_KHO: Chỉ được truy cập đúng kho của mình, cố tình truyền mã kho khác -> 403 Forbidden
 */
const resolveTargetKho = (req: CustomRequest): { targetKho: string; pool: Pool } => {
  const { vai_tro, ma_kho: userMaKho } = req.user || {};
  const centralRoles = ['ADMIN', 'DIEU_PHOI', 'DATA_ANALYST'];

  let requestedKho =
    (req.query?.ma_kho as string) ||
    (req.body?.ma_kho as string) ||
    (req.params?.ma_kho as string) ||
    (req.headers['x-warehouse-id'] as string);

  if (requestedKho) {
    requestedKho = requestedKho.trim().toUpperCase();
  }

  // Nếu là vai trò chi nhánh (QUAN_LY_KHO, NHAN_VIEN_KHO)
  if (!centralRoles.includes(vai_tro as string)) {
    if (!userMaKho) {
      throw { status: 403, message: 'Tài khoản chi nhánh chưa được phân bổ kho làm việc.' };
    }
    const cleanUserKho = userMaKho.trim().toUpperCase();
    if (requestedKho && requestedKho !== cleanUserKho) {
      throw {
        status: 403,
        message: `Bạn không có quyền truy cập dữ liệu của kho ${requestedKho}. Bạn chỉ được phép quản lý kho ${cleanUserKho}.`,
      };
    }
    return { targetKho: cleanUserKho, pool: getDbPool(cleanUserKho) };
  }

  // Vai trò trung tâm (ADMIN, DIEU_PHOI, DATA_ANALYST)
  if (requestedKho && (requestedKho.startsWith('HN') || requestedKho.startsWith('DN') || requestedKho.startsWith('HCM'))) {
    return { targetKho: requestedKho, pool: getDbPool(requestedKho) };
  }

  // Mặc định cho vai trò trung tâm khi không truyền mã kho
  return { targetKho: 'HN01', pool: pools.HN };
};

/**
 * GET /api/v1/slotting/overview
 * Lấy KPI tổng quan ô kệ của kho
 */
export const handleGetSlottingOverview = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { targetKho, pool } = resolveTargetKho(req);
    const data = await getSlottingOverview(pool, targetKho);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Lỗi khi lấy thông tin tổng quan vị trí kho',
    });
  }
};

/**
 * GET /api/v1/slotting/bins
 * Lấy danh sách 45 ô vị trí kệ kèm bộ lọc
 */
export const handleGetStorageBins = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { targetKho, pool } = resolveTargetKho(req);

    const filters: StorageBinFilters = {
      vung_luu_tru: req.query.vung_luu_tru ? String(req.query.vung_luu_tru) : undefined,
      trang_thai: req.query.trang_thai ? String(req.query.trang_thai) : undefined,
      day_ke: req.query.day_ke ? String(req.query.day_ke) : undefined,
      tang: req.query.tang ? Number(req.query.tang) : undefined,
      only_occupied: req.query.only_occupied === 'true',
    };

    const bins = await getStorageBins(pool, targetKho, filters);

    res.status(200).json({
      success: true,
      count: bins.length,
      data: bins,
    });
  } catch (error: any) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Lỗi khi lấy danh sách vị trí ô kệ',
    });
  }
};

/**
 * GET /api/v1/slotting/bins/:maViTri
 * Lấy chi tiết một ô kệ
 */
export const handleGetStorageBinDetail = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { targetKho, pool } = resolveTargetKho(req);
    const { maViTri } = req.params;

    if (!maViTri) {
      res.status(400).json({
        success: false,
        message: 'Mã vị trí không được để trống',
      });
      return;
    }

    const cleanMaViTri = maViTri.trim().toUpperCase();
    const bin = await getStorageBinDetail(pool, targetKho, cleanMaViTri);

    if (!bin) {
      res.status(404).json({
        success: false,
        message: `Không tìm thấy ô vị trí '${cleanMaViTri}' tại kho ${targetKho}.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: bin,
    });
  } catch (error: any) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Lỗi khi lấy thông tin chi tiết ô kệ',
    });
  }
};

/**
 * GET /api/v1/slotting/advisor
 * Lấy phân tích và khuyến nghị bố trí ô kệ
 */
export const handleGetSlottingAdvisor = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { targetKho, pool } = resolveTargetKho(req);
    const advisor = await getSlottingRecommendations(pool, targetKho);

    res.status(200).json({
      success: true,
      data: advisor,
    });
  } catch (error: any) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Lỗi khi phân tích gợi ý tối ưu vị trí kệ hàng',
    });
  }
};

/**
 * POST /api/v1/slotting/move
 * Di chuyển sản phẩm giữa hai ô kệ trong cùng một kho
 */
export const handleMoveStorageBin = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { targetKho, pool } = resolveTargetKho(req);
    const { ma_sp, from_bin, to_bin, so_luong } = req.body;

    if (!ma_sp || !from_bin || !to_bin || so_luong === undefined) {
      res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc: ma_sp, from_bin, to_bin, so_luong.',
      });
      return;
    }

    const qty = Number(so_luong);
    if (isNaN(qty) || qty <= 0) {
      res.status(400).json({
        success: false,
        message: 'Số lượng di chuyển phải là số nguyên dương > 0.',
      });
      return;
    }

    const result = await moveStorageBin(pool, {
      ma_kho: targetKho,
      ma_sp: String(ma_sp).trim().toUpperCase(),
      from_bin: String(from_bin).trim().toUpperCase(),
      to_bin: String(to_bin).trim().toUpperCase(),
      so_luong: qty,
      nguoi_thuc_hien: req.user?.ho_ten || req.user?.ma_nguoi_dung || 'SYSTEM',
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error: any) {
    const status = error.status || 400;
    res.status(status).json({
      success: false,
      message: error.message || 'Lỗi khi thực hiện di chuyển sản phẩm giữa các ô kệ',
    });
  }
};
