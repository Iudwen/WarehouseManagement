import { Response } from 'express';
import { Pool } from 'pg';
import { CustomRequest } from '../types';
import { getDbPool, pools } from '../config/postgresql';
import {
  createImportRequest,
  approveImportRequest,
  rejectImportRequest,
  confirmImportReceiving,
  acceptImportShortage,
  requestImportSupplement,
  listImportReceipts,
  listExportReceipts,
  createExportRequest,
  approveExportRequest,
  rejectExportRequest,
  confirmExportShipment,
} from '../services/inventoryService';

/**
 * Trợ giúp phân giải Database Connection Pool cho các bảng nghiệp vụ chi nhánh
 * (phieu_nhap, phieu_xuat, ton_kho, stock_ledger chỉ tồn tại ở các Node, không có ở Central)
 */
const getBranchPool = (req: CustomRequest, fallbackKhoOrCode?: string): Pool => {
  if (fallbackKhoOrCode) {
    const match = fallbackKhoOrCode.match(/^(?:PN|PX|DC)_([A-Za-z0-9]+)_/i);
    const kho = match ? match[1] : fallbackKhoOrCode;
    if (kho && kho.toUpperCase() !== 'CENTRAL') {
      return getDbPool(kho);
    }
  }

  if (req.dbPool && req.dbPool !== pools.CENTRAL) {
    return req.dbPool;
  }

  const maKhoFromReq =
    (req.query?.ma_kho as string) ||
    (req.body?.ma_kho as string) ||
    (req.headers['x-warehouse-id'] as string);

  if (maKhoFromReq && maKhoFromReq.toUpperCase() !== 'CENTRAL') {
    return getDbPool(maKhoFromReq);
  }

  if (req.user?.ma_kho && req.user.ma_kho.toUpperCase() !== 'CENTRAL') {
    return getDbPool(req.user.ma_kho);
  }

  return pools.HN;
};

// ============================================================================
// HANDLERS CHO LUỒNG NHẬP KHO
// ============================================================================

/**
 * Lấy danh sách phiếu nhập kho (Hỗ trợ lọc theo trạng thái và mã kho)
 */
export const handleListImports = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { vai_tro, ma_kho: userMaKho } = req.user || {};
    const centralRoles = ['ADMIN', 'DIEU_PHOI', 'DATA_ANALYST'];

    // Quyền truy cập kho: Nếu là role chi nhánh, chỉ được xem kho của mình
    let targetKho: string | undefined;
    if (centralRoles.includes(vai_tro as string)) {
      targetKho = (req.query.ma_kho as string) || undefined;
    } else {
      targetKho = userMaKho || req.maKhoContext || 'HN01';
    }

    const trangThai = (req.query.trang_thai as string) || undefined;
    const pool = getBranchPool(req, targetKho);

    const data = await listImportReceipts(pool, targetKho, trangThai);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi lấy danh sách phiếu nhập kho' });
  }
};

/**
 * Tạo yêu cầu nhập kho (Nhân viên kho) -> Trạng thái CHO_DUYET
 */
export const handleImport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const targetKho = req.body?.ma_kho || req.maKhoContext || 'HN01';
    const pool = getBranchPool(req, targetKho);

    const payload = {
      ...req.body,
      ma_kho: targetKho,
    };

    const result = await createImportRequest(pool, payload);
    res.status(201).json({ message: 'Tạo yêu cầu nhập kho thành công (Chờ duyệt)', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi xử lý nhập kho' });
  }
};

/**
 * Duyệt yêu cầu nhập kho (Quản lý kho) -> Trạng thái DA_DUYET
 */
export const handleApproveImport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { maPhieu } = req.params;
    const pool = getBranchPool(req, maPhieu);
    const adjustedItems = req.body?.items;

    const result = await approveImportRequest(pool, maPhieu, adjustedItems);
    res.status(200).json({ message: 'Duyệt phiếu nhập kho thành công', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi duyệt phiếu nhập kho' });
  }
};

/**
 * Từ chối yêu cầu nhập kho (Quản lý kho) -> Trạng thái TU_CHOI
 */
export const handleRejectImport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { maPhieu } = req.params;
    const pool = getBranchPool(req, maPhieu);
    const { ly_do } = req.body || {};

    const result = await rejectImportRequest(pool, maPhieu, ly_do);
    res.status(200).json({ message: 'Từ chối phiếu nhập kho thành công', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi từ chối phiếu nhập kho' });
  }
};

/**
 * Tiếp nhận & Kiểm đếm thực tế (Nhân viên kho) -> Trừ/Tăng kho đợt này, ghi ledger
 * - Nếu nhận đủ: DA_NHAP (Hoàn tất)
 * - Nếu nhận thiếu: THIEU_HANG (Chuyển Quản lý xử lý)
 */
