import { Pool } from 'pg';

import {
  ImportPayload,
  ExportPayload,
  InventoryItemInput,
  ReceiveItemInput,
} from '../types';

import {
  checkSupplierExists,
  checkProductExists,
  insertImportReceipt,
  insertImportDetail,
  increaseStock,
  increaseImportHistory,
  insertStockLedgerImport,
  getImportReceiptForUpdate,
  getImportReceiptDetails,
  updateImportReceiptStatus,
  replaceImportReceiptDetails,
  updateImportDetailQuantity,
  getImportedQuantitiesFromLedger,
  getImportReceiptsList,
} from '../repositories/importRepository';

import {
  getCurrentStockForUpdate,
  insertExportReceipt,
  insertExportDetail,
  decreaseStock,
  increaseExportHistory,
  insertStockLedger,
  getExportReceiptForUpdate,
  getExportReceiptDetails,
  updateExportReceiptStatus,
  replaceExportReceiptDetails,
  getExportReceiptsList,
} from '../repositories/exportRepository';

import { logInventoryEvent } from './eventLogger';

// ============================================================================
// LUỒNG NHẬP KHO (IMPORT LIFECYCLE)
// ============================================================================

/**
 * Giai đoạn 1: Nhân viên kho tạo yêu cầu nhập kho -> Trạng thái CHO_DUYET
 * Kiểm tra hợp lệ Nhà cung cấp và Sản phẩm trước khi lưu.
 * Chưa tăng tồn kho hay ghi sổ cái ở bước này.
 */
