import { pools } from '../config/postgresql';

import {
  findTransferById,
  createTransfer,
  updateTransferStatus,
  createSaga,
  getSagaByTransferId,
} from '../repositories/transferRepository';

import {
  acceptTransfer,
} from '../repositories/nodeTransferRepository';

export interface TransferPayload {
  ma_phieu_dc: string;
  kho_xuat: string;
  kho_nhap: string;
  ma_sp: string;
  so_luong: number;
}

export const processTransfer = async (
  payload: TransferPayload & {
    nguoi_tao?: string;
  }
) => {
  const pool = pools.CENTRAL;

  const existing = await findTransferById(
    pool,
    payload.ma_phieu_dc
  );

  if (existing) {
    throw new Error(
      `Phiếu điều chuyển ${payload.ma_phieu_dc} đã tồn tại`
    );
  }

  if (payload.kho_xuat === payload.kho_nhap) {
    throw new Error(
      'Kho xuất và kho nhập không được giống nhau'
    );
  }

  if (!payload.ma_sp) {
    throw new Error('Mã sản phẩm không được để trống');
  }

  if (!payload.so_luong || payload.so_luong <= 0) {
    throw new Error('Số lượng điều chuyển phải lớn hơn 0');
  }

  return createTransfer(pool, {
    ma_phieu_dc: payload.ma_phieu_dc,
    kho_xuat: payload.kho_xuat,
    kho_nhap: payload.kho_nhap,
    ma_sp: payload.ma_sp,
    so_luong: payload.so_luong,
    trang_thai: 'PENDING',
  });
};