export const handleConfirmImportReceiving = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { maPhieu } = req.params;
    const pool = getBranchPool(req, maPhieu);
    const nguoiThucHien = req.user?.ho_ten || req.user?.ma_nguoi_dung || 'NHAN_VIEN_KHO';
    const receivedItems = req.body?.items;

    const result = await confirmImportReceiving(pool, maPhieu, nguoiThucHien, receivedItems);
    res.status(200).json({
      message: result.has_shortage
        ? 'Phát hiện thiếu hàng khi kiểm đếm. Đã ghi nhận đợt này và chuyển Quản lý xử lý chênh lệch.'
        : 'Xác nhận kiểm đếm nhập kho thành công (Đủ 100%).',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi kiểm đếm nhập kho' });
  }
};

/**
 * Quản lý xử lý chênh lệch (Nhánh A): Chấp nhận thiếu hàng -> Hoàn tất DA_NHAP
 */
export const handleAcceptImportShortage = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { maPhieu } = req.params;
    const pool = getBranchPool(req, maPhieu);
    const { ly_do } = req.body || {};

    const result = await acceptImportShortage(pool, maPhieu, ly_do);
    res.status(200).json({
      message: 'Đã chấp nhận số lượng thiếu hàng và chốt phiếu nhập kho hoàn tất.',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi chấp nhận thiếu hàng' });
  }
};

/**
 * Quản lý xử lý chênh lệch (Nhánh B): Yêu cầu giao bổ sung -> Chuyển CHO_GIAO_BO_SUNG
 */
export const handleRequestImportSupplement = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { maPhieu } = req.params;
    const pool = getBranchPool(req, maPhieu);
    const { ghi_chu } = req.body || {};

    const result = await requestImportSupplement(pool, maPhieu, ghi_chu);
    res.status(200).json({
      message: 'Đã yêu cầu Nhà cung cấp giao hàng bổ sung. Phiếu chuyển trạng thái chờ nhận đợt tiếp.',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi yêu cầu giao bổ sung' });
  }
};

// ============================================================================
// HANDLERS CHO LUỒNG XUẤT KHO
// ============================================================================

/**
 * Lấy danh sách phiếu xuất kho (Hỗ trợ lọc theo trạng thái và mã kho)
 */
export const handleListExports = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { vai_tro, ma_kho: userMaKho } = req.user || {};
    const centralRoles = ['ADMIN', 'DIEU_PHOI', 'DATA_ANALYST'];

    let targetKho: string | undefined;
    if (centralRoles.includes(vai_tro as string)) {
      targetKho = (req.query.ma_kho as string) || undefined;
    } else {
      targetKho = userMaKho || req.maKhoContext || 'HN01';
    }

    const trangThai = (req.query.trang_thai as string) || undefined;
    const pool = getBranchPool(req, targetKho);

    const data = await listExportReceipts(pool, targetKho, trangThai);
    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Lỗi lấy danh sách phiếu xuất kho' });
  }
};

/**
 * Tạo yêu cầu xuất kho (Nhân viên kho) -> Trạng thái CHO_DUYET
 */
export const handleExport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const targetKho = req.body?.ma_kho || req.maKhoContext || 'HN01';
    const pool = getBranchPool(req, targetKho);

    const payload = {
      ...req.body,
      ma_kho: targetKho,
    };

    const result = await createExportRequest(pool, payload);
    res.status(201).json({ message: 'Tạo yêu cầu xuất kho thành công (Chờ duyệt)', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi xử lý yêu cầu xuất kho' });
  }
};

/**
 * Duyệt yêu cầu xuất kho (Quản lý kho) -> Trạng thái DA_DUYET
 */
export const handleApproveExport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { maPhieu } = req.params;
    const pool = getBranchPool(req, maPhieu);
    const adjustedItems = req.body?.items;

    const result = await approveExportRequest(pool, maPhieu, adjustedItems);
    res.status(200).json({ message: 'Duyệt phiếu xuất kho thành công', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi duyệt phiếu xuất kho' });
  }
};

/**
 * Từ chối yêu cầu xuất kho (Quản lý kho) -> Trạng thái TU_CHOI
 */
export const handleRejectExport = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { maPhieu } = req.params;
    const pool = getBranchPool(req, maPhieu);
    const { ly_do } = req.body || {};

    const result = await rejectExportRequest(pool, maPhieu, ly_do);
    res.status(200).json({ message: 'Từ chối phiếu xuất kho thành công', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi từ chối phiếu xuất kho' });
  }
};

/**
 * Xác nhận xuất hàng thực tế (Nhân viên kho) -> Trừ kho, ghi ledger, trạng thái DA_XUAT
 */
export const handleConfirmExportShipment = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    const { maPhieu } = req.params;
    const pool = getBranchPool(req, maPhieu);
    const nguoiThucHien = req.user?.ho_ten || req.user?.ma_nguoi_dung || 'NHAN_VIEN_KHO';

    const result = await confirmExportShipment(pool, maPhieu, nguoiThucHien);
    res.status(200).json({ message: 'Xác nhận xuất hàng thành công', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi xác nhận xuất hàng' });
  }
};