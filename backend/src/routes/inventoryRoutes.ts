import { Router } from 'express';
import {
  handleListImports,
  handleImport,
  handleApproveImport,
  handleRejectImport,
  handleConfirmImportReceiving,
  handleAcceptImportShortage,
  handleRequestImportSupplement,
  handleListExports,
  handleExport,
  handleApproveExport,
  handleRejectExport,
  handleConfirmExportShipment,
} from '../controllers/inventoryController';
import { auth } from '../middlewares/auth';
import { roleGuard } from '../middlewares/roleGuard';
import { dbSelector } from '../middlewares/dbSelector';

const router = Router();

// Áp dụng xác thực và chọn database node cho toàn bộ route kho
router.use(auth);
router.use(dbSelector);

// ----------------------------------------------------
// LUỒNG NHẬP KHO (VÒNG ĐỜI 3 GIAI ĐOẠN)
// ----------------------------------------------------
// Đọc danh sách phiếu nhập kho (Hỗ trợ theo dõi vòng đời phiếu)
router.get(
  '/import',
  roleGuard('NHAN_VIEN_KHO', 'QUAN_LY_KHO', 'ADMIN', 'DIEU_PHOI', 'DATA_ANALYST'),
  handleListImports
);

// Giai đoạn 1: Nhân viên tạo yêu cầu nhập (CHO_DUYET)
router.post(
  '/import',
  roleGuard('NHAN_VIEN_KHO'),
  handleImport
);

// Giai đoạn 1 (Nhánh Quản lý): Duyệt yêu cầu nhập (DA_DUYET)
router.post(
  '/import/:maPhieu/approve',
  roleGuard('QUAN_LY_KHO'),
  handleApproveImport
);

// Giai đoạn 1 (Nhánh Quản lý): Từ chối yêu cầu nhập (TU_CHOI)
router.post(
  '/import/:maPhieu/reject',
  roleGuard('QUAN_LY_KHO'),
  handleRejectImport
);

// Giai đoạn 2: Tiếp nhận & Kiểm đếm thực tế (Đủ 100% -> DA_NHAP; Thiếu -> THIEU_HANG)
router.post(
  '/import/:maPhieu/confirm-receive',
  roleGuard('NHAN_VIEN_KHO'),
  handleConfirmImportReceiving
);

// Giai đoạn 3 (Quản lý xử lý chênh lệch - Nhánh A): Chấp nhận thiếu hàng -> Hoàn tất DA_NHAP
router.post(
  '/import/:maPhieu/accept-shortage',
  roleGuard('QUAN_LY_KHO'),
  handleAcceptImportShortage
);

// Giai đoạn 3 (Quản lý xử lý chênh lệch - Nhánh B): Yêu cầu giao bổ sung -> Chuyển CHO_GIAO_BO_SUNG
router.post(
  '/import/:maPhieu/request-supplement',
  roleGuard('QUAN_LY_KHO'),
  handleRequestImportSupplement
);

// ----------------------------------------------------
// LUỒNG XUẤT KHO (VÒNG ĐỜI 3 GIAI ĐOẠN)
// ----------------------------------------------------
// Đọc danh sách phiếu xuất kho (Hỗ trợ theo dõi vòng đời phiếu)
router.get(
  '/export',
  roleGuard('NHAN_VIEN_KHO', 'QUAN_LY_KHO', 'ADMIN', 'DIEU_PHOI', 'DATA_ANALYST'),
  handleListExports
);

// Giai đoạn 1: Nhân viên tạo yêu cầu xuất (CHO_DUYET)
router.post(
  '/export',
  roleGuard('NHAN_VIEN_KHO'),
  handleExport
);

// Giai đoạn 2 (Nhánh Quản lý): Duyệt yêu cầu xuất (DA_DUYET)
router.post(
  '/export/:maPhieu/approve',
  roleGuard('QUAN_LY_KHO'),
  handleApproveExport
);

// Giai đoạn 2 (Nhánh Quản lý): Từ chối yêu cầu xuất (TU_CHOI)
router.post(
  '/export/:maPhieu/reject',
  roleGuard('QUAN_LY_KHO'),
  handleRejectExport
);

// Giai đoạn 3: Nhân viên xác nhận xuất hàng thực tế (DA_XUAT)
router.post(
  '/export/:maPhieu/confirm-ship',
  roleGuard('NHAN_VIEN_KHO'),
  handleConfirmExportShipment
);

export default router;