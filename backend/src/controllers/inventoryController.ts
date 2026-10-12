import { Response } from 'express';
import { CustomRequest } from '../types';
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

// ============================================================================
// HANDLERS CHO LUỒNG NHẬP KHO
// ============================================================================

/**
 * Lấy danh sách phiếu nhập kho (Hỗ trợ lọc theo trạng thái và mã kho)
 */
export const handleListImports = async (req: CustomRequest, res: Response): Promise<void> => {
  try {
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

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

    const data = await listImportReceipts(req.dbPool, targetKho, trangThai);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const payload = {
      ...req.body,
      ma_kho: req.body.ma_kho || req.maKhoContext || 'HN01',
    };

    const result = await createImportRequest(req.dbPool, payload);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const { maPhieu } = req.params;
    const adjustedItems = req.body?.items;

    const result = await approveImportRequest(req.dbPool, maPhieu, adjustedItems);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const { maPhieu } = req.params;
    const { ly_do } = req.body || {};

    const result = await rejectImportRequest(req.dbPool, maPhieu, ly_do);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const { maPhieu } = req.params;
    const nguoiThucHien = req.user?.ho_ten || req.user?.ma_nguoi_dung || 'NHAN_VIEN_KHO';
    const receivedItems = req.body?.items;

    const result = await confirmImportReceiving(req.dbPool, maPhieu, nguoiThucHien, receivedItems);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const { maPhieu } = req.params;
    const { ly_do } = req.body || {};

    const result = await acceptImportShortage(req.dbPool, maPhieu, ly_do);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const { maPhieu } = req.params;
    const { ghi_chu } = req.body || {};

    const result = await requestImportSupplement(req.dbPool, maPhieu, ghi_chu);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const { vai_tro, ma_kho: userMaKho } = req.user || {};
    const centralRoles = ['ADMIN', 'DIEU_PHOI', 'DATA_ANALYST'];

    let targetKho: string | undefined;
    if (centralRoles.includes(vai_tro as string)) {
      targetKho = (req.query.ma_kho as string) || undefined;
    } else {
      targetKho = userMaKho || req.maKhoContext || 'HN01';
    }

    const trangThai = (req.query.trang_thai as string) || undefined;

    const data = await listExportReceipts(req.dbPool, targetKho, trangThai);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const payload = {
      ...req.body,
      ma_kho: req.body.ma_kho || req.maKhoContext || 'HN01',
    };

    const result = await createExportRequest(req.dbPool, payload);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const { maPhieu } = req.params;
    const adjustedItems = req.body?.items;

    const result = await approveExportRequest(req.dbPool, maPhieu, adjustedItems);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const { maPhieu } = req.params;
    const { ly_do } = req.body || {};

    const result = await rejectExportRequest(req.dbPool, maPhieu, ly_do);
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
    if (!req.dbPool) {
      res.status(500).json({ message: 'Không thể kết nối đến cơ sở dữ liệu chi nhánh' });
      return;
    }

    const { maPhieu } = req.params;
    const nguoiThucHien = req.user?.ho_ten || req.user?.ma_nguoi_dung || 'NHAN_VIEN_KHO';

    const result = await confirmExportShipment(req.dbPool, maPhieu, nguoiThucHien);
    res.status(200).json({ message: 'Xác nhận xuất hàng thành công', data: result });
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Lỗi xác nhận xuất hàng' });
  }
};