export const approveTransfer = async (
  maPhieuDc: string,
  maNguoiDuyet?: string,
  maKhoContext?: string
) => {
  if (!maNguoiDuyet) {
    throw new Error('Không xác định được người duyệt');
  }

  if (!maKhoContext || maKhoContext === 'CENTRAL') {
    throw new Error(
      'Người duyệt phải thuộc một kho chi nhánh'
    );
  }

  const pool = pools.CENTRAL;

  const transfer = await findTransferById(
    pool,
    maPhieuDc
  );

  if (!transfer) {
    throw new Error(
      `Không tìm thấy phiếu điều chuyển ${maPhieuDc}`
    );
  }

  if (
    transfer.kho_xuat.trim().toUpperCase() !==
    maKhoContext.trim().toUpperCase()
  ) {
    throw new Error(
      'Bạn không có quyền duyệt phiếu của kho khác'
    );
  }

  if (
    !['PENDING', 'CREATED', 'CHO_XU_LY'].includes(
      transfer.trang_thai
    )
  ) {
    throw new Error(
      `Phiếu ${maPhieuDc} không ở trạng thái có thể duyệt`
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sagaId = await createSaga(
      client,
      maPhieuDc
    );

    await client.query('COMMIT');

    return {
      ma_phieu_dc: maPhieuDc,
      saga_id: sagaId,
      trang_thai: 'DANG_XU_LY',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
export const shipTransfer = async (
  maPhieuDc: string,
  maNguoiThucHien?: string,
  maKhoContext?: string
) => {
  if (!maNguoiThucHien) {
    throw new Error(
      'Không xác định được nhân viên thực hiện'
    );
  }

  if (!maKhoContext || maKhoContext === 'CENTRAL') {
    throw new Error(
      'Nhân viên xuất hàng phải thuộc kho chi nhánh'
    );
  }

  const pool = pools.CENTRAL;

  const transfer = await findTransferById(
    pool,
    maPhieuDc
  );

  if (!transfer) {
    throw new Error(
      `Không tìm thấy phiếu điều chuyển ${maPhieuDc}`
    );
  }

  if (
    transfer.kho_xuat.trim().toUpperCase() !==
    maKhoContext.trim().toUpperCase()
  ) {
    throw new Error(
      'Bạn không thuộc kho xuất của phiếu này'
    );
  }

  const saga = await getSagaByTransferId(
    pool,
    maPhieuDc
  );

  if (!saga) {
    throw new Error(
      `Phiếu ${maPhieuDc} chưa có Saga`
    );
  }

  if (saga.current_state !== 'WAITING_SOURCE_CONFIRMATION') {
    throw new Error(
      `Saga không ở trạng thái chờ kho nguồn xác nhận: ${saga.current_state}`
    );
  }

  /*
   * TODO:
   * Bước này cần xác định chính xác cơ chế node nguồn
   * xuất hàng và function/procedure tương ứng.
   *
   * Chưa được tự ý trừ tồn kho ở CENTRAL.
   */

  throw new Error(
    'Chưa triển khai nghiệp vụ xuất điều chuyển tại node nguồn'
  );
};

export const receiveTransfer = async (
  maPhieuDc: string,
  maNguoiThucHien?: string,
  maKhoContext?: string
) => {
  if (!maNguoiThucHien) {
    throw new Error(
      'Không xác định được nhân viên thực hiện'
    );
  }

  if (!maKhoContext || maKhoContext === 'CENTRAL') {
    throw new Error(
      'Nhân viên nhận hàng phải thuộc kho chi nhánh'
    );
  }

  const pool = pools.CENTRAL;

  const transfer = await findTransferById(
    pool,
    maPhieuDc
  );

  if (!transfer) {
    throw new Error(
      `Không tìm thấy phiếu điều chuyển ${maPhieuDc}`
    );
  }

  if (
    transfer.kho_nhap.trim().toUpperCase() !==
    maKhoContext.trim().toUpperCase()
  ) {
    throw new Error(
      'Bạn không thuộc kho nhập của phiếu này'
    );
  }

  const saga = await getSagaByTransferId(
    pool,
    maPhieuDc
  );

  if (!saga) {
    throw new Error(
      `Phiếu ${maPhieuDc} chưa có Saga`
    );
  }

  if (saga.current_state !== 'IN_TRANSIT') {
    throw new Error(
      `Saga chưa ở trạng thái đang vận chuyển: ${saga.current_state}`
    );
  }

  /*
   * TODO:
   * Cần xác định function/procedure nhận hàng trong Saga SQL
   * trước khi cập nhật COMPLETED.
   */

  throw new Error(
    'Chưa triển khai nghiệp vụ nhận điều chuyển tại node đích'
  );
};
export const confirmSourceTransfer = async (
  maPhieuDc: string,
  maNguoiDung?: string,
  maKhoContext?: string
) => {
  if (!maNguoiDung) {
    throw new Error('Không xác định được người xác nhận');
  }

  if (!maKhoContext || maKhoContext === 'CENTRAL') {
    throw new Error(
      'Người xác nhận phải thuộc một kho chi nhánh'
    );
  }

  const pool = pools.CENTRAL;

  const saga = await getSagaByTransferId(
    pool,
    maPhieuDc
  );

  if (!saga) {
    throw new Error(
      `Phiếu ${maPhieuDc} chưa có Saga`
    );
  }
  if (saga.current_state !== 'WAITING_SOURCE_CONFIRMATION') {
    throw new Error(
      `Saga không ở trạng thái chờ kho nguồn xác nhận: ${saga.current_state}`
    );
  }
  await acceptTransfer(pool, {
    saga_id: saga.saga_id,
    global_id: saga.ma_giao_dich_global,
    ma_phieu_dc: saga.ma_phieu_dc,
    ma_kho: saga.kho_xuat,
    ma_sp: saga.ma_sp,
    so_luong: saga.so_luong_yeu_cau,
  });
  return {
    success: true,
    ma_phieu_dc: saga.ma_phieu_dc,
    saga_id: saga.saga_id,
    global_id: saga.ma_giao_dich_global,
    ma_kho: saga.kho_xuat,
    event_type: 'TRANSFER_ACCEPTED',
  };
};