export const createImportRequest = async (
  pool: Pool,
  payload: ImportPayload
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      ma_phieu_nhap,
      ma_kho,
      ma_ncc,
      items,
    } = payload;

    if (!items || items.length === 0) {
      throw new Error('Danh sách hàng nhập không được rỗng');
    }

    // 1. Kiểm tra Nhà cung cấp hợp lệ
    const supplierOk = await checkSupplierExists(client, ma_ncc);
    if (!supplierOk) {
      throw new Error(`Nhà cung cấp "${ma_ncc}" không tồn tại trong hệ thống`);
    }

    // 2. Kiểm tra từng mặt hàng hợp lệ và trùng lặp
    const seenSp = new Set<string>();
    for (const item of items) {
      if (seenSp.has(item.ma_sp)) {
        throw new Error(`Sản phẩm "${item.ma_sp}" bị trùng lặp trong danh sách nhập`);
      }
      seenSp.add(item.ma_sp);

      if (item.so_luong <= 0) {
        throw new Error(`Số lượng nhập sản phẩm ${item.ma_sp} phải lớn hơn 0`);
      }
      const productOk = await checkProductExists(client, item.ma_sp);
      if (!productOk) {
        throw new Error(`Sản phẩm "${item.ma_sp}" không tồn tại trong danh mục`);
      }
    }

    // 3. Tạo phiếu nhập với trạng thái chờ duyệt
    await insertImportReceipt(
      client,
      ma_phieu_nhap,
      ma_kho,
      ma_ncc,
      'CHO_DUYET'
    );

    for (const item of items) {
      await insertImportDetail(
        client,
        ma_phieu_nhap,
        item
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      ma_phieu_nhap,
      trang_thai: 'CHO_DUYET',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Giai đoạn 2 (Nhánh Quản lý): Duyệt yêu cầu nhập kho
 * Chỉ phiếu CHO_DUYET mới được duyệt -> chuyển sang DA_DUYET.
 * Hỗ trợ điều chỉnh số lượng/đơn giá nếu Quản lý gửi items mới.
 */
export const approveImportRequest = async (
  pool: Pool,
  maPhieuNhap: string,
  adjustedItems?: InventoryItemInput[]
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const receipt = await getImportReceiptForUpdate(client, maPhieuNhap);
    if (!receipt) {
      throw new Error(`Không tìm thấy phiếu nhập ${maPhieuNhap}`);
    }

    if (receipt.trang_thai !== 'CHO_DUYET') {
      throw new Error(`Chỉ có thể duyệt phiếu ở trạng thái CHO_DUYET. Hiện tại: ${receipt.trang_thai}`);
    }

    if (adjustedItems && adjustedItems.length > 0) {
      const seenSp = new Set<string>();
      for (const item of adjustedItems) {
        if (seenSp.has(item.ma_sp)) {
          throw new Error(`Sản phẩm "${item.ma_sp}" bị trùng lặp trong danh sách điều chỉnh`);
        }
        seenSp.add(item.ma_sp);

        if (item.so_luong <= 0) {
          throw new Error(`Số lượng điều chỉnh sản phẩm ${item.ma_sp} phải lớn hơn 0`);
        }
        const productOk = await checkProductExists(client, item.ma_sp);
        if (!productOk) {
          throw new Error(`Sản phẩm điều chỉnh "${item.ma_sp}" không tồn tại`);
        }
      }
      await replaceImportReceiptDetails(client, maPhieuNhap, adjustedItems);
    }

    await updateImportReceiptStatus(client, maPhieuNhap, 'DA_DUYET');

    await client.query('COMMIT');

    return {
      success: true,
      ma_phieu_nhap: maPhieuNhap,
      trang_thai: 'DA_DUYET',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Giai đoạn 2 (Nhánh Quản lý): Từ chối yêu cầu nhập kho
 * Chỉ phiếu CHO_DUYET mới được từ chối -> chuyển sang TU_CHOI.
 * Tồn kho và sổ cái không thay đổi.
 */
export const rejectImportRequest = async (
  pool: Pool,
  maPhieuNhap: string,
  lyDo?: string
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const receipt = await getImportReceiptForUpdate(client, maPhieuNhap);
    if (!receipt) {
      throw new Error(`Không tìm thấy phiếu nhập ${maPhieuNhap}`);
    }

    if (receipt.trang_thai !== 'CHO_DUYET') {
      throw new Error(`Chỉ có thể từ chối phiếu ở trạng thái CHO_DUYET. Hiện tại: ${receipt.trang_thai}`);
    }

    await updateImportReceiptStatus(client, maPhieuNhap, 'TU_CHOI');

    await client.query('COMMIT');

    return {
      success: true,
      ma_phieu_nhap: maPhieuNhap,
      trang_thai: 'TU_CHOI',
      ly_do: lyDo,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Giai đoạn 2: Tiếp nhận và kiểm đếm thực tế
 * Hỗ trợ nhận diện số lượng thực nhận (receivedItems).
 * Trạng thái cho phép: DA_DUYET hoặc CHO_GIAO_BO_SUNG.
 *
 * Logic đối chiếu:
 * - Nếu nhận đủ 100%: Tăng tồn kho, ghi ledger, đổi DA_NHAP (Hoàn tất).
 * - Nếu nhận thiếu: Tăng tồn kho đợt này, ghi ledger đợt này, chuyển THIEU_HANG (Chờ quản lý quyết định).
 */
export const confirmImportReceiving = async (
  pool: Pool,
  maPhieuNhap: string,
  nguoiThucHien?: string,
  receivedItems?: ReceiveItemInput[]
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const receipt = await getImportReceiptForUpdate(client, maPhieuNhap);
    if (!receipt) {
      throw new Error(`Không tìm thấy phiếu nhập ${maPhieuNhap}`);
    }

    // Chặn xác nhận lặp nếu phiếu đã hoàn tất
    if (receipt.trang_thai === 'DA_NHAP' || receipt.trang_thai === 'HOAN_THANH') {
      throw new Error(`Phiếu nhập ${maPhieuNhap} đã hoàn tất nhập trước đó. Không thể thực hiện lại.`);
    }

    // Chỉ cho phép kiểm đếm khi phiếu ở DA_DUYET hoặc CHO_GIAO_BO_SUNG
    if (receipt.trang_thai !== 'DA_DUYET' && receipt.trang_thai !== 'CHO_GIAO_BO_SUNG') {
      throw new Error(`Phiếu nhập ở trạng thái "${receipt.trang_thai}" không được phép thực hiện kiểm đếm`);
    }

    const approvedDetails = await getImportReceiptDetails(client, maPhieuNhap);
    if (approvedDetails.length === 0) {
      throw new Error(`Phiếu nhập ${maPhieuNhap} không có chi tiết mặt hàng`);
    }

    // Lấy số lượng đã nhập thực tế ở các đợt trước từ stock_ledger
    const alreadyImportedMap = await getImportedQuantitiesFromLedger(client, maPhieuNhap);

    // Xác định số lượng nhận đợt này
    const itemsToProcess: Array<{ ma_sp: string; qtyInThisBatch: number; approvedQty: number; totalImportedSoFar: number }> = [];
    let hasShortage = false;

    if (receivedItems && receivedItems.length > 0) {
      // Validate receivedItems
      const receivedMap: Record<string, number> = {};
      const seenSp = new Set<string>();

      for (const item of receivedItems) {
        if (seenSp.has(item.ma_sp)) {
          throw new Error(`Sản phẩm "${item.ma_sp}" bị trùng lặp trong danh sách thực nhận`);
        }
        seenSp.add(item.ma_sp);

        if (item.so_luong_thuc_nhan < 0) {
          throw new Error(`Số lượng thực nhận sản phẩm ${item.ma_sp} không được âm`);
        }
        receivedMap[item.ma_sp] = Number(item.so_luong_thuc_nhan);
      }

      for (const detail of approvedDetails) {
        const approvedQty = Number(detail.so_luong);
        const prevImported = alreadyImportedMap[detail.ma_sp] || 0;
        const remainingNeeded = approvedQty - prevImported;

        const thisBatchQty = receivedMap[detail.ma_sp] !== undefined ? receivedMap[detail.ma_sp] : remainingNeeded;

        // Không cho phép nhận vượt số lượng đã duyệt
        if (thisBatchQty > remainingNeeded) {
          throw new Error(
            `Số lượng thực nhận (${thisBatchQty}) vượt quá số lượng cần nhận (${remainingNeeded}) của sản phẩm ${detail.ma_sp}`
          );
        }

        const totalAfterThis = prevImported + thisBatchQty;
        if (totalAfterThis < approvedQty) {
          hasShortage = true;
        }

        itemsToProcess.push({
          ma_sp: detail.ma_sp,
          qtyInThisBatch: thisBatchQty,
          approvedQty,
          totalImportedSoFar: totalAfterThis,
        });
      }
    } else {
      // Nếu không truyền receivedItems, mặc định nhận đủ số lượng còn lại
      for (const detail of approvedDetails) {
        const approvedQty = Number(detail.so_luong);
        const prevImported = alreadyImportedMap[detail.ma_sp] || 0;
        const remainingNeeded = approvedQty - prevImported;

        itemsToProcess.push({
          ma_sp: detail.ma_sp,
          qtyInThisBatch: remainingNeeded,
          approvedQty,
          totalImportedSoFar: approvedQty,
        });
      }
    }

    // Tăng tồn kho và ghi sổ cái cho số lượng thực nhận đợt này
    for (const item of itemsToProcess) {
      if (item.qtyInThisBatch > 0) {
        await increaseStock(client, receipt.ma_kho, { ma_sp: item.ma_sp, so_luong: item.qtyInThisBatch });
        await increaseImportHistory(client, receipt.ma_kho, { ma_sp: item.ma_sp, so_luong: item.qtyInThisBatch });
        await insertStockLedgerImport(
          client,
          receipt.ma_kho,
          item.ma_sp,
          item.qtyInThisBatch,
          maPhieuNhap,
          nguoiThucHien,
          `Kiểm đếm nhập hàng theo phiếu ${maPhieuNhap} (${hasShortage ? 'Nhận đợt/Thiếu' : 'Nhận đủ'})`
        );
      }
    }

    // Cập nhật trạng thái phiếu
    let nextStatus: string;
    if (hasShortage) {
      nextStatus = 'THIEU_HANG';
    } else {
      nextStatus = 'DA_NHAP';
    }
    await updateImportReceiptStatus(client, maPhieuNhap, nextStatus);

    await client.query('COMMIT');

    // Audit log
    await logInventoryEvent({
      type: 'IMPORT',
      ma_kho: receipt.ma_kho,
      ma_phieu: maPhieuNhap,
      items: itemsToProcess.map(i => ({ ma_sp: i.ma_sp, so_luong: i.qtyInThisBatch, don_gia: 0 })),
    });

    return {
      success: true,
      ma_phieu_nhap: maPhieuNhap,
      trang_thai: nextStatus,
      has_shortage: hasShortage,
      details: itemsToProcess.map(i => ({
        ma_sp: i.ma_sp,
        thuc_nhan_dot_nay: i.qtyInThisBatch,
        tong_da_nhan: i.totalImportedSoFar,
        yeu_cau: i.approvedQty,
        con_thieu: i.approvedQty - i.totalImportedSoFar,
      })),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Giai đoạn 3 (Quản lý - Nhánh A): Chấp nhận thiếu hàng
 * Chỉ phiếu THIEU_HANG mới được gọi.
 * - Điều chỉnh ct_phieu_nhap.so_luong bằng tổng số lượng thực tế đã nhận.
 * - Chuyển trạng thái sang DA_NHAP (Hoàn tất, khớp ETL).
 * - Không cộng thêm tồn kho vì tồn kho đã cộng đúng số lượng thực nhận ở bước kiểm đếm.
 */
export const acceptImportShortage = async (
  pool: Pool,
  maPhieuNhap: string,
  lyDo?: string
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const receipt = await getImportReceiptForUpdate(client, maPhieuNhap);
    if (!receipt) {
      throw new Error(`Không tìm thấy phiếu nhập ${maPhieuNhap}`);
    }

    if (receipt.trang_thai !== 'THIEU_HANG') {
      throw new Error(`Chỉ có thể chấp nhận thiếu cho phiếu ở trạng thái THIEU_HANG. Hiện tại: ${receipt.trang_thai}`);
    }

    // Lấy tổng số lượng thực nhận từ ledger
    const importedMap = await getImportedQuantitiesFromLedger(client, maPhieuNhap);
    const details = await getImportReceiptDetails(client, maPhieuNhap);

    // Cập nhật ct_phieu_nhap.so_luong về đúng số lượng thực nhận để ETL đồng bộ chuẩn
    for (const detail of details) {
      const actualQty = importedMap[detail.ma_sp] || 0;
      await updateImportDetailQuantity(client, maPhieuNhap, detail.ma_sp, actualQty);
    }

    // Hoàn tất phiếu -> DA_NHAP
    await updateImportReceiptStatus(client, maPhieuNhap, 'DA_NHAP');

    await client.query('COMMIT');

    return {
      success: true,
      ma_phieu_nhap: maPhieuNhap,
      trang_thai: 'DA_NHAP',
      decision: 'ACCEPT_SHORTAGE',
      ly_do: lyDo,
      final_items: details.map(d => ({
        ma_sp: d.ma_sp,
        so_luong_chot: importedMap[d.ma_sp] || 0,
      })),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Giai đoạn 3 (Quản lý - Nhánh B): Yêu cầu nhà cung cấp giao bổ sung
 * Chỉ phiếu THIEU_HANG mới được gọi.
 * - Chuyển trạng thái phiếu sang CHO_GIAO_BO_SUNG.
 * - Giữ nguyên chi tiết phiếu và lịch sử ledger.
 * - Khi hàng bổ sung đến, Nhân viên kho tiếp tục gọi confirmImportReceiving để kiểm đếm tiếp.
 */
export const requestImportSupplement = async (
  pool: Pool,
  maPhieuNhap: string,
  ghiChu?: string
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const receipt = await getImportReceiptForUpdate(client, maPhieuNhap);
    if (!receipt) {
      throw new Error(`Không tìm thấy phiếu nhập ${maPhieuNhap}`);
    }

    if (receipt.trang_thai !== 'THIEU_HANG') {
      throw new Error(`Chỉ có thể yêu cầu giao bổ sung cho phiếu ở trạng thái THIEU_HANG. Hiện tại: ${receipt.trang_thai}`);
    }

    await updateImportReceiptStatus(client, maPhieuNhap, 'CHO_GIAO_BO_SUNG');

    await client.query('COMMIT');

    const importedMap = await getImportedQuantitiesFromLedger(client, maPhieuNhap);
    const details = await getImportReceiptDetails(client, maPhieuNhap);

    return {
      success: true,
      ma_phieu_nhap: maPhieuNhap,
      trang_thai: 'CHO_GIAO_BO_SUNG',
      decision: 'REQUEST_SUPPLEMENT',
      ghi_chu: ghiChu,
      shortage_status: details.map(d => ({
        ma_sp: d.ma_sp,
        yeu_cau: Number(d.so_luong),
        da_nhan: importedMap[d.ma_sp] || 0,
        con_thieu: Number(d.so_luong) - (importedMap[d.ma_sp] || 0),
      })),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Giữ lại processImport để tương thích ngược nếu còn code cũ gọi
export const processImport = createImportRequest;

/**
 * Đọc danh sách phiếu nhập kho theo kho và trạng thái
 */
export const listImportReceipts = async (
  pool: Pool,
  maKho?: string,
  trangThai?: string
) => {
  const client = await pool.connect();
  try {
    return await getImportReceiptsList(client, maKho, trangThai);
  } finally {
    client.release();
  }
};

/**
 * Đọc danh sách phiếu xuất kho theo kho và trạng thái
 */
export const listExportReceipts = async (
  pool: Pool,
  maKho?: string,
  trangThai?: string
) => {
  const client = await pool.connect();
  try {
    return await getExportReceiptsList(client, maKho, trangThai);
  } finally {
    client.release();
  }
};

// ============================================================================
// LUỒNG XUẤT KHO (EXPORT LIFECYCLE)
// ============================================================================

/**
 * Giai đoạn 1: Nhân viên kho tạo yêu cầu xuất hàng -> Trạng thái CHO_DUYET
 * Chưa trừ tồn kho hay ghi sổ cái ở bước này.
 */
export const createExportRequest = async (
  pool: Pool,
  payload: ExportPayload
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      ma_phieu_xuat,
      ma_kho,
      ma_kh,
      items,
    } = payload;

    if (!items || items.length === 0) {
      throw new Error('Danh sách hàng xuất không được rỗng');
    }

    // Tạo phiếu xuất với trạng thái chờ duyệt
    await insertExportReceipt(
      client,
      ma_phieu_xuat,
      ma_kho,
      ma_kh,
      'CHO_DUYET'
    );

    for (const item of items) {
      if (item.so_luong <= 0) {
        throw new Error(`Số lượng xuất sản phẩm ${item.ma_sp} phải lớn hơn 0`);
      }
      await insertExportDetail(
        client,
        ma_phieu_xuat,
        item
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      ma_phieu_xuat,
      trang_thai: 'CHO_DUYET',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Giai đoạn 1 (Nhánh Quản lý): Duyệt yêu cầu xuất hàng
 * Chỉ phiếu CHO_DUYET mới được duyệt -> chuyển sang DA_DUYET.
 * Hỗ trợ nhánh Quản lý điều chỉnh số lượng nếu truyền items mới.
 */
export const approveExportRequest = async (
  pool: Pool,
  maPhieuXuat: string,
  adjustedItems?: InventoryItemInput[]
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const receipt = await getExportReceiptForUpdate(client, maPhieuXuat);
    if (!receipt) {
      throw new Error(`Không tìm thấy phiếu xuất ${maPhieuXuat}`);
    }

    if (receipt.trang_thai !== 'CHO_DUYET') {
      throw new Error(`Chỉ có thể duyệt phiếu ở trạng thái CHO_DUYET. Hiện tại: ${receipt.trang_thai}`);
    }

    // Nếu có điều chỉnh số lượng
    if (adjustedItems && adjustedItems.length > 0) {
      for (const item of adjustedItems) {
        if (item.so_luong <= 0) {
          throw new Error(`Số lượng điều chỉnh sản phẩm ${item.ma_sp} phải lớn hơn 0`);
        }
      }
      await replaceExportReceiptDetails(client, maPhieuXuat, adjustedItems);
    }

    await updateExportReceiptStatus(client, maPhieuXuat, 'DA_DUYET');

    await client.query('COMMIT');

    return {
      success: true,
      ma_phieu_xuat: maPhieuXuat,
      trang_thai: 'DA_DUYET',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Giai đoạn 1 (Nhánh Quản lý): Từ chối yêu cầu xuất hàng
 * Chỉ phiếu CHO_DUYET mới được từ chối -> chuyển sang TU_CHOI.
 * Tồn kho và sổ cái không thay đổi.
 */
export const rejectExportRequest = async (
  pool: Pool,
  maPhieuXuat: string,
  lyDo?: string
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const receipt = await getExportReceiptForUpdate(client, maPhieuXuat);
    if (!receipt) {
      throw new Error(`Không tìm thấy phiếu xuất ${maPhieuXuat}`);
    }

    if (receipt.trang_thai !== 'CHO_DUYET') {
      throw new Error(`Chỉ có thể từ chối phiếu ở trạng thái CHO_DUYET. Hiện tại: ${receipt.trang_thai}`);
    }

    await updateExportReceiptStatus(client, maPhieuXuat, 'TU_CHOI');

    await client.query('COMMIT');

    return {
      success: true,
      ma_phieu_xuat: maPhieuXuat,
      trang_thai: 'TU_CHOI',
      ly_do: lyDo,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Giai đoạn 2 & 3: Nhân viên kho thực hiện xác nhận xuất hàng thực tế
 * Chỉ phiếu DA_DUYET mới được xác nhận.
 * - Kiểm tra tồn kho thời gian thực với FOR UPDATE.
 * - Nếu không đủ hàng -> ném lỗi và rollback toàn bộ (không để lại thay đổi dở dang).
 * - Nếu đủ hàng: trừ tồn kho, ghi lich_su_ton_kho, ghi stock_ledger (loai='XUAT', so_luong_thay_doi âm).
 * - Cập nhật trạng thái phiếu thành DA_XUAT (khớp với ETL).
 * Tất cả trong 1 Transaction duy nhất.
 */
export const confirmExportShipment = async (
  pool: Pool,
  maPhieuXuat: string,
  nguoiThucHien?: string
) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const receipt = await getExportReceiptForUpdate(client, maPhieuXuat);
    if (!receipt) {
      throw new Error(`Không tìm thấy phiếu xuất ${maPhieuXuat}`);
    }

    // Ngăn chặn xác nhận lặp
    if (receipt.trang_thai === 'DA_XUAT' || receipt.trang_thai === 'HOAN_THANH') {
      throw new Error(`Phiếu xuất ${maPhieuXuat} đã được xác nhận xuất trước đó. Không thể thực hiện lại.`);
    }

    if (receipt.trang_thai !== 'DA_DUYET') {
      throw new Error(`Phiếu xuất phải ở trạng thái DA_DUYET mới được xuất hàng. Trạng thái hiện tại: ${receipt.trang_thai}`);
    }

    const items = await getExportReceiptDetails(client, maPhieuXuat);
    if (items.length === 0) {
      throw new Error(`Phiếu xuất ${maPhieuXuat} không có chi tiết mặt hàng`);
    }

    // 1. Kiểm tra tồn kho lần cuối với FOR UPDATE
    for (const item of items) {
      const currentStock = await getCurrentStockForUpdate(
        client,
        receipt.ma_kho,
        item.ma_sp
      );

      if (currentStock < item.so_luong) {
        throw new Error(
          `Sản phẩm ${item.ma_sp} không đủ tồn kho để xuất ` +
          `(Hiện có: ${currentStock}, Cần xuất: ${item.so_luong})`
        );
      }
    }

    // 2. Trừ tồn kho, ghi lịch sử và ghi sổ cái stock_ledger
    for (const item of items) {
      await decreaseStock(client, receipt.ma_kho, item);
      await increaseExportHistory(client, receipt.ma_kho, item);
      await insertStockLedger(
        client,
        receipt.ma_kho,
        item.ma_sp,
        item.so_luong,
        maPhieuXuat,
        nguoiThucHien,
        `Xuất hàng theo phiếu ${maPhieuXuat}`
      );
    }

    // 3. Cập nhật trạng thái phiếu sang DA_XUAT (khớp ETL Central)
    await updateExportReceiptStatus(client, maPhieuXuat, 'DA_XUAT');

    await client.query('COMMIT');

    // Ghi log phi cấu trúc vào MongoDB (audit log)
    await logInventoryEvent({
      type: 'EXPORT',
      ma_kho: receipt.ma_kho,
      ma_phieu: maPhieuXuat,
      items: items.map(i => ({ ma_sp: i.ma_sp, so_luong: i.so_luong, don_gia: Number(i.don_gia) })),
    });

    return {
      success: true,
      ma_phieu_xuat: maPhieuXuat,
      trang_thai: 'DA_XUAT',
      items_count: items.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Giữ lại hàm processExport cũ để tương thích ngược nếu còn code gọi trực tiếp
export const processExport = createExportRequest;